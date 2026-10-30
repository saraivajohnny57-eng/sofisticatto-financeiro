'use strict';

// Reconciliação de execuções GNRE com resultado incerto (somente leitura).
// Não transmite, não altera estado e não devolve XML nem recibo completo.
const { json, exigirAdmin } = require('./_utils');
const repo = require('./gnre-idempotencia-repo');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Método não permitido.' });
  if (!exigirAdmin(req, res)) return;

  if (String(process.env.GNRE_AMBIENTE || '').toLowerCase() !== 'homologacao') {
    return json(res, 400, { ok: false, erro: 'GNRE_AMBIENTE deve ser homologacao.' });
  }

  try {
    const limite = Math.min(100, Math.max(1, Number(req.body?.limite) || 20));
    const execucoes = await repo.listarIncertos(limite);
    const chave = String(req.body?.chave || '').trim();

    if (chave) {
      const item = await repo.buscar(chave);
      return json(res, 200, {
        ok: true,
        somente_leitura: true,
        execucao: item
          ? {
              chave_idempotencia: item.chave_idempotencia,
              servico: item.servico,
              recibo_mascarado: item.recibo_mascarado,
              estado: item.estado,
              tentativa: item.tentativa,
              http_status: item.http_status,
              categoria: item.categoria,
              erro_codigo: item.erro_codigo,
              atualizado_em: item.atualizado_em
            }
          : null,
        orientacao: item?.estado === 'resultado_incerto'
          ? 'NÃO repetir o envio. Consultar o recibo/lote no portal antes de qualquer nova tentativa.'
          : 'Estado não exige reconciliação.'
      });
    }

    return json(res, 200, {
      ok: true,
      somente_leitura: true,
      total: execucoes.length,
      execucoes: execucoes.map((e) => ({
        chave_idempotencia: e.chave_idempotencia,
        servico: e.servico,
        recibo_mascarado: e.recibo_mascarado,
        estado: e.estado,
        erro_codigo: e.erro_codigo,
        atualizado_em: e.atualizado_em
      })),
      orientacao: 'Resultado incerto exige conferência manual no portal GNRE antes de qualquer reenvio.'
    });
  } catch (erro) {
    return json(res, 503, {
      ok: false,
      erro: 'Não foi possível consultar a trilha de idempotência. Confira o SQL e as variáveis de servidor.'
    });
  }
};
