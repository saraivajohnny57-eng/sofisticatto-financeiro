'use strict';
// Consulta autenticada do resultado de lote GNRE, sem reenviar o lote.
// Resposta SOAP nao equivale a guia autorizada. Nao publica XML fiscal.
const {json,exigirAdmin}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {validarRecibo,SERVICOS}=require('./gnre-contrato');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
function montarConsulta(recibo){
 const n=validarRecibo(recibo);
 return montarEnvelopeSoap12({servico:'consulta',xmlDados:
   '<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br" versao="1.00"><ambiente>2</ambiente><numeroRecibo>'+n+'</numeroRecibo><incluirPDFGuias>S</incluirPDFGuias></TconsLote_GNRE>'});
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')
  return json(res,403,{ok:false,erro:'Consulta isolada em homologacao'});
 let xml;
 try{xml=montarConsulta(req.body?.numero_recibo);}
 catch(e){return json(res,400,{ok:false,erro:'Recibo deve ter 10 ou 14 digitos'});}
 try{
  const cred=await credenciais();
  const resposta=await enviarSoap({destino:SERVICOS.resultado,xml,
   soapAction:SOAP_ACTIONS.consulta,
   certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert}});
  const analise=resposta.analise||{};
  return json(res,200,{ok:analise.ok===true,consulta_realizada:true,
   http_status:resposta.status,categoria:analise.categoria||'indefinida',
   autorizacao_fiscal:'nao_verificada',
   pdf_disponivel:false,
   aviso:'Consulta de transporte SOAP. Interpretacao fiscal e recuperacao do PDF pendentes.'});
 }catch(e){
  return json(res,502,{ok:false,erro:'Falha ao consultar lote GNRE',
   codigo:/^[A-Z][A-Z0-9_]{1,60}$/.test(String(e.code||''))?e.code:'CONSULTA_FALHOU'});
 }
}
module.exports=handler;module.exports.montarConsulta=montarConsulta;
