/**
 * Sofisticatto Financeiro — API unificada de integrações V23.
 *
 * Exemplos:
 * POST /api/integracoes?action=validar-chave
 * POST /api/integracoes?action=cotar-rodonaves
 * GET  /api/integracoes?action=status-credenciais&convite_id=...
 * POST /api/integracoes?action=atualizar-status
 */
const ROTAS = Object.freeze({
  "validar-chave": "../lib/integracoes/validar-chave",
  "status-servidor": "../lib/integracoes/status-servidor",
  "salvar-credenciais": "../lib/integracoes/salvar-credenciais",
  "status-credenciais": "../lib/integracoes/status-credenciais",
  "testar-homologacao": "../lib/integracoes/testar-homologacao",
  "testar-rodonaves-auth": "../lib/integracoes/testar-rodonaves-auth",
  "cotar-rodonaves": "../lib/integracoes/cotar-rodonaves",
  "agendar-coleta-rodonaves": "../lib/integracoes/agendar-coleta-rodonaves",
  "agendar-coleta-rodonaves-endereco": "../lib/integracoes/agendar-coleta-rodonaves-endereco",
  "consultar-coleta-rodonaves": "../lib/integracoes/consultar-coleta-rodonaves",
  "atualizar-status": "../lib/integracoes/atualizar-status"
});

function responder(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || "").trim();

  if (action === "health") {
    return responder(res, 200, {
      ok: true,
      servico: "sofisticatto-financeiro",
      modulo: "api-integracoes-unificada",
      versao: "23",
      rotas: Object.keys(ROTAS).length,
      data: new Date().toISOString()
    });
  }

  const modulo = ROTAS[action];
  if (!modulo) {
    return responder(res, 404, {
      ok: false,
      erro: "Ação de integração não encontrada.",
      action,
      acoes_disponiveis: [...Object.keys(ROTAS), "health"]
    });
  }

  try {
    const executar = require(modulo);
    return await executar(req, res);
  } catch (erro) {
    console.error("Falha na API unificada:", action, erro);
    if (res.headersSent) return;
    return responder(res, 500, {
      ok: false,
      erro: "Falha interna ao executar a integração.",
      detalhe: erro?.message || String(erro)
    });
  }
};
