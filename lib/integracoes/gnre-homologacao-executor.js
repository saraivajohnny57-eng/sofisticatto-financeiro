'use strict';

// Executor de homologação GNRE.
// Nesta fase a transmissão real permanece desabilitada por padrão.
// A função executarConsulta exige transporte e repositório injetados;
// nenhum segredo, XML fiscal ou recibo completo é devolvido ao chamador.
const crypto = require('node:crypto');
const { SERVICOS } = require('./gnre-contrato');
const { SOAP_ACTIONS } = require('./gnre-soap-actions');
const { montarConsultaRecibo } = require('./gnre-consulta-xml');
const { montarEnvelopeSoap12 } = require('./gnre-envelope-soap12');
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

function mascararRecibo(recibo) {
  const s = String(recibo || '');
  if (!s) return '';
  if (s.length <= 4) return '•'.repeat(s.length);
  return '•'.repeat(s.length - 4) + s.slice(-4);
}

function chaveIdempotencia(servico, recibo) {
  if (!['consulta'].includes(servico)) throw new TypeError('Serviço GNRE não suportado pelo executor.');
  return `gnre:${servico}:${sha256(recibo).slice(0, 32)}`;
}

function montarPlanoConsulta(recibo) {
  const xmlDados = montarConsultaRecibo(recibo);
  const xml = montarEnvelopeSoap12({ servico: 'consulta', xmlDados });
  return {
    servico: 'consulta',
    destino: SERVICOS.resultado,
    soapAction: SOAP_ACTIONS.consulta,
    xml,
    xml_sha256: sha256(xml),
    xml_bytes: Buffer.byteLength(xml, 'utf8'),
    idempotency_key: chaveIdempotencia('consulta', recibo),
    recibo_mascarado: mascararRecibo(recibo)
  };
}

function codigoErro(erro) {
  const codigo = String(erro?.code || '');
  return /^[A-Z][A-Z0-9_]{1,60}$/.test(codigo) ? codigo : 'ERRO_TRANSPORTE';
}

async function executarConsulta({
  recibo,
  repositorio,
  certificado,
  transport,
  ator = 'sistema',
  permitirTransmissao = false,
  timeoutMs = 15000
} = {}) {
  const plano = montarPlanoConsulta(recibo);
  const base = {
    servico: plano.servico,
    destino: plano.destino,
    soap_action: plano.soapAction,
    xml_sha256: plano.xml_sha256,
    xml_bytes: plano.xml_bytes,
    idempotency_key: plano.idempotency_key,
    recibo_mascarado: plano.recibo_mascarado
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
    servico: plano.servico,
    recibo_mascarado: plano.recibo_mascarado,
    ator
  });
  if (!reserva?.ok) {
    return {
      ok: false,
      dry_run: false,
      bloqueado: true,
      estado: reserva?.existente?.estado || 'desconhecido',
      ...base,
      motivo: 'Execução já reservada ou concluída. Nenhum novo envio foi feito.'
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
      motivo: 'Resultado incerto. Não repetir automaticamente; consulte o recibo antes de qualquer nova tentativa.'
    };
  }

  const analise = resultado.analise || { ok: false, categoria: 'resposta_invalida' };
  if (analise.ok && resultado.status >= 200 && resultado.status < 300) {
    await repositorio.concluir(plano.idempotency_key, {
      http_status: resultado.status,
      categoria: analise.categoria
    });
    return {
      ok: true,
      dry_run: false,
      estado: ESTADOS.CONCLUIDO,
      http_status: resultado.status,
      categoria: analise.categoria,
      validacao_fiscal: analise.validacaoFiscal || 'nao_realizada',
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
  chaveIdempotencia,
  montarPlanoConsulta,
  executarConsulta
};
