'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { verificarDependenciasXsd } = require('../lib/integracoes/gnre-xsd-preflight');

const RAIZ = path.join(__dirname, '..');

function ler(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

test('GNRE grafo XSD local fica completo com as dependências oficiais v1.00', () => {
  const resultado = verificarDependenciasXsd();
  assert.equal(resultado.completo, true, JSON.stringify(resultado.faltantes));
  assert.deepEqual(resultado.faltantes, []);
  assert.ok(resultado.arquivos >= 9);
});

test('GNRE dependências v1.00 correspondem ao manifesto SHA-256 oficial', () => {
  const manifesto = JSON.parse(ler('docs/gnre-oficial/manifest.sha256.json'));
  const xsds = manifesto.filter((item) => item.nome.endsWith('.xsd'));
  assert.ok(xsds.length >= 2);
  for (const item of xsds) {
    const bytes = fs.readFileSync(path.join(RAIZ, 'docs', 'gnre-xsd', item.nome));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, item.sha256, item.nome);
    assert.equal(bytes.length, item.bytes, item.nome);
  }
});
