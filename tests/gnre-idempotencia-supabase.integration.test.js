'use strict';

// Teste de integração REAL contra o Supabase (opt-in).
// Só executa com GNRE_TEST_SUPABASE=1 e credenciais no ambiente.
// Cria e remove apenas registros sintéticos com prefixo de teste.

const test = require('node:test');
const assert = require('node:assert/strict');

const habilitado = process.env.GNRE_TEST_SUPABASE === '1'
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const motivo = 'integração real desativada (defina GNRE_TEST_SUPABASE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)';

test('repositório GNRE opera contra o Supabase real', { skip: habilitado ? false : motivo }, async (t) => {
  const { supabaseRest } = require('../lib/integracoes/_utils');
  const repo = require('../lib/integracoes/gnre-idempotencia-repo');
  const chave = `gnre:consulta:ITEST${Date.now().toString(36).toUpperCase()}`;

  t.after(async () => {
    await supabaseRest('gnre_homologacao_execucoes', {
      method: 'DELETE',
      query: `?chave_idempotencia=eq.${encodeURIComponent(chave)}`
    }).catch(() => {});
  });

  // 1. reserva inicial deve funcionar
  const primeira = await repo.reservar({
    chave, servico: 'consulta', recibo_mascarado: '••••9999', ator: 'teste-integracao'
  });
  assert.equal(primeira.ok, true, 'primeira reserva deveria ser aceita');

  // 2. segunda reserva da mesma chave deve ser bloqueada (UNIQUE no banco)
  const segunda = await repo.reservar({
    chave, servico: 'consulta', recibo_mascarado: '••••9999', ator: 'teste-integracao'
  });
  assert.equal(segunda.ok, false, 'duplicidade deveria ser bloqueada');
  assert.equal(segunda.existente.estado, 'reservado');

  // 3. transições atômicas
  await repo.marcarEnviando(chave);
  assert.equal((await repo.buscar(chave)).estado, 'enviando');

  await repo.concluir(chave, { http_status: 200, categoria: 'soap_recebido' });
  const concluido = await repo.buscar(chave);
  assert.equal(concluido.estado, 'concluido');
  assert.equal(concluido.http_status, 200);

  // 4. não deve gravar recibo completo nem XML
  assert.equal(concluido.recibo_mascarado, '••••9999');
  assert.ok(!JSON.stringify(concluido).includes('00009999'));

  // 5. listagem de incertos deve responder sem erro
  const incertos = await repo.listarIncertos(5);
  assert.ok(Array.isArray(incertos));
});
