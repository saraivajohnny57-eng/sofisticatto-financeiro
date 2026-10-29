'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { fakeResponse, fakeRequest, withModuleStubs } = require('../helpers/module-stubs');
const utils = require('../../lib/integracoes/_utils');

preserveEnv();

const validarChave = require('../../lib/integracoes/validar-chave');
const statusServidor = require('../../lib/integracoes/status-servidor');
const etiquetas = require('../../api/etiquetas-terceirizados');
const remetentesSmtp = withModuleStubs({
  nodemailer: { createTransport: () => ({ verify: async () => true, sendMail: async () => ({}) }) }
}, () => require('../../api/remetentes-smtp'));

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

async function executar(handler, req) {
  const res = fakeResponse();
  await handler(req, res);
  return res;
}

test('validar-chave rejeita método diferente de POST', async () => {
  const res = await executar(validarChave, fakeRequest({ method: 'GET', headers: ADMIN }));
  assert.equal(res.statusCode, 405);
});

test('validar-chave rejeita credencial ausente ou incorreta', async () => {
  setEnv({ INTEGRATIONS_MASTER_PASSWORD: 'mestre-ficticia' });
  const semCredencial = await executar(validarChave, fakeRequest({ headers: {} }));
  assert.equal(semCredencial.statusCode, 401);

  const errada = await executar(validarChave, fakeRequest({ headers: { 'x-integrations-admin-key': 'errada' } }));
  assert.equal(errada.statusCode, 401);
});

test('validar-chave troca a senha mestre por token de dispositivo', async () => {
  setEnv({
    INTEGRATIONS_MASTER_PASSWORD: 'mestre-ficticia',
    INTEGRATIONS_DEVICE_SECRET: 'd'.repeat(40)
  });
  const res = await executar(validarChave, fakeRequest({
    headers: { 'x-integrations-admin-key': 'mestre-ficticia' },
    body: { device_name: 'Notebook fictício' }
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.tipo, 'senha_mestre');
  assert.match(res.body.device_token, /^sdv1\./);
  assert.equal(utils.validarTokenDispositivo(res.body.device_token).did, res.body.device_id);
});

test('validar-chave aceita token de dispositivo válido', async () => {
  setEnv({
    INTEGRATIONS_MASTER_PASSWORD: 'mestre-ficticia',
    INTEGRATIONS_DEVICE_SECRET: 'd'.repeat(40)
  });
  const { token } = utils.criarTokenDispositivo({ deviceId: 'device-existente' });
  const res = await executar(validarChave, fakeRequest({
    headers: { 'x-integrations-admin-key': token }
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tipo, 'dispositivo');
  assert.equal(res.body.device_id, 'device-existente');
});

test('status-servidor exige autorização', async () => {
  const res = await executar(statusServidor, fakeRequest({ headers: {} }));
  assert.equal(res.statusCode, 401);
});

test('status-servidor informa prontidão apenas com booleanos e tamanho da chave', async () => {
  setEnv({
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio',
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia',
    INTEGRATIONS_ENCRYPTION_KEY: 'e'.repeat(40)
  });
  const res = await executar(statusServidor, fakeRequest({ headers: ADMIN }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pronto, true);
  assert.equal(res.body.encryption_key_length, 40);
  assert.equal(res.body.variaveis.SUPABASE_URL, true);
  assert.ok(!JSON.stringify(res.body).includes('service-ficticia'));
});

test('status-servidor indica pendência quando a chave é curta', async () => {
  setEnv({
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio',
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia',
    INTEGRATIONS_ENCRYPTION_KEY: 'curta'
  });
  const res = await executar(statusServidor, fakeRequest({ headers: ADMIN }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pronto, false);
});

test('etiquetas-terceirizados responde 503 sem Supabase configurado', async () => {
  setEnv({ INTEGRATIONS_ADMIN_KEY: 'admin-ficticio' });
  const res = await executar(etiquetas, fakeRequest({
    method: 'GET',
    headers: ADMIN,
    query: { acao: 'listar' }
  }));
  assert.equal(res.statusCode, 503);
});

test('remetentes-smtp usa header próprio e exige configuração', async () => {
  const semCredencial = await executar(remetentesSmtp, fakeRequest({ body: { acao: 'status', email: 'x@teste.test' } }));
  assert.equal(semCredencial.statusCode, 401);

  setEnv({ INTEGRATIONS_ADMIN_KEY: 'admin-ficticio' });
  const comCredencial = await executar(remetentesSmtp, fakeRequest({
    headers: { 'x-integrations-key': 'admin-ficticio' },
    body: { acao: 'status', email: 'x@teste.test' }
  }));
  assert.equal(comCredencial.statusCode, 500);
  assert.match(comCredencial.body.erro, /SUPABASE_URL/);
});
