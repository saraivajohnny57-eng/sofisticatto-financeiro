const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {verificarDependenciasXsd}=require('../lib/integracoes/gnre-xsd-preflight');
test('GNRE XSD preflight identifies missing version 1 dependencies without network',()=>{
 const result=verificarDependenciasXsd();
 assert.equal(result.completo,false);
 assert.ok(result.faltantes.some(x=>x.dependencia==='dados_gnre_v1.00.xsd'));
 assert.ok(result.faltantes.some(x=>x.dependencia==='tiposBasicoGNRE_v1.00.xsd'));
});
test('GNRE XSD preflight accepts complete local include graph',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-xsd-'));
 try{
  fs.writeFileSync(path.join(dir,'root.xsd'),'<xs:include schemaLocation="types.xsd"/>');
  fs.writeFileSync(path.join(dir,'types.xsd'),'<xs:schema/>');
  assert.deepEqual(verificarDependenciasXsd(dir),{completo:true,arquivos:2,faltantes:[]});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
