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
const cotarAlfa = require("../lib/integracoes/cotar-alfa");
const consultarRastreioAlfa = require("../lib/integracoes/consultar-rastreio-alfa");
const atualizarRastreiosAlfa = require("../lib/integracoes/atualizar-rastreios-alfa");
const agendarColetaAccert = require("../lib/integracoes/agendar-coleta-accert");
const agendarColetaSSW = require("../lib/integracoes/agendar-coleta-ssw");
const cotarCorreios = require("../lib/integracoes/cotar-correios");
const consultarRastreioCorreios = require("../lib/integracoes/consultar-rastreio-correios");
const testarCorreios = require("../lib/integracoes/testar-correios");
const configuracaoCorreios = require("../lib/integracoes/configuracao-correios");
const consultarRastreioSSW = require("../lib/integracoes/consultar-rastreio-ssw");
const cotarSSW = require("../lib/integracoes/cotar-ssw");
const salvarRastreioLogistica = require("../lib/integracoes/salvar-rastreio-logistica");
const atualizarRastreiosGeral = require("../lib/integracoes/atualizar-rastreios-geral");
const documentosCorreios = require("../lib/integracoes/documentos-correios");
const criarPrepostagemCorreios = require("../lib/integracoes/criar-prepostagem-correios");
const buscarCepCorreios = require("../lib/integracoes/buscar-cep-correios");
const verificarCobertura = require("../lib/integracoes/verificar-cobertura");

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
  "consultar-rastreio-rodonaves": consultarRastreioRodonaves,
  "cotar-alfa": cotarAlfa,
  "consultar-rastreio-alfa": consultarRastreioAlfa,
  "atualizar-rastreios-alfa": atualizarRastreiosAlfa,
  "agendar-coleta-accert": agendarColetaAccert,
  "agendar-coleta-ssw": agendarColetaSSW,
  "cotar-correios": cotarCorreios,
  "consultar-rastreio-correios": consultarRastreioCorreios,
  "testar-correios": testarCorreios,
  "configuracao-correios": configuracaoCorreios,
  "consultar-rastreio-ssw": consultarRastreioSSW,
  "cotar-ssw": cotarSSW,
  "salvar-rastreio-logistica": salvarRastreioLogistica,
  "atualizar-rastreios-geral": atualizarRastreiosGeral,
  "documentos-correios": documentosCorreios,
  "criar-prepostagem-correios": criarPrepostagemCorreios,
  "buscar-cep-correios": buscarCepCorreios,
  "verificar-cobertura": verificarCobertura,
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
      versao: "53-v128-correios-consulta-registro-prepostagem",
      rotas_carregadas: Object.keys(ROTAS).length,
      node: process.version,
      ambiente: process.env.VERCEL_ENV || "local",
      variaveis: {
        integrations_admin_key: Boolean(process.env.INTEGRATIONS_ADMIN_KEY),
        integrations_encryption_key: Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY),
        supabase_url: Boolean(process.env.SUPABASE_URL),
        supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        cron_secret: Boolean(process.env.CRON_SECRET),
        alfa_api_key: Boolean(process.env.ALFA_API_KEY),
        accert_ssw: Boolean(
          (process.env.ACCERT_SSW_DOMINIO||process.env.ACCERT_DOMINIO||'ACC') &&
          (process.env.ACCERT_SSW_LOGIN||process.env.ACCERT_LOGIN||process.env.SSW_ACCERT_LOGIN) &&
          (process.env.ACCERT_SSW_SENHA||process.env.ACCERT_SENHA||process.env.SSW_ACCERT_SENHA)
        ),
        tg_ssw: Boolean(
          (process.env.TG_SSW_DOMINIO||process.env.TGT_SSW_DOMINIO||process.env.TG_DOMINIO||process.env.TGT_DOMINIO||'TGT') &&
          (process.env.TG_SSW_LOGIN||process.env.TGT_SSW_LOGIN||process.env.TG_LOGIN||process.env.TGT_LOGIN) &&
          (process.env.TG_SSW_SENHA||process.env.TGT_SSW_SENHA||process.env.TG_SENHA||process.env.TGT_SENHA)
        ),
        correios: Boolean(process.env.CORREIOS_USUARIO && process.env.CORREIOS_CODIGO_ACESSO)
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
