'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { withModuleStubs } = require('./helpers/module-stubs');

function opensslDisponivel() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function gerarPfx(dir) {
  const chave = path.join(dir, 'chave.pem');
  const cert = path.join(dir, 'cert.pem');
  const pfx = path.join(dir, 'certificado.pfx');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
    '-keyout', chave, '-out', cert,
    '-subj', '/C=BR/O=SOFISTICATTO TESTE/CN=SOFISTICATTO TESTE:11222333000181'
  ], { stdio: 'ignore' });
  execFileSync('openssl', [
    'pkcs12', '-export', '-out', pfx, '-inkey', chave, '-in', cert,
    '-passout', 'pass:senha-ficticia'
  ], { stdio: 'ignore' });
  return fs.readFileSync(pfx);
}

const modulo = withModuleStubs({
  'node-forge': { pki: { oids: {} }, asn1: {}, pkcs12: {}, util: {} }
}, () => require('../lib/integracoes/gnre-certificado'));

test('GNRE inspeciona PFX A1 sem expor chave, senha ou conteúdo binário', (t) => {
  if (!opensslDisponivel()) {
    t.skip('openssl indisponível para gerar PFX sintético');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnre-pfx-'));
  try {
    const pfx = gerarPfx(dir);
    assert.equal(typeof modulo.inspecionarPfx, 'function');
    const meta = modulo.inspecionarPfx(pfx, 'senha-ficticia');
    assert.equal(meta.ok, true);
    assert.equal(meta.formato, 'PKCS#12');
    assert.equal(meta.cnpj, '11222333000181');
    assert.equal(meta.expirado, false);
    assert.match(meta.valido_ate, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(meta.fingerprint256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    const serializado = JSON.stringify(meta);
    assert.ok(!serializado.includes('senha-ficticia'));
    assert.ok(!serializado.includes('BEGIN'));
    assert.ok(!serializado.includes(pfx.toString('base64').slice(0, 40)));
    assert.equal(Object.hasOwn(meta, 'pfx'), false);
    assert.equal(Object.hasOwn(meta, 'senha'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GNRE inspecionarPfx rejeita senha incorreta sem vazar a senha', (t) => {
  if (!opensslDisponivel()) {
    t.skip('openssl indisponível para gerar PFX sintético');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnre-pfx-'));
  try {
    const pfx = gerarPfx(dir);
    assert.throws(
      () => modulo.inspecionarPfx(pfx, 'senha-errada-ficticia'),
      (err) => !String(err.message).includes('senha-errada-ficticia')
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
