'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadBlock } = require('../helpers/sandbox');

const { context: cnab } = loadBlock(
  'financeiro.js',
  'function brRetFatV307',
  'async function lerRetornoBradescoV301'
);

function linha400(opcoes = {}) {
  const {
    tipo = '1',
    nosso = '000012345678',
    codigo = '06',
    dataOcorrencia = '050124',
    documento = '0000000123',
    vencimento = '100224',
    valor = '0000000123456',
    pago = '0000000123400',
    credito = '060124'
  } = opcoes;
  const a = Array(400).fill(' ');
  const put = (ini, fim, v) => {
    const tamanho = fim - ini + 1;
    if (v.length !== tamanho) throw new Error(`Campo ${ini}-${fim} com tamanho ${v.length}`);
    a.splice(ini - 1, tamanho, ...v);
  };
  put(1, 1, tipo);
  put(71, 82, nosso);
  put(109, 110, codigo);
  put(111, 116, dataOcorrencia);
  put(117, 126, documento);
  put(147, 152, vencimento);
  put(153, 165, valor);
  put(254, 266, pago);
  put(296, 301, credito);
  return a.join('');
}

test('brRetFatV307 usa posições 1-based e remove espaços', () => {
  assert.equal(cnab.brRetFatV307('  0123456789  ', 3, 6), '0123');
  assert.equal(cnab.brRetFatV307('', 1, 2), '');
});

test('brRetNumV307 converte centavos e ignora caracteres não numéricos', () => {
  assert.equal(cnab.brRetNumV307('000000123456'), 1234.56);
  assert.equal(cnab.brRetNumV307(''), 0);
  assert.equal(cnab.brRetNumV307('000000000001'), 0.01);
});

test('brRetDataV307 converte DDMMAA e trata zeros', () => {
  assert.equal(cnab.brRetDataV307('050124'), '2024-01-05');
  assert.equal(cnab.brRetDataV307('010199'), '1999-01-01');
  assert.equal(cnab.brRetDataV307('000000'), '');
  assert.equal(cnab.brRetDataV307('0501'), '');
});

test('brRetNossoV307 remove zeros à esquerda', () => {
  assert.equal(cnab.brRetNossoV307('000012345678'), '12345678');
  assert.equal(cnab.brRetNossoV307('000000000000'), '');
});

test('brRetOcorrenciaV307 mapeia códigos conhecidos e desconhecidos', () => {
  const liquidacao = cnab.brRetOcorrenciaV307('06');
  assert.equal(liquidacao[0], 'Liquidação');
  assert.equal(liquidacao[1], 'pago');

  const desconhecida = cnab.brRetOcorrenciaV307('99');
  assert.match(desconhecida[0], /99/);
  assert.equal(desconhecida[1], 'info');

  assert.equal(cnab.brRetOcorrenciaV307('2')[0], 'Entrada confirmada');
});

test('brRetParse400V307 lê o registro detalhe tipo 1', () => {
  const linha = linha400();
  const r = cnab.brRetParse400V307(linha, 'teste.RET');
  assert.equal(r.arquivo, 'teste.RET');
  assert.equal(r.codigo_ocorrencia, '06');
  assert.equal(r.ocorrencia, 'Liquidação');
  assert.equal(r.acao, 'pago');
  assert.equal(r.nosso_numero, '000012345678');
  assert.equal(r.nosso_chave, '12345678');
  assert.equal(r.numero_documento, '0000000123');
  assert.equal(r.data_ocorrencia, '2024-01-05');
  assert.equal(r.vencimento, '2024-02-10');
  assert.equal(r.valor_titulo, 1234.56);
  assert.equal(r.valor_pago, 1234);
  assert.equal(r.data_credito, '2024-01-06');
  assert.equal(r.linha, linha);
});

test('brRetParse400V307 rejeita linha com tamanho ou tipo inválido', () => {
  assert.equal(cnab.brRetParse400V307('x'.repeat(399), 'teste.RET'), null);
  assert.equal(cnab.brRetParse400V307(linha400({ tipo: '2' }), 'teste.RET'), null);
  assert.equal(cnab.brRetParse400V307('', 'teste.RET'), null);
});

test('brRetChaveMovV307 monta chave de deduplicação estável', () => {
  const r = cnab.brRetParse400V307(linha400(), 'teste.RET');
  assert.equal(cnab.brRetChaveMovV307(r), '12345678|06|2024-01-05|1234.00|1234.56');
});
