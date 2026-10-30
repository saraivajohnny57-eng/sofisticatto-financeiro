'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('./helpers/env');
const { response, withFetch } = require('./helpers/http');

preserveEnv();
const repo = require('../lib/integracoes/gnre-idempotencia-repo');

function baseEnv() {
  setEnv({
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-ficticia'
  });
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('repositório usa a tabela de auditoria correta', () => {
  assert.equal(repo.TABELA, 'gnre_homologacao_execucoes');
});

test('reservar grava apenas metadados mascarados', async () => {
  baseEnv();
  const chamadas = [];
  await withFetch(async (url, init = {}) => {
    chamadas.push({ url, init });
    if ((init.method || 'GET') === 'GET') return response([]);
    return response([{ chave_idempotencia: 'gnre:consulta:abc' }]);
  }, async () => {
    const r = await repo.reservar({
      chave: 'gnre:consulta:abc',
      servico: 'consulta',
      recibo_mascarado: '••••••1234',
      ator: 'admin-ficticio'
    });
    assert.equal(r.ok, true);
  });

  const post = chamadas.find((c) => c.init.method === 'POST');
  const corpo = JSON.parse(post.init.body);
  assert.equal(corpo.estado, 'reservado');
  assert.equal(corpo.recibo_mascarado, '••••••1234');
  assert.ok(!JSON.stringify(corpo).includes('0000001234'), 'recibo completo não deve ser gravado');
  assert.ok(!('xml' in corpo));
  assert.ok(!('pfx' in corpo));
});

test('reservar devolve conflito quando a chave já existe', async () => {
  baseEnv();
  await withFetch(async () => response([{ chave_idempotencia: 'gnre:consulta:abc', estado: 'concluido' }]), async () => {
    const r = await repo.reservar({
      chave: 'gnre:consulta:abc',
      servico: 'consulta',
      recibo_mascarado: '••••••1234',
      ator: 'admin'
    });
    assert.equal(r.ok, false);
    assert.equal(r.existente.estado, 'concluido');
  });
});

test('reservar trata violação de unicidade concorrente como conflito', async () => {
  baseEnv();
  let leituras = 0;
  await withFetch(async (url, init = {}) => {
    if ((init.method || 'GET') === 'GET') {
      leituras++;
      return response(leituras === 1 ? [] : [{ chave_idempotencia: 'gnre:consulta:abc', estado: 'enviando' }]);
    }
    return response({ message: 'duplicate key value violates unique constraint' }, 409);
  }, async () => {
    const r = await repo.reservar({
      chave: 'gnre:consulta:abc',
      servico: 'consulta',
      recibo_mascarado: '••••••1234',
      ator: 'admin'
    });
    assert.equal(r.ok, false);
    assert.equal(r.existente.estado, 'enviando');
  });
});

test('transições de estado enviam PATCH com estado correto', async () => {
  baseEnv();
  const patches = [];
  await withFetch(async (url, init = {}) => {
    if (init.method === 'PATCH') {
      patches.push({ body: JSON.parse(init.body), url });
      return response([{ chave_idempotencia: 'k1', estado: 'atualizado' }]);
    }
    return response([]);
  }, async () => {
    await repo.marcarEnviando('k1');
    await repo.concluir('k1', { http_status: 200, categoria: 'soap_recebido' });
    await repo.falhar('k2', { http_status: 500, categoria: 'http_erro' });
    await repo.incerto('k3', { erro_codigo: 'ECONNRESET' });
  });

  assert.equal(patches[0].body.estado, 'enviando');
  assert.equal(patches[1].body.estado, 'concluido');
  assert.equal(patches[1].body.http_status, 200);
  assert.equal(patches[2].body.estado, 'falha');
  assert.equal(patches[2].body.http_status, 500);
  assert.equal(patches[3].body.estado, 'resultado_incerto');
  assert.equal(patches[3].body.erro_codigo, 'ECONNRESET');
  assert.match(patches[0].url, /estado=eq.reservado/);
  for (const item of patches.slice(1)) assert.match(item.url, /estado=eq.enviando/);
});

test('listarIncertos consulta apenas estados de resultado incerto', async () => {
  baseEnv();
  let url = null;
  await withFetch(async (u) => {
    url = u;
    return response([{ chave_idempotencia: 'k3', estado: 'resultado_incerto' }]);
  }, async () => {
    const lista = await repo.listarIncertos(10);
    assert.equal(lista.length, 1);
  });
  assert.match(url, /estado=eq\.resultado_incerto/);
  assert.match(url, /limit=10/);
});

test('repositório exige Supabase configurado', async () => {
  await assert.rejects(() => repo.buscar('k1'), /não configurada/);
});

test('transição concorrente ou estado divergente bloqueia atualização', async () => {
  baseEnv();
  await withFetch(async () => response([]), async () => {
    await assert.rejects(
      () => repo.concluir('chave-inexistente', { http_status: 200, categoria: 'ok' }),
      { code: 'GNRE_ESTADO_DIVERGENTE' }
    );
  });
});

test('reservar reconhece SQLSTATE 23505 mesmo sem mensagem textual de duplicate', async () => {
  baseEnv();
  let leituras = 0;
  await withFetch(async (_url, init = {}) => {
    if ((init.method || 'GET') === 'GET') {
      leituras++;
      return response(leituras === 1 ? [] : [{ chave_idempotencia: 'k1', estado: 'reservado' }]);
    }
    return response({ code: '23505', message: 'erro de integridade' }, 409);
  }, async () => {
    const r = await repo.reservar({
      chave: 'k1', servico: 'consulta', recibo_mascarado: '••••1234', ator: 'teste'
    });
    assert.equal(r.ok, false);
    assert.equal(r.existente.estado, 'reservado');
  });
});
