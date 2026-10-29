'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { withNoNetwork } = require('../helpers/http');
const { fakeResponse, fakeRequest, withModuleStubs } = require('../helpers/module-stubs');

preserveEnv();
let originalError = null;

const sswOcorrencias = require('../../api/ssw-ocorrencias');
const etiquetas = require('../../api/etiquetas-terceirizados');
const documentos = require('../../lib/integracoes/documentos-correios');
const criarPrepostagem = require('../../lib/integracoes/criar-prepostagem-correios');

const gmailRemetentes = withModuleStubs({
  'google-auth-library': {
    JWT: class {
      async getAccessToken() { return { token: 'token-ficticio' }; }
    }
  }
}, () => require('../../api/gmail-remetentes'));

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
  await withNoNetwork(() => handler(req, res));
  return res;
}

test('F01 corrigido: ssw-ocorrencias exige token de webhook', async () => {
  const semToken = await executar(sswOcorrencias, fakeRequest({ method: 'POST', query: {}, body: {} }));
  assert.equal(semToken.statusCode, 401);
  assert.equal(semToken.body.ok, false);

  const tokenInvalido = await executar(sswOcorrencias, fakeRequest({
    method: 'POST',
    query: {},
    body: {},
    headers: { authorization: 'Bearer token-invalido' }
  }));
  assert.equal(tokenInvalido.statusCode, 401);
});

test('ssw-ocorrencias aceita token válido e falha com segurança sem Supabase', async () => {
  setEnv({ SSW_OCORRENCIAS_WEBHOOK_TOKEN: 'x'.repeat(40) });
  const res = await executar(sswOcorrencias, fakeRequest({
    method: 'POST',
    query: { convite_id: 'convite-ficticio' },
    body: { nf: { numeroNFe: '123' }, ocorrencia: { descricao: 'ENTREGUE' } },
    headers: { authorization: `Bearer ${'x'.repeat(40)}` }
  }));
  assert.equal(res.statusCode, 500);
  assert.notEqual(res.statusCode, 401);
});

test('F01 (comportamento atual): gmail-remetentes não exige credencial', async () => {
  const res = await executar(gmailRemetentes, fakeRequest({ method: 'POST', body: {} }));
  assert.equal(res.statusCode, 400);
  assert.notEqual(res.statusCode, 401);
  assert.match(res.body.erro, /e-mail válido/);
});

test('etiquetas-terceirizados exige autorização administrativa', async () => {
  const res = await executar(etiquetas, fakeRequest({ method: 'GET', query: { acao: 'listar' } }));
  assert.equal(res.statusCode, 401);
});

test('F01 (comportamento atual): documentos-correios não exige credencial', async () => {
  const res = await executar(documentos, fakeRequest({
    method: 'POST',
    query: { modo: 'localizar' },
    body: { nf: '123' }
  }));
  assert.notEqual(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

test('F01 (comportamento atual): criar-prepostagem-correios não exige credencial', async () => {
  const res = await executar(criarPrepostagem, fakeRequest({ method: 'POST', body: {} }));
  assert.notEqual(res.statusCode, 401);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.erro, /CORREIOS_USUARIO/);
});
