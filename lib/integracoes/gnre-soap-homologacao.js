'use strict';
// Transporte GNRE homologacao. Nao monta guias e nao e chamado automaticamente.
// XML deve ser preparado e validado contra XSD oficial antes de usar enviarSoap.
const https=require('node:https');
const {URL}=require('node:url');
const {SERVICOS}=require('./gnre-contrato');
const {analisarRespostaSoap}=require('./gnre-resposta-soap');
const ENDPOINTS=new Set(Object.values(SERVICOS));
const MAX_BYTES=1024*1024;
function validarDestino(destino){
 const url=new URL(destino);
 if(!ENDPOINTS.has(url.href)||url.username||url.password||url.search||url.hash)
   throw new TypeError('Endpoint GNRE de homologacao nao permitido');
 return url;
}
function validarXml(xml){
 if(typeof xml!=='string'||!xml.trim()||Buffer.byteLength(xml,'utf8')>MAX_BYTES)
   throw new TypeError('XML GNRE ausente ou excede limite');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new TypeError('DTD e entidades nao permitidas');
 return xml;
}
function enviarSoap({destino,xml,certificado,soapAction,timeoutMs=15000,transport=https}){
 const url=validarDestino(destino);
 validarXml(xml);
 if(!certificado||!((certificado.key&&certificado.cert)||(certificado.pfx&&certificado.passphrase)))
  throw new TypeError('Certificado A1 obrigatorio');
 if(typeof soapAction!=='string'||!soapAction||/[\r\n";]/.test(soapAction))
  throw new TypeError('SOAPAction invalida');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
  throw new TypeError('Timeout invalido');
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;error?reject(error):resolve(result);};
  const req=transport.request(url,{
   method:'POST',rejectUnauthorized:true,minVersion:'TLSv1.2',
   ...(certificado.key&&certificado.cert?{key:certificado.key,cert:certificado.cert}:{pfx:certificado.pfx,passphrase:certificado.passphrase}),
   headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+soapAction+'"','Content-Length':Buffer.byteLength(xml,'utf8')},
   timeout:timeoutMs
  },res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{
    size+=Buffer.byteLength(chunk);
    if(size>MAX_BYTES){req.destroy(new Error('Resposta GNRE excede limite'));return;}
    chunks.push(Buffer.from(chunk));
   });
   res.on('end',()=>{const resposta={status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')};finish(null,{...resposta,analise:analisarRespostaSoap(resposta)});});
   res.on('error',e=>finish(e));
  });
  req.on('timeout',()=>req.destroy(new Error('Tempo limite GNRE')));
  req.on('error',e=>finish(e));
  req.end(xml);
 });
}
module.exports={enviarSoap,validarDestino,validarXml};
