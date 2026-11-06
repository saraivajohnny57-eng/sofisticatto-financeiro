'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('./helpers/env');
const { fakeResponse, fakeRequest, withModuleStubs } = require('./helpers/module-stubs');

preserveEnv();

// Stub do certificado e do repositório para não tocar rede/Supabase.
const certStub = {
  credenciais: async () => ({
    pfx: Buffer.from('pfx-ficticio'),
    passphrase: 'senha-ficticia',
    origem: 'portal',
    modo: 'nativo',
    meta: {
      valido_ate: '2027-01-01T00:00:00.000Z',
      expirado: false,
      cnpj: '05451985000195',
      fingerprint256: 'AA:BB'
    }
  })
};

const handler = withModuleStubs({
  './gnre-certificado': certStub,
  './gnre-idempotencia-repo': {
    reservar: async () => ({ ok: false, existente: { estado: 'bloqueado_no_teste' } }),
    marcarEnviando: async () => {},
    concluir: async () => {},
    falhar: async () => {},
    incerto: async () => {},
    buscar: async () => null,
    listarIncertos: async () => []
  }
}, () => require('../lib/integracoes/gnre-recepcao-http'));

const { guiaSimples } = require('../lib/integracoes/gnre-guia-simples-offline');
const ADMIN = { 'x-integrations-admin-key': 'admin-ficticio' };

function guias() {
  return [guiaSimples({
    ufFavorecida: 'MG',
    receita: '100099',
    valorPrincipal: '79.17',
    dataVencimento: '2026-07-08',
    contribuinte: { cnpj: '05451985000195', razaoSocial: 'Sofisticatto' },
    documentoOrigem: '50371',
    tipoDocumentoOrigem: '10'
  })];
}

function baseEnv() {
  setEnv({
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio',
    GNRE_AMBIENTE: 'homologacao',
    GNRE_HOMOLOGACAO_EXECUTOR: '1'
  });
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('rota exige POST e autorização administrativa', async () => {
  baseEnv();
  const r1 = fakeResponse();
  await handler(fakeRequest({ method: 'GET', headers: ADMIN }), r1);
  assert.equal(r1.statusCode, 405);

  const r2 = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: {} , body: { guias: guias() } }), r2);
  assert.equal(r2.statusCode, 401);
});

test('rota exige ambiente de homologação e executor habilitado', async () => {
  baseEnv();
  setEnv({ GNRE_AMBIENTE: 'producao' });
  const r1 = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: ADMIN, body: { guias: guias() } }), r1);
  assert.equal(r1.statusCode, 400);

  setEnv({ GNRE_AMBIENTE: 'homologacao', GNRE_HOMOLOGACAO_EXECUTOR: '0' });
  const r2 = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: ADMIN, body: { guias: guias() } }), r2);
  assert.equal(r2.statusCode, 403);
});

test('rota exige guias válidas', async () => {
  baseEnv();
  const res = fakeResponse();
  await handler(fakeRequest({ method: 'POST', headers: ADMIN, body: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.erro, /guias/);
});

test('modo verificar carrega o A1 e NÃO transmite', async () => {
  baseEnv();
  const res = fakeResponse();
  await handler(fakeRequest({
    method: 'POST', headers: ADMIN, body: { guias: guias(), modo: 'verificar' }
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.modo, 'verificar');
  assert.equal(res.body.transmissao, 'nao_realizada');
  assert.equal(res.body.verificacoes.certificado_carregado, true);
  assert.equal(res.body.verificacoes.certificado_valido, true);
  assert.equal(res.body.verificacoes.transmissao_habilitada, false);
  assert.equal(res.body.certificado.cnpj, '05451985000195');
  assert.match(res.body.plano.lote_sha256, /^[a-f0-9]{64}$/);
  // Não deve vazar material do certificado
  assert.ok(!JSON.stringify(res.body).includes('pfx-ficticio'));
  assert.ok(!JSON.stringify(res.body).includes('senha-ficticia'));
});

test('transmissão é bloqueada sem a flag, mesmo com confirmação correta', async () => {
  baseEnv();
  const res = fakeResponse();
  await handler(fakeRequest({
    method: 'POST',
    headers: ADMIN,
    body: { guias: guias(), confirmacao: 'TRANSMITIR_HOMOLOGACAO' }
  }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.transmissao_habilitada, false);
});

test('transmissão exige confirmação explícita mesmo com flag ligada', async () => {
  baseEnv();
  setEnv({ GNRE_TRANSMISSAO_HABILITADA: '1' });
  const res = fakeResponse();
  await handler(fakeRequest({
    method: 'POST', headers: ADMIN, body: { guias: guias() }
  }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.erro, /TRANSMITIR_HOMOLOGACAO/);
});

test('com flag e confirmação, delega ao executor e respeita o bloqueio de idempotência', async () => {
  baseEnv();
  setEnv({ GNRE_TRANSMISSAO_HABILITADA: '1' });
  const res = fakeResponse();
  await handler(fakeRequest({
    method: 'POST',
    headers: ADMIN,
    body: { guias: guias(), confirmacao: 'TRANSMITIR_HOMOLOGACAO', referencia_nfe: { chave_nfe: '52261105451985000195550010000511091000626728', numero_nfe: '51109', uf_favorecida: 'MG', receita: '100102', valor_principal: '19.01', vencimento: '2026-11-06' } }
  }), res);
  // O repositório stub sempre devolve conflito → execução bloqueada.
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.bloqueado, true);
  assert.ok(!JSON.stringify(res.body).includes('pfx-ficticio'));
});
