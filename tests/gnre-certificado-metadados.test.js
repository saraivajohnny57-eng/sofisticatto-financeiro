'use strict';
// Certificados 100% sinteticos gerados durante o teste. Nunca usa A1 real nem rede.
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const {extrairCnpj,metadadosCertificadoPem,inspecionarPfx,abrirCertificado}=require('../lib/integracoes/gnre-certificado');
const openssl=spawnSync('openssl',['version'],{encoding:'utf8'}).status===0;
function gerarCert(dir,cnpj,{san=true,serial=false}={}){
 const key=path.join(dir,'chave.key'),pem=path.join(dir,'cert.pem');
 const args=['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',pem,
  '-days','3','-subj',serial?'/CN=Empresa Exemplo/serialNumber='+cnpj:'/CN=Empresa Exemplo'];
 if(san)args.push('-addext','subjectAltName=otherName:2.16.76.1.3.3;UTF8:'+cnpj);
 const gen=spawnSync('openssl',args,{encoding:'utf8'});
 assert.equal(gen.status,0,(gen.stderr||'').slice(-750));
 const p12=path.join(dir,'cert.p12');
 const pack=spawnSync('openssl',['pkcs12','-export','-inkey',key,'-in',pem,
  '-passout','pass:senha-ficticia','-out',p12],{encoding:'utf8'});
 assert.equal(pack.status,0,(pack.stderr||'').slice(-750));
 return {pem:fs.readFileSync(pem,'utf8'),pfx:fs.readFileSync(p12)};
}
test('certificado e-CNPJ pelo SAN ICP-Brasil otherName OID 2.16.76.1.3.3',
 {skip:!openssl},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-a1-san-'));
 try{
  const {pem,pfx}=gerarCert(dir,'12345678000195',{san:true,serial:false});
  const m=metadadosCertificadoPem(pem);
  assert.equal(m.cnpj,'12345678000195');
  assert.equal(m.cnpj_origem,'san_cnpj_icp_brasil');
  assert.equal(m.expirado,false);
  assert.match(m.valido_ate,/^\d{4}-\d{2}-\d{2}T/);
  assert.ok(m.fingerprint256);
  const n=inspecionarPfx(pfx,'senha-ficticia');
  assert.equal(n.cnpj,m.cnpj);
  assert.equal(n.expirado,false);
  const cred=abrirCertificado(pfx,'senha-ficticia');
  assert.ok(cred.meta);
  assert.equal(cred.meta.cnpj,m.cnpj);
  assert.equal(cred.meta.expirado,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('certificado novo perfil identifica CNPJ no Subject serialNumber',
 {skip:!openssl},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-a1-serial-'));
 try{
  const {pem}=gerarCert(dir,'12345678000195',{san:false,serial:true});
  const m=metadadosCertificadoPem(pem);
  assert.equal(m.cnpj,'12345678000195');
  assert.equal(m.cnpj_origem,'subject_serial_number');
  assert.equal(m.expirado,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('nao confunde o CPF do responsavel ou outro identificador com o CNPJ titular',()=>{
 assert.equal(extrairCnpj('11.222.333/0001-99'),'11222333000199');
 assert.equal(extrairCnpj('Empresa:12345678000195'),'12345678000195');
 assert.equal(extrairCnpj('00000000000'),null);
 assert.equal(extrairCnpj('garbage 12345678000195 garbage'),null);
});
test('metadados sao produzidos tambem pelo modo compatibilidade e nao vazam no pre-envio',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-certificado.js'),'utf8');
 const pre=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-preenvio-mg.js'),'utf8');
 assert.match(src,/modo:'compatibilidade',meta:metadadosCertificadoPem\(cert\)/);
 assert.match(pre,/cnpj_identificado:Boolean\(cnpjCert\)/);
 assert.doesNotMatch(pre,/titular:meta\.titular|senha:cred|pfx:cred/);
});
