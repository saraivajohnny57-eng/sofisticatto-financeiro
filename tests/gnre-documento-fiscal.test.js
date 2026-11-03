'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { cpfValido, cnpjValido, documentoValido, digitos } = require('../lib/integracoes/gnre-documento-fiscal');
const { guiaSimples } = require('../lib/integracoes/gnre-guia-simples-offline');

test('CNPJ válido é aceito; dígito verificador errado e repetidos são rejeitados', () => {
  assert.equal(cnpjValido('05451985000195'), true);
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('11111111111111'), false);
  assert.equal(cnpjValido('12345678000196'), false);
  assert.equal(cnpjValido('1234567800019'), false);
  assert.equal(cnpjValido(''), false);
});

test('CPF válido é aceito; dígito errado e repetidos são rejeitados', () => {
  assert.equal(cpfValido('12345678909'), true);
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cpfValido('12345678901'), false);
  assert.equal(cpfValido('1234567890'), false);
});

test('documentoValido escolhe CPF ou CNPJ pelo tamanho', () => {
  assert.equal(documentoValido('12345678909'), true);
  assert.equal(documentoValido('05451985000195'), true);
  assert.equal(documentoValido('1234567890'), false);
  assert.equal(digitos('05.451.985/0001-95'), '05451985000195');
});

test('guiaSimples rejeita CNPJ com dígito verificador inválido', () => {
  assert.throws(
    () => guiaSimples({
      ufFavorecida: 'MG',
      receita: '100099',
      valorPrincipal: '79.17',
      dataVencimento: '2026-07-08',
      contribuinte: { cnpj: '11111111111111' },
      documentoOrigem: '50371',
      tipoDocumentoOrigem: '10'
    }),
    /dígito verificador inválido/
  );
});

test('guiaSimples rejeita CPF com dígito verificador inválido', () => {
  assert.throws(
    () => guiaSimples({
      ufFavorecida: 'MG',
      receita: '100099',
      valorPrincipal: '79.17',
      dataVencimento: '2026-07-08',
      contribuinte: { cpf: '12345678901' },
      documentoOrigem: '50371',
      tipoDocumentoOrigem: '10'
    }),
    /dígito verificador inválido/
  );
});

test('guiaSimples aceita CNPJ válido e gera XML com o documento', () => {
  const xml = guiaSimples({
    ufFavorecida: 'MG',
    receita: '100099',
    valorPrincipal: '79.17',
    dataVencimento: '2026-07-08',
    contribuinte: { cnpj: '05451985000195', razaoSocial: 'Sofisticatto Teste' },
    documentoOrigem: '50371',
    tipoDocumentoOrigem: '10'
  });
  assert.match(xml, /<CNPJ>05451985000195<\/CNPJ>/);
  assert.match(xml, /versao="2.00"/);
});
