'use strict';

// Executor de RECEPÇÃO de lote GNRE em homologação.
// Envia TLote_GNRE para GnreLoteRecepcao. Transmissão desabilitada por padrão.
// Nunca devolve XML fiscal, chave privada ou recibo completo.
const crypto = require('node:crypto');
const { SERVICOS } = require('./gnre-contrato');
const { SOAP_ACTIONS } = require('./gnre-soap-actions');
const { montarEnvelopeSoap12 } = require('./gnre-envelope-soap12');
const { montarLoteGnre } = require('./gnre-lote-xml');
const { enviarSoap } = require('./gnre-soap-homologacao');

const ESTADOS = Object.freeze({
  RESERVADO: 'reservado',
  ENVIANDO: 'enviando',
  CONCLUIDO: 'concluido',
  FALHA: 'falha',
  INCERTO: 'resultado_incerto'
});

function sha256(valor) {
  return crypto.createHash('sha256').update(String(valor), 'utf8').digest('hex');
}

// Recibos de 10 ou 14 dígitos — apenas os 4 últimos são expostos.
function mascararRecibo(recibo) {
  const s = String(recibo == null ? '' : recibo).replace(/\D/g, '');
  if (!s) return '';
  if (s.length <= 4) return '•'.repeat(s.length);
  return '•'.repeat(s.length - 4) + s.slice(-4);
}

// Extrai o recibo do envelope SOAP de resposta, sem expor o restante.
function extrairRecibo(xml) {
  const texto = String(xml || '');
  const m = texto.match(/<(?:\w+:)?numeroRecibo>\s*(\d{10}|\d{14})\s*<\/(?:\w+:)?numeroRecibo>/i);
  return m ? m[1] : null;
}

// A chave cobre o conteúdo do lote: reenvios do MESMO lote são bloqueados,
// lotes diferentes (ex.: correção legítima) recebem chave distinta.
function chaveIdempotencia(loteSha256) {
  if (!/^[a-f0-9]{64}$/.test(String(loteSha256))) {
    throw new TypeError('Hash do lote inválido para chave de idempotência.');
  }
  return `gnre:recepcao:${loteSha256.slice(0, 32)}`;
}

function montarPlanoRecepcao(guias) {
  const lote = montarLoteGnre(guias);
  const loteSha = sha256(lote);
  const xml = montarEnvelopeSoap12({ servico: 'recepcao', xmlDados: lote });
  return {
    servico: 'recepcao',
    destino: SERVICOS.recepcao,
    soapAction: SOAP_ACTIONS.recepcao,
    xml,
    lote_sha256: loteSha,
    xml_sha256: sha256(xml),
    xml_bytes: Buffer.byteLength(xml, 'utf8'),
    idempotency_key: chaveIdempotencia(loteSha),
    guias: Array.isArray(guias) ? guias.length : 0
  };
}

function codigoErro(erro) {
  const codigo = String(erro?.code || '');
  return /^[A-Z][A-Z0-9_]{1,60}$/.test(codigo) ? codigo : 'ERRO_TRANSPORTE';
}

async function executarRecepcao({
  guias,
  repositorio,
  certificado,
  transport,
  ator = 'sistema',
  permitirTransmissao = false,
  timeoutMs = 20000
} = {}) {
  const plano = montarPlanoRecepcao(guias);
  const base = {
    servico: plano.servico,
    destino: plano.destino,
    soap_action: plano.soapAction,
    lote_sha256: plano.lote_sha256,
    xml_sha256: plano.xml_sha256,
    xml_bytes: plano.xml_bytes,
    idempotency_key: plano.idempotency_key,
    guias: plano.guias
  };

  if (!permitirTransmissao) {
    return { ok: true, dry_run: true, transmissao: 'desabilitada_nesta_fase', ...base };
  }
  if (!certificado) throw new Error('Certificado A1 obrigatório para transmissão de homologação.');
  if (!repositorio || typeof repositorio.reservar !== 'function') {
    throw new Error('Repositório de idempotência obrigatório para transmissão de homologação.');
  }

  const reserva = await repositorio.reservar({
    chave: plano.idempotency_key,
    servico: 'recepcao',
    recibo_mascarado: '',
    ator,
    lote_sha256: plano.lote_sha256
  });
  if (!reserva?.ok) {
    return {
      ok: false,
      dry_run: false,
      bloqueado: true,
      estado: reserva?.existente?.estado || 'desconhecido',
      ...base,
      motivo: 'Lote idêntico já reservado ou transmitido. Nenhum novo envio foi feito.'
    };
  }

  await repositorio.marcarEnviando(plano.idempotency_key);
  let resultado;
  try {
    resultado = await enviarSoap({
      destino: plano.destino,
      xml: plano.xml,
      certificado,
      soapAction: plano.soapAction,
      transport,
      timeoutMs
    });
  } catch (erro) {
    const codigo = codigoErro(erro);
    await repositorio.incerto(plano.idempotency_key, { erro_codigo: codigo });
    return {
      ok: false,
      dry_run: false,
      estado: ESTADOS.INCERTO,
      ...base,
      erro_codigo: codigo,
      motivo: 'Resultado incerto. NÃO reenviar: verifique no portal se o lote foi recebido antes de qualquer nova tentativa.'
    };
  }

  const analise = resultado.analise || { ok: false, categoria: 'resposta_invalida' };
  const recibo = extrairRecibo(resultado.body);
  const sucesso = analise.ok && resultado.status >= 200 && resultado.status < 300;

  if (sucesso && !recibo) {
    await repositorio.incerto(plano.idempotency_key, { erro_codigo: 'GNRE_RECIBO_AUSENTE' });
    return { ok: false, dry_run: false, estado: ESTADOS.INCERTO, ...base,
      motivo: 'Resposta recebida sem recibo valido. NAO retransmitir; reconciliar manualmente.' };
  }

  if (sucesso) {
    await repositorio.concluir(plano.idempotency_key, {
      http_status: resultado.status,
      categoria: analise.categoria,
      recibo_retorno_mascarado: mascararRecibo(recibo),
      recibo_completo: recibo
    });
    return {
      ok: true,
      dry_run: false,
      estado: ESTADOS.CONCLUIDO,
      http_status: resultado.status,
      categoria: analise.categoria,
      validacao_fiscal: analise.validacaoFiscal || 'nao_realizada',
      recibo_mascarado: mascararRecibo(recibo),
      possui_recibo: Boolean(recibo),
      ...base
    };
  }

  await repositorio.falhar(plano.idempotency_key, {
    http_status: resultado.status || null,
    categoria: analise.categoria || 'resposta_invalida'
  });
  return {
    ok: false,
    dry_run: false,
    estado: ESTADOS.FALHA,
    http_status: resultado.status || null,
    categoria: analise.categoria || 'resposta_invalida',
    ...base
  };
}

module.exports = {
  ESTADOS,
  mascararRecibo,
  extrairRecibo,
  chaveIdempotencia,
  montarPlanoRecepcao,
  executarRecepcao
};
