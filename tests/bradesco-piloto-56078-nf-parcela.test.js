'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.resolve(__dirname,'../financeiro.js'),'utf8');
const api=fs.readFileSync(path.resolve(__dirname,'../api/banco-bradesco.js'),'utf8');
const piloto=fs.readFileSync(path.resolve(__dirname,'../bradesco-piloto-v438.js'),'utf8');
const begin=ui.indexOf('function numeroNfParcelaExibicaoV459('),end=ui.indexOf('function renderHistoricoCobrancas()',begin);
assert.ok(begin>0&&end>begin,'formatador na area do historico');
const formatar=new Function(ui.slice(begin,end)+'\nreturn numeroNfParcelaExibicaoV459;')();
test('mostra parcela 02 sem modificar numero_nf fiscal',()=>{
 const r={numero_nf:'56078',parcela_numero:2,parcela_total:3,referencia:'BRADESCO-56078-02'};
 assert.equal(formatar(r),'56078-02');
 assert.equal(r.numero_nf,'56078');
});
test('separa todas as 3 parcelas',()=>{
 for(const p of [1,2,3])assert.equal(formatar({numero_nf:'56078',parcela_numero:p,parcela_total:3,referencia:'BRADESCO-56078-0'+p}),'56078-0'+p);
});
test('evita sufixo duplo e nao inventa sufixo sem fonte',()=>{
 assert.equal(formatar({numero_nf:'56078-02',parcela_numero:2,parcela_total:3}),'56078-02');
 assert.equal(formatar({numero_nf:'56078'}),'56078');
});
test('historico e pendencias exibem numero completo',()=>{
 assert.match(ui,/escaparHtmlEmail\(numeroNfParcelaExibicaoV459\(x\)\)/);
 assert.match(ui,/seu_numero:numeroNfParcelaExibicaoV459\(x\)/);
});
test('piloto usa somente referencia e Nosso Numero corretos',()=>{
 const a=api.slice(api.indexOf("if(action==='conferir-piloto-56078-v459')"),api.indexOf("if(action==='conferir-piloto-55994-v435')"));
 assert.match(a,/BRADESCO-56078-02/);
 assert.match(a,/62710000058/);
 assert.match(a,/consultarTituloBradesco/);
 assert.doesNotMatch(a,/requestBradescoJson\s*\(/);
 assert.match(a,/put_liberado:false,transmitido:false/);
});
test('tela so oferece consulta, nao botao de alteracao',()=>{
 assert.match(piloto,/conferir-piloto-56078-v459/);
 assert.doesNotMatch(piloto,/conferir-piloto-55994-v435/);
 assert.match(piloto,/Alteração bancária: NÃO TRANSMITIDA/);
});
