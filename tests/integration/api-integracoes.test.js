'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { fakeResponse, fakeRequest, withModuleStubs } = require('../helpers/module-stubs');

preserveEnv();

const handler = withModuleStubs({
  'node-forge': { pki: {} },
  'google-auth-library': {
    JWT: class {
      async getAccessToken() { return { token: 'token-ficticio' }; }
    }
  }
}, () => require('../../api/integracoes'));

const ADMIN = { 'x-integrations-admin-key': 'admin-ficticio' };
let originalError = null;

test.beforeEach(() => {
  resetEnv();
  originalError = console.error;
  console.error = () => {};
});
test.after(() => {
  console.error = originalError;
  restoreEnv();
});

async function executar(req) {
  const res = fakeResponse();
  await handler(req, res);
  return res;
}

test('health responde sem credencial e sem expor valores de segredo', async () => {
  setEnv({
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'valor-service-nao-pode-vazar',
    INTEGRATIONS_ADMIN_KEY: 'valor-admin-nao-pode-vazar',
    INTEGRATIONS_ENCRYPTION_KEY: 'valor-encryption-nao-pode-vazar',
    CRON_SECRET: 'valor-cron-nao-pode-vazar'
  });
  const res = await executar(fakeRequest({ method: 'GET', query: { action: 'health' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.rotas_carregadas, 41);
  assert.equal(res.body.variaveis.supabase_url, true);
  const serializado = JSON.stringify(res.body);
  for (const valor of [
    'valor-service-nao-pode-vazar',
    'valor-admin-nao-pode-vazar',
    'valor-encryption-nao-pode-vazar',
    'valor-cron-nao-pode-vazar'
  ]) {
    assert.ok(!serializado.includes(valor), `health expôs segredo: ${valor}`);
  }
});

test('F13 (comportamento atual): health é público', async () => {
  const res = await executar(fakeRequest({ method: 'GET', query: { action: 'health' }, headers: {} }));
  assert.equal(res.statusCode, 200);
});

test('ação desconhecida responde 404 com a lista de rotas', async () => {
  const res = await executar(fakeRequest({ method: 'POST', query: { action: 'nao-existe' } }));
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.ok, false);
  assert.ok(res.body.acoes_disponiveis.includes('health'));
  assert.ok(res.body.acoes_disponiveis.includes('salvar-credenciais'));
});

test('rotas protegidas respondem 401 sem credencial', async () => {
  const rotas = [
    ['salvar-credenciais', 'POST'],
    ['status-credenciais', 'GET'],
    ['status-servidor', 'POST'],
    ['testar-homologacao', 'POST'],
    ['testar-rodonaves-auth', 'POST'],
    ['cotar-rodonaves', 'POST'],
    ['cotar-ssw', 'POST'],
    ['consultar-rastreio-ssw', 'GET'],
    ['consultar-rastreio-correios', 'GET'],
    ['atualizar-rastreios-geral', 'POST'],
    ['atualizar-rastreios-alfa', 'POST'],
    ['atualizar-status', 'POST'],
    ['faturas-correios', 'GET'],
    ['configuracao-correios', 'GET'],
    ['testar-correios', 'GET'],
    ['buscar-cep-correios', 'POST'],
    ['verificar-cobertura', 'POST'],
    ['gnre-certificado', 'GET'],
    ['gnre-diagnostico', 'POST']
  ];
  for (const [action, method] of rotas) {
    const res = await executar(fakeRequest({ method, query: { action }, headers: {} }));
    assert.equal(res.statusCode, 401, `${action} deveria exigir credencial`);
    assert.equal(res.body.ok, false, action);
  }
});

test('erro interno responde 500 com envelope sanitizado', async () => {
  setEnv({ INTEGRATIONS_ADMIN_KEY: 'admin-ficticio' });
  const res = await executar(fakeRequest({
    method: 'POST',
    query: { action: 'salvar-credenciais' },
    headers: ADMIN,
    body: { convite_id: 'c1', ambiente: 'homologacao', credenciais: {} }
  }));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.ok(typeof res.body.erro === 'string' && res.body.erro.length > 0);
  assert.ok(!JSON.stringify(res.body).includes('node:internal'));
});

test('método incorreto em rota protegida responde 405', async () => {
  setEnv({ INTEGRATIONS_ADMIN_KEY: 'admin-ficticio' });
  const res = await executar(fakeRequest({
    method: 'POST',
    query: { action: 'status-credenciais' },
    headers: ADMIN
  }));
  assert.equal(res.statusCode, 405);
});
