'use strict';
// Consulta read-only de DUAS GNREs ja transmitidas, nunca reenvia lote.
// Ambiente homologacao; nenhum PDF e considerado documento pagavel.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterReciboParaConsulta}=require('./gnre-idempotencia-repo');
const {credenciais}=require('./gnre-certificado');
const {SERVICOS}=require('./gnre-contrato');
const {montarConsultaRecibo}=require('./gnre-consulta-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno}=require('./gnre-interpretar-resultado');
const {conciliarDuasGuias}=require('./gnre-conferencia-dupla');
const COLUMS='chave_nfe,numero_nfe,receita,uf_favorecida,valor_principal,ambiente,situacao,chave_idempotencia';
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(process.env.VERCEL_ENV!=='preview'||process.env.GNRE_AMBIENTE!=='homologacao'
   ||process.env.VERCEL_GIT_COMMIT_REF!=='gnre-xml-calculos-integracao')
  return json(res,403,{ok:false,erro:'Consulta dupla exclusiva da Preview de homologacao'});
 const chave=String(req.body?.chave_nfe||'');
 const id=String(req.body?.idempotency_key||'');
 if(!/^\d{44}$/.test(chave)||!/^gnre:recepcao:[a-f0-9]{32}$/.test(id))
  return json(res,400,{ok:false,erro:'Identificadores de NF-e e lote invalidos'});
 try{
  const q='?chave_nfe=eq.'+chave+'&ambiente=eq.homologacao&receita=in.(100102,100129)'+
    '&select='+COLUMS+'&limit=5';
  const refs=await supabaseRest('gnre_duas_guias_registros',{query:q});
  if(!Array.isArray(refs)||refs.length!==2||refs.some(r=>r.chave_idempotencia!==id))
   return json(res,409,{ok:false,transmissao:false,
    erro:'Nao foram localizados exatamente dois registros de receita associados ao mesmo lote; consultar historico e reconciliar sem reenviar.'});
  const recibo=await obterReciboParaConsulta(id);
  if(!recibo)return json(res,409,{ok:false,transmissao:false,erro:'Recibo seguro do lote indisponivel; nao reenviar.'});
  const cert=await credenciais();
  const resposta=await enviarSoap({destino:SERVICOS.resultado,soapAction:SOAP_ACTIONS.consulta,
   xml:montarEnvelopeSoap12({servico:'consulta',xmlDados:montarConsultaRecibo(recibo)}),
   certificado:{pfx:cert.pfx,passphrase:cert.passphrase,key:cert.key,cert:cert.cert}
  });
  if(!resposta.analise?.ok)return json(res,502,{ok:false,erro:'Consulta SOAP de lote nao confirmada.'});
  const retorno=interpretarRetorno(resposta.body,recibo);
  const conferido=conciliarDuasGuias(retorno,refs);
  return json(res,200,{ok:conferido.confirmado,estado:retorno.estado,codigo:retorno.codigo,
   ...conferido,transmissao:false,guia_pagavel:false,
   aviso:'Consulta em homologacao. Mesmo com duas guias processadas, este retorno NAO autoriza pagamento.'});
 }catch(e){
  return json(res,502,{ok:false,transmissao:false,
   codigo:/^[A-Z][A-Z0-9_]{1,60}$/.test(String(e.code||''))?e.code:'CONSULTA_DUPLA_INDISPONIVEL',
   erro:'Nao foi possivel reconciliar o lote GNRE; nao reenviar.'});
 }
}
module.exports=handler;
