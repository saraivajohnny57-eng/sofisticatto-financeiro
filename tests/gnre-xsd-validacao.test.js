'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { montarConsultaRecibo } = require('../lib/integracoes/gnre-consulta-xml');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'gnre-validar-xsd.py');
const SCHEMA = path.join(RAIZ, 'docs', 'gnre-xsd', 'lote_gnre_consulta_v1.00.xsd');
const PYLIBS = process.env.GNRE_PYLIBS || path.join(RAIZ, '.tools', 'pylibs');
const ENV = {
  ...process.env,
  PYTHONPATH: [PYLIBS, process.env.PYTHONPATH].filter(Boolean).join(':')
};

function xmlschemaDisponivel() {
  const r = spawnSync('python3', ['-c', 'import xmlschema'], { env: ENV, encoding: 'utf8' });
  return r.status === 0;
}

function validar(xml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnre-xsd-'));
  const arquivo = path.join(dir, 'documento.xml');
  try {
    fs.writeFileSync(arquivo, xml, 'utf8');
    const r = spawnSync('python3', [SCRIPT, '--schema', SCHEMA, '--xml', arquivo], {
      env: ENV,
      encoding: 'utf8'
    });
    let saida = {};
    try { saida = JSON.parse(r.stdout || '{}'); } catch { saida = { erro: r.stdout }; }
    return { status: r.status, saida };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const skip = xmlschemaDisponivel() ? false : 'xmlschema indisponível (defina GNRE_PYLIBS ou instale xmlschema)';

test('TConsLote_GNRE gerado é válido contra o XSD oficial', { skip }, () => {
  const xml = montarConsultaRecibo('0000001234');
  assert.match(xml, /^<TConsLote_GNRE xmlns="http:\/\/www\.gnre\.pe\.gov\.br">/);
  assert.match(xml, /<ambiente>2<\/ambiente><numeroRecibo>0000001234<\/numeroRecibo>/);
  const r = validar(xml);
  assert.equal(r.status, 0, JSON.stringify(r.saida));
  assert.equal(r.saida.ok, true);
});

test('TConsLote_GNRE rejeita raiz, ambiente, tamanho e estrutura inválidos', { skip }, () => {
  const invalidos = [
    // raiz com grafia incorreta
    '<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo></TconsLote_GNRE>',
    // ambiente fora do enum 1/2
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>3</ambiente><numeroRecibo>0000001234</numeroRecibo></TConsLote_GNRE>',
    // recibo com 9 dígitos
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>000001234</numeroRecibo></TConsLote_GNRE>',
    // recibo com 14 dígitos (XSD de consulta aceita somente 10)
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>00000000123456</numeroRecibo></TConsLote_GNRE>',
    // elemento obrigatório ausente
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente></TConsLote_GNRE>',
    // ordem invertida
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><numeroRecibo>0000001234</numeroRecibo><ambiente>2</ambiente></TConsLote_GNRE>',
    // elemento extra
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo><extra>1</extra></TConsLote_GNRE>',
    // namespace errado
    '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br/errado"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo></TConsLote_GNRE>'
  ];
  for (const xml of invalidos) {
    const r = validar(xml);
    assert.equal(r.status, 1, `deveria ser inválido: ${xml}`);
    assert.equal(r.saida.ok, false);
    assert.ok(r.saida.total_erros >= 1, JSON.stringify(r.saida));
  }
});

test('montarConsultaRecibo recusa recibos de 14 dígitos e valores não numéricos', () => {
  assert.throws(() => montarConsultaRecibo('00000000123456'), /10 digitos/);
  assert.throws(() => montarConsultaRecibo('000000123A'), /10 ou 14 digitos/);
});
