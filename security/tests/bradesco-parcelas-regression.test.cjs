const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../financeiro.js'),'utf8');
test('Seu Numero Bradesco preserva sufixo de parcela',()=>{
 const m=source.match(/function seuNumeroBradescoOperacional\([\s\S]*?\n}/);
 assert.ok(m);
 const fn=Function(m[0]+';return seuNumeroBradescoOperacional;')();
 assert.equal(fn('56510',1,2),'56510-01');
 assert.equal(fn('56510',2,2),'56510-02');
 assert.equal(fn('56510',1,1),'56510');
});
test('Historico apresenta Seu Numero e identifica conciliacao local',()=>{
 const m=source.match(/function renderHistoricoCobrancas\(\)[\s\S]*?\n}\n/);
 assert.ok(m);
 assert.match(m[0],/Seu Nº:/);
 assert.match(m[0],/seuNumeroBradescoHistoricoV271\(x\)/);
 assert.match(m[0],/Conciliar no histórico/);
 assert.doesNotMatch(m[0],/>🔎 Verificar Bradesco<\/button>/);
});
test('Ausencia no historico nao se apresenta como consulta ao banco',()=>{
 assert.match(source,/Esta função NÃO consulta o banco Bradesco/);
});
