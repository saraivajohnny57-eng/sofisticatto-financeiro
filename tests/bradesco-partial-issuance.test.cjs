'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../financeiro.js'),'utf8');
const a=s.indexOf('function relatorioTotalmenteEmitidoV262('),b=s.indexOf('function resumoParcelasRelatorioFinanceiro(',a);
const func=s.slice(a,b);
test('emissão total exige quantidade e sequência completa de parcelas',()=>{
 assert.match(func,/ps\.length<esperado/);
 assert.match(func,/for\(let n=1;n<=esperado;n\+\+\)/);
 assert.match(func,/numeros\.has\(n\)/);
});
test('resumo mantém parcela ausente visível e não a declara emitida',()=>{
 const start=s.indexOf('function resumoParcelasRelatorioFinanceiro(');
 const end=s.indexOf('function montarTabela(',start);
 const summary=s.slice(start,end);
 assert.match(summary,/NÃO EMITIDO \/ CONFERIR/);
 assert.match(summary,/const esperado=Math\.max\(prev\.length/);
});
