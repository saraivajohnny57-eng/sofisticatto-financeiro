'use strict';
// Pre-envio PA/100102 SOMENTE LEITURA, Preview de homologacao.
// Nao cria e nao transmite lote. Comprova estrutura candidata + A1 + duplicidade LOCAL,
// sem alegar que a autorizacao fiscal de producao esta aprovada.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {prepararPreEnvioPa}=require('./gnre-preenvio-pa');
const repositorio=require('./gnre-idempotencia-repo');
function permitido(){
 return process.env.VERCEL_ENV==='preview'
  &&process.env.GNRE_AMBIENTE==='homologacao'
  &&process.env.VERCEL_GIT_COMMIT_REF==='gnre-xml-calculos-integracao';
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido',transmissao:false});
 if(!exigirAdmin(req,res))return;
 if(!permitido())return json(res,403,{ok:false,erro:'Pre-envio PA restrito a Preview homologacao.',transmissao:false});
 let plano;
 try{plano=prepararPreEnvioPa(req.body);}
 catch(e){return json(res,400,{ok:false,erro:String(e.message||e).slice(0,180),transmissao:false});}
 if(!plano.apto_para_revisao)
  return json(res,200,{...plano,certificado_verificado:false,duplicidade_verificada:false});
 try{
  const chave=String(req.body.nfe.chave||'');
  const idempotencia='gnre:recepcao:'+plano.plano.lote_sha256.slice(0,32);
  const [jaReservado,registro,cert]=await Promise.all([
   repositorio.buscar(idempotencia),
   supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+
    encodeURIComponent(chave)+'&receita=eq.100102&select=ambiente,situacao&limit=10'}),
   credenciais()
  ]);
  const pendencias=[];
  if(jaReservado)pendencias.push('Lote identico ja registrado, bloquear qualquer repeticao.');
  if(!Array.isArray(registro))
   pendencias.push('Nao foi possivel comprovar pesquisa de duplicidades no historico.');
  else if(registro.length)
   pendencias.push('Ja existe guia registrada para esta NF-e/receita. Reconciliar antes de nova emissao.');
  const cn=String(cert?.meta?.cnpj||'');
  const certOK=cert?.meta?.expirado===false&&cn===req.body.nfe.cnpjEmitente;
  if(!certOK)
   pendencias.push('Certificado A1 nao vigente ou CNPJ diferente do emitente.');
  if(process.env.GNRE_HOMOLOGACAO_EXECUTOR!=='1')
   pendencias.push('Executor de homologacao indisponivel.');
  return json(res,200,{...plano,
   apto_para_revisao:plano.apto_para_revisao&&pendencias.length===0,
   pendencias,certificado_verificado:certOK,
   duplicidade_verificada:Array.isArray(registro)&&!registro.length&&!jaReservado,
   aviso:'XML candidato PA/100102 preparado, mas validação XSD fiscal e autorização específica ainda são necessárias. NENHUMA guia transmitida.',
   transmissao:false});
 }catch(_e){
  return json(res,503,{ok:false,erro:'Certificado ou conferencia de duplicidades indisponivel; sem emissao.',
   transmissao:false});
 }
}
module.exports=handler;
module.exports.permitido=permitido;
