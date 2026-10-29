'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { response, withFetch } = require('../helpers/http');
const emailAuth = require('../../api/_email-auth');

preserveEnv();

function env() {
  setEnv({
    SUPABASE_URL: 'https://fake.supabase.test/',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia'
  });
}

function usuario(overrides = {}) {
  return {
    id: 'u-1',
    login: 'financeiro-ficticio',
    tipo: 'financeiro',
    senha: 'senha-ficticia',
    ativo: true,
    ...overrides
  };
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('config remove a barra final da URL', () => {
  env();
  const c = emailAuth.config();
  assert.equal(c.url, 'https://fake.supabase.test');
  assert.equal(c.key, 'service-ficticia');
});

test('validar exige Supabase configurado', async () => {
  await assert.rejects(
    () => emailAuth.validar({ body: { login: 'x', senha: 'y' } }),
    (err) => err.status === 503
  );
});

test('validar exige login e senha', async () => {
  env();
  await assert.rejects(
    () => emailAuth.validar({ body: { login: '', senha: '' } }),
    (err) => err.status === 401 && /Confirme sua senha/.test(err.message)
  );
});

test('validar aceita usuário ativo com papel permitido', async () => {
  env();
  let url = null;
  const resultado = await withFetch(async (u) => {
    url = u;
    return response([usuario()]);
  }, () => emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-ficticia' } }));
  assert.equal(resultado.usuario.login, 'financeiro-ficticio');
  assert.match(url, /usuarios\?login=eq\.financeiro-ficticio/);
  assert.match(url, /select=id,login,tipo,senha,ativo/);
});

test('validar aceita papel em maiúsculas', async () => {
  env();
  const resultado = await withFetch(async () => response([usuario({ tipo: 'FINANCEIRO' })]), () =>
    emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-ficticia' } })
  );
  assert.equal(resultado.usuario.id, 'u-1');
});

test('validar rejeita senha incorreta', async () => {
  env();
  await withFetch(async () => response([usuario()]), async () => {
    await assert.rejects(
      () => emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-errada' } }),
      (err) => err.status === 401
    );
  });
});

test('validar rejeita usuário inativo', async () => {
  env();
  await withFetch(async () => response([usuario({ ativo: false })]), async () => {
    await assert.rejects(
      () => emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-ficticia' } }),
      (err) => err.status === 401
    );
  });
});

test('validar rejeita papel não permitido', async () => {
  env();
  await withFetch(async () => response([usuario({ tipo: 'vendedora_rastreio' })]), async () => {
    await assert.rejects(
      () => emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-ficticia' } }),
      (err) => err.status === 401
    );
  });
});

test('validar rejeita quando o usuário não existe', async () => {
  env();
  await withFetch(async () => response([]), async () => {
    await assert.rejects(
      () => emailAuth.validar({ body: { login: 'inexistente', senha: 'senha-ficticia' } }),
      (err) => err.status === 401
    );
  });
});

test('validar devolve 503 quando o Supabase responde erro', async () => {
  env();
  await withFetch(async () => response({ message: 'indisponível' }, 500), async () => {
    await assert.rejects(
      () => emailAuth.validar({ body: { login: 'financeiro-ficticio', senha: 'senha-ficticia' } }),
      (err) => err.status === 503
    );
  });
});
