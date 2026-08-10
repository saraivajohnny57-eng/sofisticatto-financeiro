/**
 * Sofisticatto Financeiro — API unificada de integrações V24.
 *
 * IMPORTANTE:
 * Todos os módulos são importados estaticamente para que a Vercel
 * os inclua corretamente no bundle da Serverless Function.
 */
const validarChave = require("../lib/integracoes/validar-chave");
const statusServidor = require("../lib/integracoes/status-servidor");
const salvarCredenciais = require("../lib/integracoes/salvar-credenciais");
const statusCredenciais = require("../lib/integracoes/status-credenciais");
const testarHomologacao = require("../lib/integracoes/testar-homologacao");
const testarRodonavesAuth = require("../lib/integracoes/testar-rodonaves-auth");
const cotarRodonaves = require("../lib/integracoes/cotar-rodonaves");
const agendarColetaRodonaves = require("../lib/integracoes/agendar-coleta-rodonaves");
const agendarColetaRodonavesEndereco = require("../lib/integracoes/agendar-coleta-rodonaves-endereco");
const consultarColetaRodonaves = require("../lib/integracoes/consultar-coleta-rodonaves");
const atualizarStatus = require("../lib/integracoes/atualizar-status");
const consultarRastreioRodonaves = require("../lib/integracoes/consultar-rastreio-rodonaves");

const ROTAS = Object.freeze({
  "validar-chave": validarChave,
  "status-servidor": statusServidor,
  "salvar-credenciais": salvarCredenciais,
  "status-credenciais": statusCredenciais,
  "testar-homologacao": testarHomologacao,
  "testar-rodonaves-auth": testarRodonavesAuth,
  "cotar-rodonaves": cotarRodonaves,
  "agendar-coleta-rodonaves": agendarColetaRodonaves,
  "agendar-coleta-rodonaves-endereco": agendarColetaRodonavesEndereco,
  "consultar-coleta-rodonaves": consultarColetaRodonaves,
  "atualizar-status": atualizarStatus,
  "consultar-rastreio-rodonaves": consultarRastreioRodonaves
});

function responder(res, status, body) {
  return res.status(status).json(body);
}

function detalhesErro(erro) {
  return {
    nome: erro?.name || "Error",
    mensagem: erro?.message || String(erro),
    codigo: erro?.code || null,
    arquivo: erro?.requireStack?.[0] || null
  };
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || "").trim();

  if (action === "health") {
    return responder(res, 200, {
      ok: true,
      servico: "sofisticatto-financeiro",
      modulo: "api-integracoes-unificada",
      versao: "33",
      rotas_carregadas: Object.keys(ROTAS).length,
      node: process.version,
      ambiente: process.env.VERCEL_ENV || "local",
      variaveis: {
        integrations_admin_key: Boolean(process.env.INTEGRATIONS_ADMIN_KEY),
        integrations_encryption_key: Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY),
        supabase_url: Boolean(process.env.SUPABASE_URL),
        supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        cron_secret: Boolean(process.env.CRON_SECRET)
      },
      data: new Date().toISOString()
    });
  }

  const executar = ROTAS[action];
  if (!executar) {
    return responder(res, 404, {
      ok: false,
      erro: "Ação de integração não encontrada.",
      action,
      acoes_disponiveis: [...Object.keys(ROTAS), "health"]
    });
  }

  try {
    return await executar(req, res);
  } catch (erro) {
    const diagnostico = detalhesErro(erro);
    console.error("[API INTEGRACOES V33]", {
      action,
      method: req.method,
      diagnostico,
      stack: erro?.stack
    });

    if (res.headersSent) return;

    return responder(res, 500, {
      ok: false,
      erro: "Falha interna ao executar a integração.",
      action,
      diagnostico
    });
  }
};
