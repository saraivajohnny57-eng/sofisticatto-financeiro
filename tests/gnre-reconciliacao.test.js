'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('./helpers/env');
const { response, withFetch } = require('./helpers/http');
const { fakeResponse, fakeRequest } = require('./helpers/module-stubs');

preserveEnv();
const handler = require('../lib/integracoes/gnre-reconciliacao');

const ADMIN = { 'x-integrations-admin-key': 'admin-ficticio' };

function baseEnv() {
  setEnv({
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio',
    GNRE_AMBIENTE: 'homologacao',
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia'
  });
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('reconciliação exige POST e autorização administrativa', async () => {
  baseEnv();
  const semMetodo = fakeResponse();
  await handler(fakeRequest({ method: 'GET', headers: ADMIN }), semMetodo);
  assert.equal(semMetodo.statusCode, 405);

  const semAuth = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: {} }), semAuth);
  assert.equal(semAuth.statusCode, 401);
});

test('reconciliação exige ambiente de homologação', async () => {
  baseEnv();
  setEnv({ GNRE_AMBIENTE: 'producao' });
  const res = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: ADMIN }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.erro, /homologacao/);
});

test('reconciliação lista incertos sem expor recibo completo', async () => {
  baseEnv();
  const res = fakeResponse();
  await withFetch(async () => response([{
    chave_idempotencia: 'gnre:consulta:abc123',
    servico: 'consulta',
    recibo_mascarado: '••••••1234',
    estado: 'resultado_incerto',
    erro_codigo: 'ECONNRESET',
    atualizado_em: '2026-10-30T10:00:00.000Z'
  }]), async () => {
    await handler(fakeRequest({ method: 'POST', headers: ADMIN, body: { limite: 5 } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.somente_leitura, true);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.execucoes[0].estado, 'resultado_incerto');
  assert.ok(!JSON.stringify(res.body).includes('0000001234'));
  assert.match(res.body.orientacao, /conferência manual/i);
});

test('consulta por chave orienta não repetir envio incerto', async () => {
  baseEnv();
  const res = fakeResponse();
  await withFetch(async () => response([{
    chave_idempotencia: 'gnre:consulta:abc123',
    servico: 'consulta',
    recibo_mascarado: '••••••1234',
    estado: 'resultado_incerto',
    tentativa: 1,
    erro_codigo: 'ETIMEDOUT'
  }]), async () => {
    await handler(fakeRequest({ method: 'POST', headers: ADMIN, body: { chave: 'gnre:consulta:abc123' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.orientacao, /NÃO repetir/);
});

test('falha de banco devolve 503 sem detalhes internos', async () => {
  baseEnv();
  const res = fakeResponse();
  await withFetch(async () => response({ message: 'relation "gnre_homologacao_execucoes" does not exist' }, 404), async () => {
    await handler(fakeRequest({ method: 'POST', headers: ADMIN }), res);
  });
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes('does not exist'));
});
