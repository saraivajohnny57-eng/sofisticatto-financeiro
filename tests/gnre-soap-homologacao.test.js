const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {enviarSoap,validarDestino,validarXml}=require('../lib/integracoes/gnre-soap-homologacao');
const {SERVICOS}=require('../lib/integracoes/gnre-contrato');
test('GNRE SOAP blocks nonhomologation destinations and unsafe XML',()=>{
 for(const u of ['https://gnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao','http://www.testegnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao',SERVICOS.recepcao+'?redirect=1','https://www.testegnre.pe.gov.br.evil.org/gnreWS/services/GnreLoteRecepcao'])
  assert.throws(()=>validarDestino(u));
 assert.throws(()=>validarXml('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x/>'));
});
test('GNRE SOAP requires A1, action and safe timeout before any request',()=>{
 let called=0;const transport={request(){called++;throw Error('Network must not be reached');}};
 const base={destino:SERVICOS.recepcao,xml:'<Envelope/>',certificado:{pfx:Buffer.from('dummy'),passphrase:'dummy'},soapAction:'urn:teste',transport};
 assert.throws(()=>enviarSoap({...base,certificado:null}));
 assert.throws(()=>enviarSoap({...base,soapAction:'bad\nheader'}));
 assert.throws(()=>enviarSoap({...base,timeoutMs:999999}));
 assert.equal(called,0);
});
test('GNRE SOAP mock sends POST with mTLS and parses HTTP result without external calls',async()=>{
 let options,body='';
 const transport={request(url,opts,callback){
  assert.equal(url.href,SERVICOS.recepcao);options=opts;
  const req=new EventEmitter();
  req.end=chunk=>{
   body=chunk;
   const res=new EventEmitter();res.statusCode=200;
   callback(res);
   process.nextTick(()=>{res.emit('data',Buffer.from('<Envelope><ok/></Envelope>'));res.emit('end');});
  };
  req.destroy=e=>req.emit('error',e);
  return req;
 }};
 const result=await enviarSoap({destino:SERVICOS.recepcao,xml:'<Envelope/>',certificado:{pfx:Buffer.from('dummy'),passphrase:'dummy'},soapAction:'urn:teste',transport});
 assert.equal(options.method,'POST');
 assert.equal(options.headers['Content-Type'],'application/soap+xml; charset=utf-8; action="urn:teste"');
 assert.equal(options.headers.SOAPAction,undefined);
 assert.equal(options.rejectUnauthorized,true);
 assert.equal(options.minVersion,'TLSv1.2');
 assert.equal(options.headers['Content-Length'],Buffer.byteLength(body));
 assert.equal(result.status,200);
 assert.match(result.body,/<ok\/>/);
});


test('GNRE SOAP preserves multibyte UTF-8 split across chunks',async()=>{
 const xml='<Envelope>Guia de tributação</Envelope>';
 const encoded=Buffer.from(xml,'utf8');
 const split=encoded.indexOf(Buffer.from('ç','utf8'))+1;
 const transport={request(_url,_opts,callback){
  const req=new EventEmitter();
  req.end=()=>{
   const res=new EventEmitter();res.statusCode=200;callback(res);
   process.nextTick(()=>{res.emit('data',encoded.subarray(0,split));res.emit('data',encoded.subarray(split));res.emit('end');});
  };
  req.destroy=e=>req.emit('error',e);
  return req;
 }};
 const result=await enviarSoap({destino:SERVICOS.resultado,xml:'<Envelope/>',certificado:{pfx:Buffer.from('dummy'),passphrase:'dummy'},soapAction:'urn:teste',transport});
 assert.equal(result.body,xml);
});
test('GNRE SOAP rejects oversized response instead of treating truncated XML as success',async()=>{
 const transport={request(_url,_opts,callback){
  const req=new EventEmitter();
  req.end=()=>{
   const res=new EventEmitter();res.statusCode=200;callback(res);
   process.nextTick(()=>{res.emit('data',Buffer.alloc(1024*1024+1));res.emit('end');});
  };
  req.destroy=e=>req.emit('error',e);
  return req;
 }};
 await assert.rejects(enviarSoap({destino:SERVICOS.resultado,xml:'<Envelope/>',certificado:{pfx:Buffer.from('dummy'),passphrase:'dummy'},soapAction:'urn:teste',transport}),/excede limite/);
});
