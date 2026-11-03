'use strict';
const fs = require('node:fs');
const { guiaSimples } = require('../lib/integracoes/gnre-guia-simples-offline');
const { montarLoteGnre } = require('../lib/integracoes/gnre-lote-xml');
const guia = guiaSimples({
  ufFavorecida: 'MG',
  receita: '100099',
  valorPrincipal: '79.17',
  dataVencimento: '2026-07-08',
  contribuinte: { cnpj: '12345678000195', razaoSocial: 'Empresa de Teste' },
  documentoOrigem: '50371',
  tipoDocumentoOrigem: '10'
});
fs.writeFileSync(process.argv[2] || '/tmp/gnre-lote-fixture.xml', montarLoteGnre([guia]));
