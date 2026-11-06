'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const codigo=fs.readFileSync(path.join(__dirname,'../../api/banco-bradesco.js'),'utf8');
const manual=fs.readFileSync(path.join(__dirname,'../../manual.txt'),'utf8');

test('registro Bradesco: não aplica escala FAQ 1000x sem confirmar layout',()=>{
  assert.match(codigo,/percentualJuros:5,vlJuros:0,qtdeDiasJuros:1,percentualMulta:2,vlMulta:0/);
  assert.doesNotMatch(codigo,/percentualJuros:5000,vlJuros:0,qtdeDiasJuros:1,percentualMulta:2000/);
});

test('manual Bradesco documenta percentual decimal e contrato PUT distinto',()=>{
  assert.match(manual,/Exemplos\s+v[aá]lidos:[\s\S]{0,120}[“"]2[”"]/i);
  assert.match(manual,/codigoComissaoPermanencia/);
  assert.match(manual,/valorComissaoPermanencia/);
  assert.match(manual,/codigoMulta/);
  assert.match(manual,/valorMulta/);
});

test('manutenção de encargos permanece apenas consulta, sem PUT automático',()=>{
  assert.match(codigo,/action==='preparar-manutencao-encargos-v433'/);
  assert.match(codigo,/operacao:'PREPARACAO_SEM_ALTERACAO'/);
  assert.match(codigo,/transmitido:false/);
});
