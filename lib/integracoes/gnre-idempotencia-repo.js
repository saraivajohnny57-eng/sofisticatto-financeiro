'use strict';

// Repositório de idempotência/auditoria do executor GNRE.
// Usa PostgREST via service role. Nunca grava XML, recibo completo, senha ou PFX.
const { supabaseRest } = require('./_utils');

const TABELA = 'gnre_homologacao_execucoes';
const COLUNAS = 'chave_idempotencia,servico,recibo_mascarado,ator,estado,tentativa,http_status,categoria,erro_codigo,criado_em,atualizado_em';

function agora() {
  return new Date().toISOString();
}

function filtroChave(chave) {
  return `?chave_idempotencia=eq.${encodeURIComponent(chave)}`;
}

async function buscar(chave) {
  const rows = await supabaseRest(TABELA, { query: `${filtroChave(chave)}&select=${COLUNAS}&limit=1` });
  return Array.isArray(rows) ? rows[0] || null : null;
}

// Reserva atômica: o índice único em chave_idempotencia garante que apenas
// uma execução por chave exista. Conflito = já reservado.
async function reservar({ chave, servico, recibo_mascarado, ator }) {
  const existente = await buscar(chave);
  if (existente) return { ok: false, existente };
  try {
    await supabaseRest(TABELA, {
      method: 'POST',
      body: {
        chave_idempotencia: chave,
        servico,
        recibo_mascarado,
        ator: ator || null,
        estado: 'reservado',
        tentativa: 1,
        criado_em: agora(),
        atualizado_em: agora()
      }
    });
    return { ok: true };
  } catch (erro) {
    const msg = String(erro?.message || '');
    if (/duplicate|unique|conflict|already exists/i.test(msg)) {
      return { ok: false, existente: await buscar(chave) };
    }
    throw erro;
  }
}

async function atualizar(chave, campos) {
  await supabaseRest(TABELA, {
    method: 'PATCH',
    query: filtroChave(chave),
    body: { ...campos, atualizado_em: agora() }
  });
}

function marcarEnviando(chave) {
  return atualizar(chave, { estado: 'enviando' });
}

function concluir(chave, { http_status, categoria }) {
  return atualizar(chave, { estado: 'concluido', http_status, categoria });
}

function falhar(chave, { http_status, categoria }) {
  return atualizar(chave, { estado: 'falha', http_status: http_status || null, categoria });
}

function incerto(chave, { erro_codigo }) {
  return atualizar(chave, { estado: 'resultado_incerto', erro_codigo });
}

// Somente leitura: apoia a reconciliação manual de resultado incerto.
async function listarIncertos(limite = 50) {
  const rows = await supabaseRest(TABELA, {
    query: `?estado=eq.resultado_incerto&select=${COLUNAS}&order=criado_em.desc&limit=${Number(limite) || 50}`
  });
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  TABELA,
  buscar,
  reservar,
  marcarEnviando,
  concluir,
  falhar,
  incerto,
  listarIncertos
};
