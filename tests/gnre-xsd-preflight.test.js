const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {verificarDependenciasXsd}=require('../lib/integracoes/gnre-xsd-preflight');
test('GNRE XSD preflight accepts the official version 1 dependencies',()=>{
 const result=verificarDependenciasXsd();
 assert.equal(result.completo,true,JSON.stringify(result.faltantes));
 assert.deepEqual(result.faltantes,[]);
});
test('GNRE XSD preflight accepts complete local include graph',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-xsd-'));
 try{
  fs.writeFileSync(path.join(dir,'root.xsd'),'<xs:include schemaLocation="types.xsd"/>');
  fs.writeFileSync(path.join(dir,'types.xsd'),'<xs:schema/>');
  assert.deepEqual(verificarDependenciasXsd(dir),{completo:true,arquivos:2,faltantes:[]});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
