'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv } = require('../helpers/env');
const braspress = require('../../lib/integracoes/_braspress');

preserveEnv();
test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('soDigitos remove máscara de documentos', () => {
  assert.equal(braspress.soDigitos('12.345.678/0001-99'), '12345678000199');
  assert.equal(braspress.soDigitos(null), '');
});

test('headers monta Basic Auth com credenciais fictícias', () => {
  const h = braspress.headers({ username: 'usuario-ficticio', password: 'senha-ficticia' });
  assert.equal(h.Authorization, 'Basic ' + Buffer.from('usuario-ficticio:senha-ficticia').toString('base64'));
  assert.equal(h.Accept, 'application/json');
  assert.equal(h['Content-Type'], 'application/json');
});

test('ler devolve JSON ou texto bruto sem lançar', async () => {
  assert.deepEqual(await braspress.ler({ text: async () => '{"ok":true}' }), { ok: true });
  assert.deepEqual(await braspress.ler({ text: async () => 'resposta-texto' }), { raw: 'resposta-texto' });
  assert.deepEqual(await braspress.ler({ text: async () => '' }), {});
});
