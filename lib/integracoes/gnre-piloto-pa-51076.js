'use strict';
// Piloto de UMA transmissao GNRE PA/100102 NF-e 51076 em HOMOLOGACAO.
// DESABILITADO por padrao. So abre com hashes de chave NF-e + lote fixados
// em envs exclusivas da branch Preview e autorizacao manual do administrador.
// Protecao contra concorrencia: trava persistente por NF-e alem da idempotencia do lote.
// Nao e emissao em producao, nao comprova tributo nem gera guia pagavel.
const crypto=require('node:crypto');
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {prepararPreEnvioPa,montarGuiaPa}=require('./gnre-preenvio-pa');
const {montarPlanoRecepcao,executarRecepcao}=require('./gnre-recepcao-executor');
const {credenciais}=require('./gnre-certificado');
const repo=require('./gnre-idempotencia-repo');
const CONFIRMACAO='TRANSMITIR_HOMOLOGACAO_PA_51076';
const BRANCH='gnre-xml-calculos-integracao';
const CHAVE_ENV='GNRE_PILOTO_PA_51076_CHAVE_SHA256';
const LOTE_ENV='GNRE_PILOTO_PA_51076_LOTE_SHA256';
const FLAG_ENV='GNRE_PILOTO_PA_51076_ENVIO';
function hash(x){return crypto.createHash('sha256').update(String(x),'utf8').digest('hex');}
function hashValido(x){return /^[a-f0-9]{64}$/.test(String(x||''));}
function travaNfe(){
 const h=String(process.env[CHAVE_ENV]||'');
 return hashValido(h)?'gnre:trava-pa-51076:'+h.slice(0,32):null;
}
function permitido(){
 return process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF===BRANCH
  &&process.env.GNRE_AMBIENTE==='homologacao'
  &&process.env.GNRE_HOMOLOGACAO_EXECUTOR==='1'
  &&process.env[FLAG_ENV]==='1'
  &&hashValido(process.env[CHAVE_ENV])&&hashValido(process.env[LOTE_ENV]);
}
async function status(res){
 if(!permitido())return json(res,200,{ok:true,habilitado:false,
  motivo:'Janela PA/51076 nao liberada: requer revisao fiscal e hashes fixados no servidor.',
  ambiente:'homologacao',transmissao:false});
 try{
  const trava=await repo.buscar(travaNfe());
  const reg=await supabaseRest('gnre_guias_arquivo',{
   query:'?numero_nfe=eq.51076&uf_favorecida=eq.PA&receita=eq.100102&ambiente=eq.homologacao'
    +'&select=situacao&limit=1'
  });
  if(!Array.isArray(reg))throw new Error('consulta_nao_confirmada');
  return json(res,200,{ok:true,habilitado:!trava&&!reg.length,
   bloqueado:Boolean(trava||reg.length),estado:trava?.estado||(reg.length?'guia_ja_registrada':null),
   ambiente:'homologacao',transmissao:false});
 }catch(_e){
  return json(res,503,{ok:false,habilitado:false,
   erro:'Nao foi possivel verificar a trava de idempotencia. Nao transmitir.',
   transmissao:false});
 }
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(req.body?.modo==='status')return status(res);
 if(!permitido())return json(res,403,{ok:false,erro:'Transmissao PA/51076 nao liberada no servidor. Nenhuma guia transmitida.',transmissao:false});
 if(req.body?.autorizacao_usuario!==true||req.body?.confirmacao!==CONFIRMACAO)
  return json(res,400,{ok:false,erro:'Autorizacao manual e confirmacao especifica obrigatorias.',transmissao:false});
 let nfe,pre,guia,plano;
 try{
  nfe=req.body?.nfe;
  pre=prepararPreEnvioPa({nfe,fiscal:req.body?.fiscal});
  if(!pre.apto_para_revisao)return json(res,400,{ok:false,erro:'Pre-envio PA possui pendencias.',
   pendencias:pre.pendencias,transmissao:false});
  if(nfe.numero!=='51076'||nfe.valorDifal!=='21.10'||nfe.valorFcp!=='0.00'
    ||hash(nfe.chave)!==process.env[CHAVE_ENV])
   return json(res,403,{ok:false,erro:'NF-e ou valor diferente do piloto PA autorizado.',transmissao:false});
  guia=montarGuiaPa(nfe,req.body.fiscal);
  plano=montarPlanoRecepcao([guia]);
  if(pre.plano.lote_sha256!==plano.lote_sha256
    ||req.body.lote_sha256!==plano.lote_sha256
    ||process.env[LOTE_ENV]!==plano.lote_sha256)
   return json(res,409,{ok:false,erro:'Lote difere da revisao fiscal aprovada. Revalidar sem transmitir.',transmissao:false});
 }catch(_e){
  return json(res,400,{ok:false,erro:'Dados da NF-e/guia invalidos. Nenhuma guia transmitida.',transmissao:false});
 }
 try{
  const [jaTentado,existentes,cert]=await Promise.all([
   repo.buscar(travaNfe()),
   supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+encodeURIComponent(nfe.chave)
    +'&receita=eq.100102&select=ambiente,situacao&limit=5'}),
   credenciais()
  ]);
  if(jaTentado||!Array.isArray(existentes)||existentes.length)
   return json(res,409,{ok:false,bloqueado:true,estado:jaTentado?.estado||'registro_existente_ou_inconclusivo',
    aviso:'Ja houve tentativa ou registro desta nota. Consultar/reconciliar; NAO reenviar.',transmissao:false});
  if(cert?.meta?.expirado!==false||cert?.meta?.cnpj!==nfe.cnpjEmitente)
   return json(res,403,{ok:false,erro:'Certificado A1 nao vigente ou de outro CNPJ.',transmissao:false});
  // A reserva LOGICA e unica para a NF-e, mesmo que vencimento/lote mudem.
  const reservado=await repo.reservar({chave:travaNfe(),servico:'trava_piloto_pa_51076',
   lote_sha256:plano.lote_sha256,ator:'administrador-piloto-pa',recibo_mascarado:''});
  if(!reservado?.ok)
   return json(res,409,{ok:false,bloqueado:true,
    aviso:'A NF-e 51076 ja possui uma reserva de transmissao. Nao enviar novamente.',
    transmissao:false});
  // A partir daqui qualquer falha deve manter a trava, pois o resultado
  // da chamada externa pode ser incerto; reconciliacao sera somente leitura.
  const resultado=await executarRecepcao({guias:[guia],repositorio:repo,
   ator:'admin-piloto-pa-51076',
   certificado:{pfx:cert.pfx,passphrase:cert.passphrase,key:cert.key,cert:cert.cert},
   permitirTransmissao:true,timeoutMs:20000});
  if(resultado.ok&&resultado.estado==='concluido'){
   let arquivamento='nao_confirmado';
   try{
    const rows=await supabaseRest('gnre_guias_arquivo',{method:'POST',
     query:'?on_conflict=chave_idempotencia',
     body:{chave_nfe:nfe.chave,numero_nfe:nfe.numero,uf_favorecida:'PA',
      receita:'100102',valor_principal:nfe.valorDifal,vencimento:req.body.fiscal.vencimento,
      ambiente:'homologacao',situacao:'recebida',chave_idempotencia:resultado.idempotency_key,
      resposta_resumo:{codigo_gnre:resultado.codigo_gnre,categoria:resultado.categoria,
       validacao_fiscal:'pendente',recibo_mascarado:resultado.recibo_mascarado}}
    });
    arquivamento=Array.isArray(rows)&&rows.length?'recepcao_registrada':'nao_confirmado';
   }catch(_e){arquivamento='falha_arquivo_nao_reenviar';}
   return json(res,200,{...resultado,arquivamento,
    aviso:'Lote recebido em HOMOLOGACAO; consulta fiscal e PDF pendentes. NAO reenviar.'});
  }
  return json(res,resultado?.bloqueado?409:202,{...resultado,
   aviso:'Resultado ainda nao confirmado. A trava da NF-e permanece ativa. NAO retransmitir.'});
 }catch(_e){
  return json(res,503,{ok:false,estado:'verificacao_ou_envio_indisponivel',
   aviso:'Nao foi possivel concluir com seguranca. Conferir a trava e o recibo antes de outra acao.',
   transmissao:'nao_confirmada'});
 }
}
module.exports=handler;
module.exports.permitido=permitido;
module.exports.travaNfe=travaNfe;
