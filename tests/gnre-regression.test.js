const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('GNRE diagnosis is restricted to homologation',()=>{
 const src=read('lib/integracoes/gnre-diagnostico.js');
 assert.match(src,/GNRE_AMBIENTE/);
 assert.match(src,/homologacao/);
 assert.match(src,/testegnre\.pe\.gov\.br/);
});
test('GNRE diagnosis checks TLS certificate and server identity',()=>{
 const src=read('lib/integracoes/gnre-diagnostico.js');
 assert.match(src,/rejectUnauthorized:true/);
 assert.match(src,/tls\.checkServerIdentity/);
 assert.match(src,/minVersion:'TLSv1\.2'/);
});
test('GNRE diagnosis does not send fiscal documents',()=>{
 const src=read('lib/integracoes/gnre-diagnostico.js');
 assert.match(src,/GnreConfigUF\?wsdl/);
 assert.doesNotMatch(src,/https\.post\(/);
 assert.doesNotMatch(src,/rejectUnauthorized:false/);
});
test('GNRE diagnosis does not return internal exception messages',()=>{
 const src=read('lib/integracoes/gnre-diagnostico.js');
 assert.doesNotMatch(src,/erro\s*:\s*e\.message/);
 assert.doesNotMatch(src,/stack\s*:\s*e\.stack/);
});
test('GNRE certificate is encrypted at rest and admin-only',()=>{
 const src=read('lib/integracoes/gnre-certificado.js');
 assert.match(src,/exigirAdmin\(req,res\)/);
 assert.match(src,/criptografar\(\{pfx:b64,senha\}\)/);
 assert.match(src,/payload_criptografado/);
});
test('GNRE diagnostic handler rejects production mode before network',async()=>{
 const utilsPath=require.resolve('../lib/integracoes/_utils');
 const certPath=require.resolve('../lib/integracoes/gnre-certificado');
 const handlerPath=require.resolve('../lib/integracoes/gnre-diagnostico');
 const originals=new Map([utilsPath,certPath,handlerPath].map(p=>[p,require.cache[p]]));
 const previous=process.env.GNRE_AMBIENTE;
 let credentialCalls=0;
 require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{exigirAdmin:()=>true,json:(res,status,data)=>{res.status=status;res.body=data;return res;}}};
 require.cache[certPath]={id:certPath,filename:certPath,loaded:true,exports:{credenciais:async()=>{credentialCalls++;throw Error('unexpected credential access');}}};
 delete require.cache[handlerPath];
 process.env.GNRE_AMBIENTE='producao';
 try{
  const handler=require(handlerPath);
  const res={};
  await handler({method:'POST'},res);
  assert.equal(res.status,400);
  assert.equal(res.body.ok,false);
  assert.equal(credentialCalls,0);
 }finally{
  if(previous===undefined)delete process.env.GNRE_AMBIENTE;else process.env.GNRE_AMBIENTE=previous;
  for(const [p,entry] of originals){if(entry)require.cache[p]=entry;else delete require.cache[p];}
 }
});


test('GNRE diagnostic refuses wrong HTTP method without credentials or network',async()=>{
 const utilsPath=require.resolve('../lib/integracoes/_utils');
 const certPath=require.resolve('../lib/integracoes/gnre-certificado');
 const handlerPath=require.resolve('../lib/integracoes/gnre-diagnostico');
 const originals=new Map([utilsPath,certPath,handlerPath].map(p=>[p,require.cache[p]]));
 let credentialCalls=0;
 require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{exigirAdmin:()=>true,json:(res,status,data)=>{res.status=status;res.body=data;return res;}}};
 require.cache[certPath]={id:certPath,filename:certPath,loaded:true,exports:{credenciais:async()=>{credentialCalls++;throw Error('unexpected credential access');}}};
 delete require.cache[handlerPath];
 try{
  const handler=require(handlerPath);
  const res={};await handler({method:'GET'},res);
  assert.equal(res.status,405);assert.equal(credentialCalls,0);
 }finally{for(const [p,entry] of originals){if(entry)require.cache[p]=entry;else delete require.cache[p];}}
});
test('GNRE diagnostic rejects nonofficial endpoints before accessing certificate',async()=>{
 const utilsPath=require.resolve('../lib/integracoes/_utils');
 const certPath=require.resolve('../lib/integracoes/gnre-certificado');
 const handlerPath=require.resolve('../lib/integracoes/gnre-diagnostico');
 const originals=new Map([utilsPath,certPath,handlerPath].map(p=>[p,require.cache[p]]));
 const oldEnv=process.env.GNRE_AMBIENTE,oldUrl=process.env.GNRE_BASE_URL;
 let credentialCalls=0;
 require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{exigirAdmin:()=>true,json:(res,status,data)=>{res.status=status;res.body=data;return res;}}};
 require.cache[certPath]={id:certPath,filename:certPath,loaded:true,exports:{credenciais:async()=>{credentialCalls++;throw Error('unexpected credential access');}}};
 delete require.cache[handlerPath];
 process.env.GNRE_AMBIENTE='homologacao';
 process.env.GNRE_BASE_URL='https://example.com/gnreWS/services';
 try{
  const handler=require(handlerPath);
  const res={};await handler({method:'POST'},res);
  assert.equal(res.status,400);assert.equal(credentialCalls,0);
 }finally{
  if(oldEnv===undefined)delete process.env.GNRE_AMBIENTE;else process.env.GNRE_AMBIENTE=oldEnv;
  if(oldUrl===undefined)delete process.env.GNRE_BASE_URL;else process.env.GNRE_BASE_URL=oldUrl;
  for(const [p,entry] of originals){if(entry)require.cache[p]=entry;else delete require.cache[p];}
 }
});


test('GNRE homologation fails safely when A1 is not configured, without DNS or network',async()=>{
 const utilsPath=require.resolve('../lib/integracoes/_utils');
 const certPath=require.resolve('../lib/integracoes/gnre-certificado');
 const handlerPath=require.resolve('../lib/integracoes/gnre-diagnostico');
 const originals=new Map([utilsPath,certPath,handlerPath].map(p=>[p,require.cache[p]]));
 const oldEnv=process.env.GNRE_AMBIENTE,oldUrl=process.env.GNRE_BASE_URL;
 let credentialCalls=0;
 require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{exigirAdmin:()=>true,json:(res,status,data)=>{res.status=status;res.body=data;return res;}}};
 require.cache[certPath]={id:certPath,filename:certPath,loaded:true,exports:{credenciais:async()=>{credentialCalls++;return {pfx:Buffer.alloc(0),passphrase:''};}}};
 delete require.cache[handlerPath];
 process.env.GNRE_AMBIENTE='homologacao';
 process.env.GNRE_BASE_URL='https://www.testegnre.pe.gov.br/gnreWS/services';
 try{
  const handler=require(handlerPath);
  const res={};await handler({method:'POST'},res);
  assert.equal(res.status,503);
  assert.equal(res.body.etapa,'certificado');
  assert.equal(credentialCalls,1);
 }finally{
  if(oldEnv===undefined)delete process.env.GNRE_AMBIENTE;else process.env.GNRE_AMBIENTE=oldEnv;
  if(oldUrl===undefined)delete process.env.GNRE_BASE_URL;else process.env.GNRE_BASE_URL=oldUrl;
  for(const [p,entry] of originals){if(entry)require.cache[p]=entry;else delete require.cache[p];}
 }
});
