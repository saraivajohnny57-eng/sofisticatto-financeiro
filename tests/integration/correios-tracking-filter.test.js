'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { response, withFetch } = require('../helpers/http');
const { fakeResponse, fakeRequest } = require('../helpers/module-stubs');

preserveEnv();
const handler = require('../../lib/integracoes/consultar-rastreio-correios');

const ADMIN = { 'x-integrations-admin-key': 'admin-ficticio' };

function baseEnv() {
  setEnv({
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia',
    INTEGRATIONS_ADMIN_KEY: 'admin-ficticio',
    CORREIOS_USUARIO: 'usuario-ficticio',
    CORREIOS_CODIGO_ACESSO: 'codigo-ficticio'
  });
}

const rowCorreto = {
  id: 'r-1',
  parceiro_nome: 'Cliente Fictício',
  protocolo_rastreio: 'AA123456789BR',
  data_postagem: '2026-01-01',
  coleta_agendamento_id: 'c-1',
  status: 'em_transito',
  status_api: 'Em trânsito',
  ultima_ocorrencia: null,
  ultima_ocorrencia_em: null,
  finalizado_em: null
};

const rowErrado = {
  ...rowCorreto,
  id: 'r-2',
  coleta_agendamento_id: 'c-2',
  protocolo_rastreio: 'BB987654321BR'
};

function filtroId(url, id) {
  // Exige o filtro PostgREST bem formado: "?id=eq.X&", "&id=eq.X&" ou no fim da URL.
  return new RegExp(`[?&]id=eq\\.${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:&|$)`).test(url);
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('F06: filtro do rastreio Correios usa id correto e não atualiza outra coleta', async () => {
  baseEnv();
  const calls = [];
  const res = fakeResponse();

  await withFetch(async (url, init = {}) => {
    calls.push({ url, init });
    const metodo = init.method || 'GET';

    if (url.startsWith('https://api.correios.com.br/token/v1/autentica')) {
      return response({ token: 'token-ficticio', expiraEm: '2030-01-01T00:00:00.000Z' });
    }
    if (url.includes('/srorastro/v1/objetos/')) {
      return response({
        objetos: [{
          codObjeto: 'AA123456789BR',
          eventos: [{
            descricao: 'Objeto entregue ao destinatário',
            dtHrCriado: '2026-01-10T10:00:00'
          }]
        }]
      });
    }
    if (url.includes('/rest/v1/logistica_rastreamentos')) {
      if (metodo === 'PATCH') return response([{ id: 'r-1' }]);
      // Emula PostgREST ignorando um parâmetro inválido com espaço e
      // devolvendo a primeira linha da tabela (a coleta errada).
      return response([filtroId(url, 'r-1') ? rowCorreto : rowErrado]);
    }
    if (url.includes('/rest/v1/coleta_agendamentos')) {
      if (metodo === 'PATCH') return response([{ id: 'c-1' }]);
      return response([filtroId(url, 'c-1')
        ? { id: 'c-1', status: 'solicitado', status_api: 'solicitado', coletado_em: null }
        : { id: 'c-2', status: 'solicitado', status_api: 'solicitado', coletado_em: null }]);
    }
    if (url.includes('/rest/v1/coleta_status_eventos')) return response([{ id: 'e-1' }]);
    return undefined;
  }, async () => {
    await handler(fakeRequest({
      method: 'GET',
      query: { registro_id: 'r-1', codigo: 'AA123456789BR' },
      headers: ADMIN
    }), res);
  });

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'entregue');
  assert.ok(!calls.some((c) => c.url.includes('c-2')), 'coleta diferente foi consultada ou atualizada');

  const getRastreio = calls.find((c) =>
    c.url.includes('/rest/v1/logistica_rastreamentos') && c.url.includes('select=') && (c.init.method || 'GET') === 'GET'
  );
  assert.ok(getRastreio, 'consulta do rastreamento não foi feita');
  assert.ok(filtroId(getRastreio.url, 'r-1'), `filtro malformado: ${getRastreio.url}`);
  assert.ok(!getRastreio.url.includes('& id='), 'query contém espaço antes do id');

  const getsColeta = calls.filter((c) =>
    c.url.includes('/rest/v1/coleta_agendamentos') && c.url.includes('select=') && (c.init.method || 'GET') === 'GET'
  );
  assert.equal(getsColeta.length, 1, 'deveria consultar apenas a coleta vinculada');
  assert.ok(filtroId(getsColeta[0].url, 'c-1'), `filtro da coleta malformado: ${getsColeta[0].url}`);

  const patchesColeta = calls.filter((c) =>
    c.url.includes('/rest/v1/coleta_agendamentos') && c.init.method === 'PATCH'
  );
  assert.equal(patchesColeta.length, 1);
  assert.ok(filtroId(patchesColeta[0].url, 'c-1'), patchesColeta[0].url);
  assert.ok(!calls.some((c) => c.url.includes('c-2')), 'coleta diferente foi consultada ou atualizada');
});
