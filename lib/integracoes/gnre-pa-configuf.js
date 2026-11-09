'use strict';
// Consulta GNRE ConfigUF de PA 100102. SOMENTE LEITURA em Preview de homologacao.
// A obrigacao fiscal e o codigo estadual 0303 precisam ser confirmados
// pela ConfigUF e setor fiscal antes de qualquer envio de guia.
const https=require('node:https');
const {json,exigirAdmin}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {montarEnvelopeConfigUf,analisarConfigUf,SOAP_ACTION,ENDPOINT_ALTERNATIVO_443}=require('./gnre-configuf-xml');
const ENDPOINT=ENDPOINT_ALTERNATIVO_443;
const MAX_RESPOSTA=1600*1024;
function montarConsultaPa(){
 const modelo=montarEnvelopeConfigUf({uf:'MG',receita:'100102'});
 if(!modelo.includes('<ambiente>2</ambiente><uf>MG</uf><receita>100102</receita>'))
  throw new Error('Contrato ConfigUF de homologacao nao reconhecido');
 return modelo.replace('<ambiente>2</ambiente><uf>MG</uf><receita>100102</receita>',
  '<ambiente>2</ambiente><uf>PA</uf><receita>100102</receita>');
}
function analisarCamposPa(xml){
 const bloco=String(xml||'').match(/<(?:[\w.-]+:)?receita\b[^>]*\bcodigo=["']100102["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?receita>/i)?.[1]||'';
 const campo=(nome)=>{
  const match=bloco.match(new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?'+nome+'>','i'));
  const value=match?.[1]?.trim();
  return /^[NSO]$/i.test(value||'')?value.toUpperCase():'nao_confirmado';
 };
 return {
  exige_convenio:campo('exigeConvenio'),
  exige_documento_origem:campo('exigeDocumentoOrigem'),
  exige_data_pagamento:campo('exigeDataPagamento'),
  exige_contribuinte_emitente:campo('exigeContribuinteEmitente'),
  exige_contribuinte_destinatario:campo('exigeContribuinteDestinatario'),
  exige_periodo_referencia:campo('exigePeriodoReferencia'),
  detalhamento_verificado:/(?:detalhamentosReceita|detalhamentoReceita)/i.test(bloco),
  campos_adicionais_verificados:/(?:camposAdicionais|campoAdicional)/i.test(bloco),
  codigo_estadual_0303:'pendente_de_identificar_campo_oficial'
 };
}
function certificadoTls(c){
 if(c?.key&&c?.cert)return {key:c.key,cert:c.cert};
 if(c?.pfx&&c?.passphrase)return {pfx:c.pfx,passphrase:c.passphrase};
 throw new Error('A1 sem credenciais TLS completas');
}
function requisitarPa(envelope,tls,transport=https){
 return new Promise((resolve,reject)=>{
  const url=new URL(ENDPOINT);let done=false,bytes=0;
  const finish=(err,val)=>{if(done)return;done=true;err?reject(err):resolve(val)};
  const req=transport.request(url,{
   method:'POST',...tls,rejectUnauthorized:true,minVersion:'TLSv1.2',
   timeout:16000,agent:false,
   headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+SOAP_ACTION+'"',
    'Content-Length':Buffer.byteLength(envelope,'utf8'),'Accept':'application/soap+xml,text/xml'}
  },res=>{
   const parts=[];
   res.on('data',chunk=>{
    bytes+=Buffer.byteLength(chunk);
    if(bytes>MAX_RESPOSTA){req.destroy(Object.assign(new Error('Resposta GNRE acima do limite'),{code:'GNRE_RESPOSTA_GRANDE'}));return;}
    parts.push(Buffer.from(chunk));
   });
   res.on('end',()=>finish(null,{http_status:res.statusCode,xml:Buffer.concat(parts).toString('utf8')}));
   res.on('error',finish);
  });
  req.on('error',finish);
  req.on('timeout',()=>req.destroy(Object.assign(new Error('Prazo de consulta expirado'),{code:'ETIMEDOUT'})));
  req.end(envelope);
 });
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(process.env.GNRE_AMBIENTE!=='homologacao'||process.env.VERCEL_ENV!=='preview'
  ||process.env.VERCEL_GIT_COMMIT_REF!=='gnre-xml-calculos-integracao')
  return json(res,403,{ok:false,erro:'Consulta PA disponivel apenas na Preview em homologacao.',transmissao:false});
 try{
  const cred=await credenciais();
  const envelope=montarConsultaPa();
  const resposta=await requisitarPa(envelope,certificadoTls(cred));
  const resultado=analisarConfigUf({...resposta,uf:'PA',receita:'100102'});
  const campos=resultado.receita_confirmada&&resultado.codigo_situacao==='450'
   ?analisarCamposPa(resposta.xml):null;
  return json(res,200,{
   ok:resultado.ok,
   uf:'PA',receita:'100102',ambiente:'homologacao',
   codigo_gnre:resultado.codigo_situacao,http_status:resultado.http_status,
   descricao:resultado.descricao_situacao,
   receita_confirmada:resultado.receita_confirmada,
   campos_configuf:campos,
   diagnostico:resultado.falha_soap?'soap_fault':resultado.codigo_situacao==='199'?'autorizacao_ou_comunicacao_199':
    resultado.ok?'configuracao_consultada':'configuracao_nao_confirmada',
   limite:'A consulta nao confirma vencimento, pagamento, guia pagavel ou habilitacao em producao.',
   observacao_0303:'Codigo 0303 informado na orientacao do Portal DIFAL para PA. O campo GNRE correto deve ser confirmado antes de preencher.',
   transmissao:false
  });
 }catch(e){
  return json(res,502,{ok:false,uf:'PA',receita:'100102',ambiente:'homologacao',
   diagnostico: e.code==='ETIMEDOUT'?'tempo_limite':'conexao_ou_certificado',
   erro:'Nao foi possivel confirmar a ConfigUF de PA. Nenhuma guia foi transmitida.',
   transmissao:false});
 }
}
module.exports=handler;
module.exports.montarConsultaPa=montarConsultaPa;
module.exports.analisarCamposPa=analisarCamposPa;
module.exports.requisitarPa=requisitarPa;
