'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { response, withFetch } = require('../helpers/http');
const { fakeResponse, fakeRequest } = require('../helpers/module-stubs');

preserveEnv();
const utils = require('../../lib/integracoes/_utils');
const { obterCredenciaisIntegracao } = require('../../lib/integracoes/carregar-credenciais');
const salvarCredenciais = require('../../lib/integracoes/salvar-credenciais');
const statusCredenciais = require('../../lib/integracoes/status-credenciais');

const ADMIN = { 'x-integrations-admin-key': 'admin-ficticio' };

function baseEnv() {
  setEnv({
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia',
    INTEGRATIONS_ENCRYPTION_KEY: 'e'.repeat(40),
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio'
  });
}

function encrypted(payload) {
  const c = utils.criptografar(payload);
  return { payload_criptografado: c.payload, iv: c.iv, auth_tag: c.tag };
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('obterCredenciaisIntegracao exige convite_id', async () => {
  baseEnv();
  await assert.rejects(() => obterCredenciaisIntegracao(''), /convite_id/);
});

test('obterCredenciaisIntegracao descriptografa a linha do convite', async () => {
  baseEnv();
  const row = { convite_id: 'c1', ambiente: 'homologacao', ...encrypted({ username: 'u-ficticio', password: 'p-ficticia' }) };
  let url = null;
  await withFetch(async (u) => { url = u; return response([row]); }, async () => {
    const cred = await obterCredenciaisIntegracao('c1', 'homologacao');
    assert.deepEqual(cred, { username: 'u-ficticio', password: 'p-ficticia' });
  });
  assert.match(url, /convite_id=eq\.c1/);
  assert.match(url, /ambiente=eq\.homologacao/);
});

test('obterCredenciaisIntegracao falha quando não há credencial cadastrada', async () => {
  baseEnv();
  await withFetch(async () => response([]), async () => {
    await assert.rejects(() => obterCredenciaisIntegracao('c-sem-credencial'), /não cadastradas/);
  });
});

test('salvar-credenciais rejeita método diferente de POST', async () => {
  baseEnv();
  const res = fakeResponse();
  await salvarCredenciais(fakeRequest({ method: 'GET', headers: ADMIN }), res);
  assert.equal(res.statusCode, 405);
});

test('salvar-credenciais exige autorização administrativa', async () => {
  baseEnv();
  const res = fakeResponse();
  await salvarCredenciais(fakeRequest({ body: { convite_id: 'c1', ambiente: 'homologacao' } }), res);
  assert.equal(res.statusCode, 401);
});

test('salvar-credenciais rejeita ambiente inválido', async () => {
  baseEnv();
  const res = fakeResponse();
  await salvarCredenciais(fakeRequest({
    headers: ADMIN,
    body: { convite_id: 'c1', ambiente: 'teste', credenciais: {} }
  }), res);
  assert.equal(res.statusCode, 400);
});

test('salvar-credenciais preserva campos anteriores e ignora valores vazios', async () => {
  baseEnv();
  const anterior = encrypted({ username: 'u-ficticio', password: 'p-ficticia' });
  const res = fakeResponse();
  let postBody = null;
  let postUrl = null;
  let postPrefer = null;

  await withFetch(async (url, init) => {
    if (init.method === 'GET') return response([{ convite_id: 'c1', ...anterior }]);
    postBody = JSON.parse(init.body);
    postUrl = url;
    postPrefer = init.headers.Prefer;
    return response([{ atualizado_em: '2026-01-01T00:00:00.000Z' }]);
  }, async () => {
    await salvarCredenciais(fakeRequest({
      headers: ADMIN,
      body: {
        convite_id: 'c1',
        ambiente: 'homologacao',
        credenciais: { ssw_dominio: 'ABC', username: '   ' }
      }
    }), res);
  });

  assert.equal(res.statusCode, 200);
  assert.match(postUrl, /on_conflict=convite_id,ambiente/);
  assert.equal(postPrefer, 'return=representation,resolution=merge-duplicates');
  const salvo = utils.descriptografar({
    payload_criptografado: postBody.payload_criptografado,
    iv: postBody.iv,
    auth_tag: postBody.auth_tag
  });
  assert.deepEqual(salvo, {
    username: 'u-ficticio',
    password: 'p-ficticia',
    ssw_dominio: 'ABC'
  });
});

test('salvar-credenciais continua quando a credencial anterior não pode ser lida', async () => {
  baseEnv();
  const res = fakeResponse();
  const originalWarn = console.warn;
  console.warn = () => {};
  let postBody = null;
  try {
    await withFetch(async (url, init) => {
      if (init.method === 'GET') return response([{ convite_id: 'c1', payload_criptografado: 'x', iv: 'y', auth_tag: 'z' }]);
      postBody = JSON.parse(init.body);
      return response([{ atualizado_em: '2026-01-01T00:00:00.000Z' }]);
    }, async () => {
      await salvarCredenciais(fakeRequest({
        headers: ADMIN,
        body: { convite_id: 'c1', ambiente: 'producao', credenciais: { username: 'novo-ficticio' } }
      }), res);
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(res.statusCode, 200);
  const salvo = utils.descriptografar({
    payload_criptografado: postBody.payload_criptografado,
    iv: postBody.iv,
    auth_tag: postBody.auth_tag
  });
  assert.deepEqual(salvo, { username: 'novo-ficticio' });
});

test('status-credenciais exige GET', async () => {
  baseEnv();
  const res = fakeResponse();
  await statusCredenciais(fakeRequest({ method: 'POST', headers: ADMIN }), res);
  assert.equal(res.statusCode, 405);
});

test('status-credenciais exige autorização', async () => {
  baseEnv();
  const res = fakeResponse();
  await statusCredenciais(fakeRequest({ method: 'GET', query: { convite_id: 'c1' } }), res);
  assert.equal(res.statusCode, 401);
});

test('status-credenciais devolve apenas booleanos, sem o payload', async () => {
  baseEnv();
  const row = {
    convite_id: 'c1',
    ambiente: 'homologacao',
    atualizado_em: '2026-01-01T00:00:00.000Z',
    ...encrypted({
      username: 'usuario-dummy-123',
      password: 'senha-dummy-456',
      ssw_dominio: 'ABC',
      ssw_senha_rastreio: 'rastreio-dummy-789',
      ssw_cnpj_rastreio: '11222333000181'
    })
  };
  const res = fakeResponse();
  await withFetch(async () => response([row]), async () => {
    await statusCredenciais(fakeRequest({
      method: 'GET',
      headers: ADMIN,
      query: { convite_id: 'c1', ambiente: 'homologacao' }
    }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.existe, true);
  assert.equal(res.body.usuario, true);
  assert.equal(res.body.senha_webservice, true);
  assert.equal(res.body.ssw_dominio, true);
  const serializado = JSON.stringify(res.body);
  for (const valor of ['usuario-dummy-123', 'senha-dummy-456', 'rastreio-dummy-789', '11222333000181']) {
    assert.ok(!serializado.includes(valor), `payload vazou: ${valor}`);
  }
});

test('status-credenciais informa ausência de cadastro', async () => {
  baseEnv();
  const res = fakeResponse();
  await withFetch(async () => response([]), async () => {
    await statusCredenciais(fakeRequest({
      method: 'GET',
      headers: ADMIN,
      query: { convite_id: 'inexistente' }
    }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.existe, false);
});
