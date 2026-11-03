'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../api/banco-bradesco.js'), 'utf8');

test('falha de autenticação é registrada sem POST de cobrança', () => {
  const i = source.indexOf("if(action==='emitir-cobranca-producao-v248')");
  const j = source.indexOf("const d=retorno.data||{}", i);
  assert.ok(i > 0 && j > i);
  const fluxo = source.slice(i, j);
  assert.match(fluxo, /auth=await solicitarTokenMtls/);
  assert.match(fluxo, /estado:'FALHA_AUTENTICACAO_SEM_POST'/);
  assert.match(fluxo, /post_cobranca_executado=false/);
  assert.match(fluxo, /retorno=await enviarRegistroCobrancaProducao/);
  assert.ok(fluxo.indexOf('auth=await solicitarTokenMtls') < fluxo.indexOf('retorno=await enviarRegistroCobrancaProducao'));
});
test('falha após POST permanece incerta e bloqueada', () => {
  assert.match(source, /estado:'ERRO_TRANSPORTE_SEM_RETRY'/);
  assert.match(source, /Resultado incerto após iniciar envio da cobrança/);
  assert.match(source, /tentativaAnterior\.estado==='RESPOSTA_RECEBIDA' && statusAnterior===400/);
});
test('API devolve código e sinal de POST para erro de autenticação', () => {
  assert.match(source, /codigo:precisaMigracao\?'BRADESCO_SQL_V251_PENDENTE':e\?\.codigo\|\|null/);
  assert.match(source, /post_cobranca_executado:precisaMigracao\?false:e\?\.post_cobranca_executado/);
});
