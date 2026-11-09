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
const { interpretarRecepcao } = require('./gnre-recepcao-retorno');

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
  return interpretarRecepcao(xml).recibo || null;
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
  const retorno=interpretarRecepcao(resultado.body);
  const httpAceito=resultado.status>=200&&resultado.status<300;
  // O retorno do servico precisa confirmar codigo 100 + numero do recibo.
  // HTTP 200 isolado NAO confirma recepcao e nao gera autorizacao fiscal.
  if(httpAceito&&analise.ok&&retorno.estado==='rejeitado'){
    await repositorio.falhar(plano.idempotency_key,{
      http_status:resultado.status,categoria:'rejeicao_gnre_'+retorno.codigo
    });
    return {ok:false,dry_run:false,estado:ESTADOS.FALHA,http_status:resultado.status,
      categoria:'rejeicao_gnre',codigo_gnre:retorno.codigo,
      motivo:'Lote rejeitado pela aplicacao GNRE. Nao reenviar automaticamente.',...base};
  }
  if(!httpAceito||!analise.ok||!retorno.ok){
    await repositorio.incerto(plano.idempotency_key,{
      erro_codigo:'GNRE_RESPOSTA_NAO_CONFIRMADA'
    });
    return {ok:false,dry_run:false,estado:ESTADOS.INCERTO,
      http_status:resultado.status||null,categoria:analise.categoria||'resposta_invalida',
      erro_codigo:'GNRE_RESPOSTA_NAO_CONFIRMADA',
      motivo:'Recepcao nao confirmada (sem codigo 100 e recibo oficiais). NAO reenviar ate reconciliar no portal.',
      ...base};
  }
  const recibo=retorno.recibo;
  try{
    await repositorio.concluir(plano.idempotency_key,{
      http_status:resultado.status,
      categoria:analise.categoria,
      recibo_retorno_mascarado:mascararRecibo(recibo),
      recibo_completo:recibo
    });
  }catch(_e){
    // O servidor ja recebeu o lote. A falta de persistencia do recibo
    // nunca deve autorizar um segundo POST.
    return {ok:false,dry_run:false,estado:ESTADOS.INCERTO,
      erro_codigo:'GNRE_RECIBO_PERSISTENCIA_FALHOU',
      motivo:'Lote aceito pela GNRE, mas o recibo nao foi confirmado no armazenamento. NAO reenviar.',...base};
  }
  return {ok:true,dry_run:false,estado:ESTADOS.CONCLUIDO,
    codigo_gnre:'100',http_status:resultado.status,
    categoria:analise.categoria,validacao_fiscal:'nao_realizada',
    recibo_mascarado:mascararRecibo(recibo),possui_recibo:true,...base};

}

module.exports = {
  ESTADOS,
  mascararRecibo,
  extrairRecibo,
  chaveIdempotencia,
  montarPlanoRecepcao,
  executarRecepcao
};
