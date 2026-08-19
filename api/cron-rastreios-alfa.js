/**
 * Cron de sincronização do rastreamento Alfa Transportes.
 *
 * A rotina reutiliza o mesmo serviço usado pelo botão "Atualizar todos os rastreios"
 * do portal, mas é executada pelo Vercel Cron em produção.
 */
const atualizarRastreiosAlfa = require("../lib/integracoes/atualizar-rastreios-alfa");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, erro: "Método não permitido." });
  }

  return atualizarRastreiosAlfa(req, res);
};
