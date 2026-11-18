'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../financeiro.js'), 'utf8');
test('pendente é identificado como conciliação local, sem promessa de consulta bancária', () => {
  const start=source.indexOf('async function verificarConciliarTituloBradescoV271(id)');
  const end=source.indexOf('async function limparPendenciasBradescoJaEmitidasV270',start);
  assert.ok(start>0&&end>start);
  const body=source.slice(start,end);
  assert.match(body,/NÃO consulta o banco Bradesco/);
  assert.match(body,/A pendência será preservada/);
  assert.match(source,/Conciliar histórico local<\/button>/);
  assert.doesNotMatch(body,/bradescoReqProducao\(/);
});
test('a conciliação ainda protege o registro emitido', () => {
  assert.match(source,/O boleto emitido será PRESERVADO/);
  assert.match(source,/\.eq\('status','pendente_integracao'\)/);
});
