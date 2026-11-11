'use strict';
// Exporta SOMENTE o XML de retorno GNRE já processado para o piloto MG 51109.
// Nao envia guias, nao realiza pagamento, nao disponibiliza PDF artificial.
// O documento contém dados fiscais: resposta restrita a administrador autenticado.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterReciboParaConsulta}=require('./gnre-idempotencia-repo');
const {credenciais}=require('./gnre-certificado');
const {SERVICOS}=require('./gnre-contrato');
const {montarConsultaRecibo}=require('./gnre-consulta-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno}=require('./gnre-interpretar-resultado');
const {conferirResultadoIndividual}=require('./gnre-conferencia-individual');

function pilotoHabilitado(){
 const h=String(process.env.GNRE_PILOTO_51109_LOTE_SHA256||'');
 return process.env.VERCEL_ENV==='preview'
  &&process.env.VERCEL_GIT_COMMIT_REF==='gnre-xml-calculos-integracao'
  &&process.env.GNRE_AMBIENTE==='homologacao'
  &&/^[a-f0-9]{64}$/.test(h);
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(!pilotoHabilitado()||req.body?.piloto_mg_51109!==true)
  return json(res,403,{ok:false,erro:'Download disponivel apenas para o piloto homologado 51109.'});
 const chave='gnre:recepcao:'+String(process.env.GNRE_PILOTO_51109_LOTE_SHA256).slice(0,32);
 try{
  const [recibo,refs]=await Promise.all([
   obterReciboParaConsulta(chave),
   supabaseRest('gnre_guias_arquivo',{
    query:'?chave_idempotencia=eq.'+encodeURIComponent(chave)
     +'&ambiente=eq.homologacao'
     +'&select=chave_nfe,numero_nfe,receita,uf_favorecida,valor_principal,ambiente,situacao,numero_guia,pdf_base64&limit=1'
   })
  ]);
  const referencia=Array.isArray(refs)?refs[0]:null;
  if(!recibo||!referencia||String(referencia.numero_nfe)!=='51109'
   ||String(referencia.receita)!=='100102')
   return json(res,409,{ok:false,erro:'Recibo ou referencia arquivada da NF-e 51109 nao foram confirmados.'});
  const cred=await credenciais();
  const xml=montarEnvelopeSoap12({servico:'consulta',xmlDados:montarConsultaRecibo(recibo)});
  const resposta=await enviarSoap({destino:SERVICOS.resultado,xml,soapAction:SOAP_ACTIONS.consulta,
   certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert}});
  if(!resposta.analise?.ok||resposta.status!==200)
   return json(res,502,{ok:false,erro:'Consulta SOAP de retorno GNRE nao confirmada.'});
  const fiscal=interpretarRetorno(resposta.body,recibo);
  const conferido=conferirResultadoIndividual(fiscal,{...referencia,pdf_arquivado:Boolean(referencia.pdf_base64)});
  if(!conferido.confirmado)
   return json(res,409,{ok:false,erro:'Retorno individual nao foi conciliado com a NF-e. Nao exportado.',
    pendencias:conferido.pendencias.slice(0,6)});
  const retorno=String(resposta.body||'');
  if(!retorno||Buffer.byteLength(retorno,'utf8')>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(retorno))
   return json(res,502,{ok:false,erro:'XML GNRE invalido para exportacao.'});
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="GNRE-HOMOLOGACAO-NFE-51109-RETORNO.xml"');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).send(retorno);
 }catch(_e){
  return json(res,502,{ok:false,erro:'Nao foi possivel recuperar o XML homologado. Nenhum lote retransmitido.'});
 }
}
module.exports=handler;
module.exports.pilotoHabilitado=pilotoHabilitado;
