// V485: regressão da validação que impedia o piloto 56078-02 de chegar à consulta autenticada.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'..','api','banco-bradesco.js'),'utf8');
const start=backend.indexOf('function filtroConferenciaBradescoV485(');
const end=backend.indexOf('/* V473 — repetição somente da consulta',start);
assert.ok(start>=0&&end>start,'Helper de conferência deve existir');
const filtro=new Function(backend.slice(start,end)+';return filtroConferenciaBradescoV485')();
test('NF 56078 parcela 02 gera uma busca exata, sem recorrer a PUT',()=>{
 const q=filtro({numero_nf:'56078',parcela:2});
 assert.equal(q,'?banco=eq.bradesco&numero_nf=eq.56078&parcela_numero=eq.2&select=*&limit=2');
 assert.ok(q.startsWith('?banco=eq.bradesco'));
});
test('Conferência por ID de boleto conserva identificador',()=>{
 assert.match(filtro({id:'f6debae9-02c9-431b-aaf6-73683fcbdb31'}),/id=eq.f6debae9-02c9-431b-aaf6-73683fcbdb31/);
});
test('Número malformado não vira 500: validação HTTP 400',()=>{
 for(const entrada of [{numero_nf:'56078-02',parcela:2},{numero_nf:'',parcela:2},{numero_nf:'56078',parcela:0},{numero_nf:'56078',parcela:100},{numero_nf:'56078',parcela:2.5}]){
  assert.throws(()=>filtro(entrada),e=>e.http_status===400);
 }
});
test('ID inválido não gera busca no banco',()=>{
 assert.throws(()=>filtro({id:'../../teste'}),e=>e.http_status===400);
});
test('A ação da consulta somente lê e não libera PUT de manutenção',()=>{
 const p=backend.slice(backend.indexOf("if(action==='preparar-manutencao-encargos-v433')"),backend.indexOf("if(action==='consultar-status-titulo')"));
 assert.match(p,/filtroConferenciaBradescoV485/);
 assert.match(p,/consultarTituloBradesco\(amb,reg\)/);
 assert.doesNotMatch(p,/method:\s*['"]PUT['"]/);
 assert.match(p,/transmissao_autorizada:false/);
});
