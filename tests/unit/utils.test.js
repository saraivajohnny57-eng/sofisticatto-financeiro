'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { response, withFetch } = require('../helpers/http');
const { fakeResponse } = require('../helpers/module-stubs');

preserveEnv();
const utils = require('../../lib/integracoes/_utils');

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

function req(headers = {}) {
  return { headers };
}

test('json responde com status e corpo', () => {
  const res = fakeResponse();
  utils.json(res, 201, { ok: true });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { ok: true });
});

test('obterCampo percorre caminhos aninhados sem lançar', () => {
  const objeto = { a: { b: { c: 42 } } };
  assert.equal(utils.obterCampo(objeto, 'a.b.c'), 42);
  assert.equal(utils.obterCampo(objeto, 'a.x.c'), undefined);
  assert.equal(utils.obterCampo(objeto, ''), objeto);
});

test('senhaMestreValida exige configuração e compara com trim', () => {
  assert.equal(utils.senhaMestreValida('qualquer'), false);
  setEnv({ INTEGRATIONS_MASTER_PASSWORD: 'mestre-ficticia' });
  assert.equal(utils.senhaMestreValida('  mestre-ficticia  '), true);
  assert.equal(utils.senhaMestreValida('outra'), false);
  assert.equal(utils.senhaMestreValida(''), false);
});

test('cronValido exige CRON_SECRET e o esquema Bearer exato', () => {
  assert.equal(utils.cronValido(req({ authorization: 'Bearer x' })), false);
  setEnv({ CRON_SECRET: 'segredo-ficticio' });
  assert.equal(utils.cronValido(req({ authorization: 'Bearer segredo-ficticio' })), true);
  assert.equal(utils.cronValido(req({ authorization: 'segredo-ficticio' })), false);
  assert.equal(utils.cronValido(req({})), false);
});

test('adminValido aceita a chave legada somente quando configurada', () => {
  const header = { 'x-integrations-admin-key': 'chave-ficticia' };
  assert.equal(utils.adminValido(req(header)), false);
  setEnv({ INTEGRATIONS_ADMIN_KEY: 'chave-ficticia' });
  assert.equal(utils.adminValido(req(header)), true);
  assert.equal(utils.adminValido(req({ 'x-integrations-admin-key': 'errada' })), false);
  assert.equal(utils.adminValido(req({})), false);
});

test('token de dispositivo válido é aceito como credencial administrativa', () => {
  setEnv({ INTEGRATIONS_DEVICE_SECRET: 'd'.repeat(40) });
  const { token, payload } = utils.criarTokenDispositivo({ deviceId: 'device-teste', nome: 'Notebook fictício' });
  assert.match(token, /^sdv1\./);
  assert.equal(payload.did, 'device-teste');
  const validado = utils.validarTokenDispositivo(token);
  assert.equal(validado.did, 'device-teste');
  assert.equal(utils.adminValido(req({ 'x-integrations-admin-key': token })), true);
  assert.equal(utils.adminValido(req({ 'x-integrations-admin-key': token.slice(0, -2) + 'xx' })), false);
});

test('token de dispositivo expirado é rejeitado', () => {
  setEnv({ INTEGRATIONS_DEVICE_SECRET: 'd'.repeat(40) });
  const { token } = utils.criarTokenDispositivo({ deviceId: 'device-expirado', dias: -1 });
  assert.equal(utils.validarTokenDispositivo(token), null);
});

test('F05 (comportamento atual): token é aceito mesmo sem segredo configurado', () => {
  // Documenta a falha F05. O teste passa porque registra o comportamento
  // atual; a correção será habilitada no Bloco B.
  const { token } = utils.criarTokenDispositivo({ deviceId: 'device-sem-segredo' });
  assert.equal(utils.validarTokenDispositivo(token)?.did, 'device-sem-segredo');
});

test('token assinado com o segredo de fallback é rejeitado quando há segredo real', () => {
  const { token } = utils.criarTokenDispositivo({ deviceId: 'device-fallback' });
  setEnv({ INTEGRATIONS_DEVICE_SECRET: 'segredo-real-ficticio'.repeat(2) });
  assert.equal(utils.validarTokenDispositivo(token), null);
});

test('criptografar/descriptografar fazem round-trip AES-256-GCM', () => {
  setEnv({ INTEGRATIONS_ENCRYPTION_KEY: 'k'.repeat(32) });
  const entrada = { username: 'usuario-ficticio', password: 'senha-ficticia' };
  const registro = utils.criptografar(entrada);
  assert.ok(registro.payload && registro.iv && registro.tag);
  const saida = utils.descriptografar({
    payload_criptografado: registro.payload,
    iv: registro.iv,
    auth_tag: registro.tag
  });
  assert.deepEqual(saida, entrada);
});

