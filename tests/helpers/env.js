'use strict';

// Nomes de variáveis usadas pelas integrações. Nenhum valor real é lido
// deste arquivo: os testes definem apenas valores fictícios.
const MANAGED = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INTEGRATIONS_ADMIN_KEY',
  'INTEGRATIONS_MASTER_PASSWORD',
  'INTEGRATIONS_ENCRYPTION_KEY',
  'INTEGRATIONS_DEVICE_SECRET',
  'CRON_SECRET',
  'SSW_OCORRENCIAS_WEBHOOK_TOKEN',
  'ALFA_API_KEY',
  'ACCERT_SSW_DOMINIO',
  'ACCERT_SSW_LOGIN',
  'ACCERT_SSW_SENHA',
  'ACCERT_SSW_CODIGO_MERCADORIA',
  'ACCERT_SSW_SENHA_RASTREIO',
  'ACCERT_SSW_CNPJ_RASTREIO',
  'ACCERT_DOMINIO',
  'ACCERT_LOGIN',
  'ACCERT_SENHA',
  'TG_SSW_DOMINIO',
  'TG_SSW_LOGIN',
  'TG_SSW_SENHA',
  'TG_SSW_CODIGO_MERCADORIA',
  'TG_SSW_SENHA_RASTREIO',
  'TG_SSW_CNPJ_RASTREIO',
  'TGT_SSW_DOMINIO',
  'TGT_SSW_LOGIN',
  'TGT_SSW_SENHA',
  'TGT_SSW_CODIGO_MERCADORIA',
  'TGT_SSW_SENHA_RASTREIO',
  'TGT_SSW_CNPJ_RASTREIO',
  'CORREIOS_USUARIO',
  'CORREIOS_CODIGO_ACESSO',
  'CORREIOS_CARTAO_POSTAGEM',
  'CORREIOS_CONTRATO',
  'CORREIOS_DR',
  'CORREIOS_CNPJ',
  'CORREIOS_CEP_ORIGEM',
  'CORREIOS_SERVICOS',
  'CORREIOS_REMETENTE_NOME',
  'CORREIOS_REMETENTE_TELEFONE',
  'CORREIOS_REMETENTE_EMAIL',
  'CORREIOS_REMETENTE_LOGRADOURO',
  'CORREIOS_REMETENTE_NUMERO',
  'CORREIOS_REMETENTE_COMPLEMENTO',
  'CORREIOS_REMETENTE_BAIRRO',
  'RODONAVES_TRACKING_TAX_ID',
  'RODONAVES_CUSTOMER_TAX_ID',
  'SOFISTICATTO_CNPJ',
  'BB_CNPJ',
  'BB_CONVENIO',
  'GNRE_AMBIENTE',
  'GNRE_BASE_URL',
  'GNRE_CERT_PFX_BASE64',
  'GNRE_CERT_PASSWORD',
  'GOOGLE_GMAIL_ADMIN_USER',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SMTP_FROM_EMAIL',
  'SMTP_FROM_NAME',
  'ENABLE_BRADESCO_BAIXA_REAL'
];

let snapshot = null;

function preserveEnv() {
  if (snapshot) return;
  snapshot = { ...process.env };
}

function resetEnv() {
  for (const key of MANAGED) delete process.env[key];
}

function restoreEnv() {
  if (!snapshot) return;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, snapshot);
  snapshot = null;
}

function setEnv(values) {
  Object.assign(process.env, values);
}

module.exports = { MANAGED, preserveEnv, resetEnv, restoreEnv, setEnv };
