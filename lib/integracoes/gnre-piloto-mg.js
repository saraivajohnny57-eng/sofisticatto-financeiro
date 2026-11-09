'use strict';
// PRIMEIRO ENVIO CONTROLADO GNRE MG / NF-e 51109, SOMENTE em Preview.
// Nao aceita XML arbitrario do navegador: guia reconstruida pelo servidor.
// Requer explicitamente: admin, homologacao, flag Preview, NF-e e lote fixados,
// certificacao A1, confirmacao fiscal, reserva atomica de idempotencia.
// A recepcao de lote nao significa guia autorizada ou pronta para pagamento.
const crypto=require('node:crypto');
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {prepararPreEnvio,montarGuiaPreEnvio}=require('./gnre-preenvio-mg');
const {credenciais}=require('./gnre-certificado');
const {montarPlanoRecepcao,executarRecepcao}=require('./gnre-recepcao-executor');
const repo=require('./gnre-idempotencia-repo');
const CONFIRMACAO='TRANSMITIR_HOMOLOGACAO_51109';
const BRANCH='gnre-xml-calculos-integracao';
function sha(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function permitido(){
 return process.env.VERCEL_ENV==='preview'&&process.env.GNRE_AMBIENTE==='homologacao'
  &&process.env.VERCEL_GIT_COMMIT_REF===BRANCH
  &&process.env.GNRE_HOMOLOGACAO_EXECUTOR==='1'
  &&process.env.GNRE_PILOTO_MG_51109_ENVIO==='1'
  &&/^[a-f0-9]{64}$/.test(String(process.env.GNRE_PILOTO_51109_CHAVE_SHA256||''))
  &&/^[a-f0-9]{64}$/.test(String(process.env.GNRE_PILOTO_51109_LOTE_SHA256||''));
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido.'});
 if(!exigirAdmin(req,res))return;
 if(req.body?.modo==='status')
  return json(res,200,{ok:true,habilitado:permitido(),ambiente:'homologacao',
   transmissao:false,acao:'transmissao_manual_unica'});
 if(!permitido())return json(res,403,{ok:false,erro:'Janela de homologacao de NF-e 51109 nao habilitada nesta Preview.',transmissao:false});
 if(req.body?.confirmacao!==CONFIRMACAO||req.body?.autorizacao_usuario!==true)
  return json(res,400,{ok:false,erro:'Confirmacao explicita do primeiro envio obrigatoria.',transmissao:false});
 let pre,guia,plano,nfe;
 try{
  nfe=req.body?.nfe;
  const fiscal=req.body?.fiscal;
  pre=prepararPreEnvio({nfe,fiscal});
  if(!pre.apto_para_revisao)return json(res,400,{ok:false,erro:'Pre-envio com pendencias fiscais.',pendencias:pre.pendencias,transmissao:false});
  if(nfe.numero!=='51109'||nfe.valorDifal!=='19.01'||nfe.valorFcp!=='0.00')
    return json(res,403,{ok:false,erro:'Esta janela aceita apenas DIFAL da NF-e 51109 no valor de R$ 19,01.',transmissao:false});
  if(sha(nfe.chave)!==process.env.GNRE_PILOTO_51109_CHAVE_SHA256)
    return json(res,403,{ok:false,erro:'NF-e diferente da autorizada para a janela de teste.',transmissao:false});
  guia=montarGuiaPreEnvio(nfe,fiscal);
  plano=montarPlanoRecepcao([guia]);
  if(plano.lote_sha256!==pre.plano.lote_sha256||
     plano.lote_sha256!==req.body?.lote_sha256||
     plano.lote_sha256!==process.env.GNRE_PILOTO_51109_LOTE_SHA256)
    return json(res,409,{ok:false,erro:'O lote mudou desde o pre-envio aprovado. Rever os dados antes de transmitir.',transmissao:false});
 }catch(_e){
  return json(res,400,{ok:false,erro:'NF-e ou guia de homologacao invalida. Nenhum lote transmitido.',transmissao:false});
 }
 try{
  const [reg,existentes,cred]=await Promise.all([
   repo.buscar(plano.idempotency_key),
   supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+encodeURIComponent(nfe.chave)
     +'&receita=eq.100102&ambiente=eq.homologacao&select=chave_idempotencia,situacao&limit=1'}),
   credenciais()
  ]);
  if(reg||(Array.isArray(existentes)&&existentes.length))
   return json(res,409,{ok:false,bloqueado:true,estado:reg?.estado||'guia_ja_registrada',
    aviso:'Ja existe tentativa ou guia para esta NF-e. Consultar/reconciliar; NAO retransmitir.',
    idempotency_key:plano.idempotency_key,transmissao:false});
  if(cred?.meta?.expirado!==false||cred?.meta?.cnpj!==nfe.cnpjEmitente)
   return json(res,403,{ok:false,erro:'A1 nao vigente ou CNPJ do titular diferente da NF-e.',transmissao:false});
  const resultado=await executarRecepcao({
   guias:[guia],repositorio:repo,ator:'admin-piloto-gnre-mg-51109',
   certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert},
   permitirTransmissao:true,timeoutMs:20000
  });
  if(resultado.ok&&resultado.estado==='concluido'){
   let arquivamento='nao_confirmado';
   try{
    const rows=await supabaseRest('gnre_guias_arquivo',{method:'POST',
     query:'?on_conflict=chave_idempotencia',
     body:{chave_nfe:nfe.chave,numero_nfe:nfe.numero,uf_favorecida:'MG',
      receita:'100102',valor_principal:nfe.valorDifal,vencimento:req.body.fiscal.vencimento,
      ambiente:'homologacao',situacao:'recebida',
      chave_idempotencia:resultado.idempotency_key,
      resposta_resumo:{categoria:resultado.categoria,codigo_gnre:resultado.codigo_gnre,
       validacao_fiscal:resultado.validacao_fiscal,recibo_mascarado:resultado.recibo_mascarado}}
    });
    arquivamento=Array.isArray(rows)&&rows.length?'recepcao_registrada':'nao_confirmado';
   }catch(_erro){arquivamento='falha_arquivo_nao_reenviar';}
   return json(res,200,{...resultado,arquivamento,
    aviso:'Lote recebido em homologacao. Consultar resultado fiscal pelo recibo; NAO retransmitir.'});
  }
  return json(res,resultado.bloqueado?409:202,{
   ...resultado,aviso:'Nao foi confirmada a recepcao. Consultar/reconciliar antes de qualquer nova tentativa.'});
 }catch(_erro){
  return json(res,503,{ok:false,estado:'verificacao_indisponivel',
   aviso:'Falha na conferencia ou armazenamento. Nao tentar reenviar sem verificar o registro do lote.',
   transmissao:'nao_confirmada'});
 }
}
module.exports=handler;
module.exports.permitido=permitido;