test('descriptografar rejeita payload adulterado', () => {
  setEnv({ INTEGRATIONS_ENCRYPTION_KEY: 'k'.repeat(32) });
  const registro = utils.criptografar({ campo: 'valor-ficticio' });
  const tag = Buffer.from(registro.tag, 'base64');
  tag[tag.length - 1] ^= 0xff;
  assert.throws(() => utils.descriptografar({
    payload_criptografado: registro.payload,
    iv: registro.iv,
    auth_tag: tag.toString('base64')
  }));
});

test('criptografia exige chave com pelo menos 32 caracteres', () => {
  setEnv({ INTEGRATIONS_ENCRYPTION_KEY: 'curta' });
  assert.throws(() => utils.criptografar({ a: 1 }), /pelo menos 32/);
});

test('validarUrlPublica aceita HTTPS público', () => {
  assert.equal(utils.validarUrlPublica('https://exemplo-publico.test/api/homologacao'), 'https://exemplo-publico.test/api/homologacao');
});

test('validarUrlPublica rejeita protocolo e destinos internos conhecidos', () => {
  const proibidas = [
    'http://exemplo.test',
    'https://localhost',
    'https://127.0.0.1',
    'https://0.0.0.0',
    'https://10.1.2.3',
    'https://192.168.1.10',
    'https://172.20.0.1',
    'https://169.254.169.254',
    'https://servidor.local'
  ];
  for (const url of proibidas) {
    assert.throws(() => utils.validarUrlPublica(url), /Somente URLs HTTPS|interno ou local/, url);
  }
});

test('F12 (comportamento atual): faixa 100.64/10 é aceita pela validação', () => {
  assert.equal(utils.validarUrlPublica('https://100.64.0.1/teste'), 'https://100.64.0.1/teste');
});

test('F12 (comportamento atual): IPv6 de loopback é aceito pela validação', () => {
  // URL.hostname devolve "[::1]" e a rotina compara apenas com "::1".
  assert.equal(utils.validarUrlPublica('https://[::1]/teste'), 'https://[::1]/teste');
});

test('supabaseRest exige URL e chave configuradas', async () => {
  await assert.rejects(() => utils.supabaseRest('tabela'), /não configurada/);
});

test('supabaseRest monta GET com apikey, Bearer e Prefer', async () => {
  setEnv({ SUPABASE_URL: 'https://fake.supabase.test/', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' });
  let capturado = null;
  await withFetch(async (url, init) => {
    capturado = { url, init };
    return response([{ id: 1 }]);
  }, async () => {
    const dados = await utils.supabaseRest('tabela', { query: '?select=*' });
    assert.deepEqual(dados, [{ id: 1 }]);
  });
  assert.equal(capturado.url, 'https://fake.supabase.test/rest/v1/tabela?select=*');
  assert.equal(capturado.init.headers.apikey, 'chave-ficticia');
  assert.equal(capturado.init.headers.Authorization, 'Bearer chave-ficticia');
  assert.equal(capturado.init.headers.Prefer, 'return=representation');
});

test('supabaseRest propaga mensagem de erro do PostgREST', async () => {
  setEnv({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' });
  await withFetch(async () => response({ message: 'violação fictícia' }, 409), async () => {
    await assert.rejects(() => utils.supabaseRest('tabela'), /violação fictícia/);
  });
});

test('F07: POST com on_conflict envia resolution=merge-duplicates', async () => {
  setEnv({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' });
  let capturado = null;
  await withFetch(async (url, init) => {
    capturado = { url, init };
    return response([{ id: 'x' }]);
  }, async () => {
    await utils.supabaseRest('tabela', {
      method: 'POST',
      query: '?on_conflict=convite_id,ambiente',
      body: { convite_id: 'c1' }
    });
  });
  assert.equal(capturado.init.method, 'POST');
  assert.deepEqual(JSON.parse(capturado.init.body), { convite_id: 'c1' });
  assert.equal(capturado.init.headers.Prefer, 'return=representation,resolution=merge-duplicates');
});

test('POST sem on_conflict mantém Prefer apenas com return=representation', async () => {
  setEnv({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' });
  let capturado = null;
  await withFetch(async (url, init) => {
    capturado = { url, init };
    return response([{ id: 'x' }]);
  }, async () => {
    await utils.supabaseRest('tabela', { method: 'POST', body: { convite_id: 'c1' } });
  });
  assert.equal(capturado.init.headers.Prefer, 'return=representation');
});

test('supabaseRest devolve texto quando a resposta não é JSON', async () => {
  setEnv({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' });
  await withFetch(async () => response('resposta-texto'), async () => {
    assert.equal(await utils.supabaseRest('tabela'), 'resposta-texto');
  });
});

test('exigirAdmin responde 401 e interrompe o handler sem credencial', () => {
  const res = fakeResponse();
  assert.equal(utils.exigirAdmin(req({}), res), false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

test('exigirAdminOuCron aceita o Bearer do cron', () => {
  setEnv({ CRON_SECRET: 'cron-ficticio' });
  const res = fakeResponse();
  assert.equal(utils.exigirAdminOuCron(req({ authorization: 'Bearer cron-ficticio' }), res), true);
  assert.equal(res.statusCode, 200);
});

