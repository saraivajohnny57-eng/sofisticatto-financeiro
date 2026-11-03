'use strict';

// Planejador administrativo de RECEPÇÃO GNRE (dry-run).
// Não transmite, não retorna XML e não acessa certificado ou rede.
const { json, exigirAdmin } = require('./_utils');
const { montarPlanoRecepcao } = require('./gnre-recepcao-executor');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Método não permitido.' });
  if (!exigirAdmin(req, res)) return;

  if (String(process.env.GNRE_AMBIENTE || '').toLowerCase() !== 'homologacao') {
    return json(res, 400, { ok: false, erro: 'GNRE_AMBIENTE deve ser homologacao.' });
  }
  if (String(process.env.GNRE_HOMOLOGACAO_EXECUTOR || '') !== '1') {
    return json(res, 403, { ok: false, erro: 'Executor de homologação não habilitado.' });
  }

  const guias = req.body?.guias;
  if (!Array.isArray(guias) || guias.length === 0) {
    return json(res, 400, { ok: false, erro: 'Envie "guias" como array de TDadosGNRE.' });
  }

  try {
    const plano = montarPlanoRecepcao(guias);
    return json(res, 200, {
      ok: true,
      dry_run: true,
      transmissao: 'desabilitada_nesta_fase',
      servico: plano.servico,
      destino: plano.destino,
      soap_action: plano.soapAction,
      guias: plano.guias,
      lote_sha256: plano.lote_sha256,
      xml_sha256: plano.xml_sha256,
      xml_bytes: plano.xml_bytes,
      idempotency_key: plano.idempotency_key,
      auditoria: {
        ator: String(req.headers?.['x-forwarded-user'] || 'admin').slice(0, 120),
        lote_sha256: plano.lote_sha256
      }
    });
  } catch (erro) {
    return json(res, 400, { ok: false, erro: erro.message });
  }
};
