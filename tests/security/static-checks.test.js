'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function listarJs(dir) {
  const base = path.join(ROOT, dir);
  const saida = [];
  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.git') continue;
    const rel = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'tests' || entrada.name === 'assets') continue;
      saida.push(...listarJs(rel));
    } else if (entrada.name.endsWith('.js')) {
      saida.push(rel);
    }
  }
  return saida;
}

test('nenhum arquivo .env está versionado', () => {
  assert.equal(fs.existsSync(path.join(ROOT, '.env')), false);
  assert.equal(fs.existsSync(path.join(ROOT, '.env.local')), false);
});

test('frontend não contém chave privada nem JWT service_role', () => {
  const arquivos = ['index.html', 'financeiro.js', 'app.js', 'coletas.js', 'cotacoes.js', 'portal-integracoes.js'];
  for (const arquivo of arquivos) {
    const conteudo = read(arquivo);
    assert.ok(!conteudo.includes('-----BEGIN PRIVATE KEY-----'), `${arquivo}: chave privada`);
    assert.ok(!conteudo.includes('-----BEGIN RSA PRIVATE KEY-----'), `${arquivo}: chave RSA`);
    assert.ok(!/eyJhbGciOi[A-Za-z0-9_-]{20,}/.test(conteudo), `${arquivo}: JWT`);
    assert.ok(!conteudo.includes('service_role'), `${arquivo}: service_role`);
  }
});

test('F16 (comportamento atual): web-push é dependência declarada e não utilizada', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['web-push']);
  const usos = listarJs('.').filter((arquivo) => /require\(['"]web-push['"]\)/.test(read(arquivo)));
  assert.deepEqual(usos, [], `web-push usado em: ${usos.join(', ')}`);
});

test('F01: relação exata de handlers de lib sem guarda de autenticação', () => {
  const arquivos = fs.readdirSync(path.join(ROOT, 'lib', 'integracoes')).filter((f) => f.endsWith('.js'));
  const handlers = arquivos.filter((arquivo) =>
    /module\.exports\s*=\s*async\s*(function|\()/.test(read(path.join('lib', 'integracoes', arquivo)))
  );
  const semGuarda = handlers.filter((arquivo) => {
    const conteudo = read(path.join('lib', 'integracoes', arquivo));
    return !/exigirAdmin|exigirAdminOuCron|credencialAdmin|adminValido/.test(conteudo);
  });
  assert.deepEqual(semGuarda.sort(), [
    'criar-prepostagem-correios.js',
    'diagnostico-prepostagem-correios.js',
    'documentos-correios.js'
  ]);
});

test('F01: relação exata de endpoints de api sem guarda de autenticação', () => {
  const arquivos = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
  const semGuarda = arquivos.filter((arquivo) => {
    const conteudo = read(path.join('api', arquivo));
    return !/credencialAdmin|exigirAdmin|adminAutorizado|tokenValido|validar\(req\)|validarUsuarioEmail/.test(conteudo);
  });
  assert.deepEqual(semGuarda.sort(), [
    'cron-rastreios-alfa.js',
    'gmail-remetentes.js',
    'integracoes.js'
  ]);
});

test('F14 (comportamento atual): 8 cópias na raiz divergem de lib/integracoes', () => {
  const raiz = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
  const divergentes = [];
  for (const arquivo of raiz) {
    const noLib = path.join(ROOT, 'lib', 'integracoes', arquivo);
    if (!fs.existsSync(noLib)) continue;
    const a = fs.readFileSync(path.join(ROOT, arquivo));
    const b = fs.readFileSync(noLib);
    if (!a.equals(b)) divergentes.push(arquivo);
  }
  assert.equal(divergentes.length, 8, `divergentes: ${divergentes.sort().join(', ')}`);
  for (const esperado of ['cotar-ssw.js', 'consultar-rastreio-ssw.js', 'atualizar-rastreios-geral.js']) {
    assert.ok(divergentes.includes(esperado), esperado);
  }
});

test('F15: api/banco-bradesco.js.bak está versionado na pasta de funções', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'api', 'banco-bradesco.js.bak')), true);
});

test('F15: vercel.json não define timeout de função nem crons', () => {
  const cfg = JSON.parse(read('vercel.json'));
  assert.equal(cfg.functions, undefined);
  assert.equal(cfg.crons, undefined);
});

test('F16 (comportamento atual): existe apenas um SQL no repositório', () => {
  const sqls = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith('.sql'));
  assert.deepEqual(sqls, ['SQL_V347_ANEXOS_TEMPORARIOS.sql']);
  const fontes = listarJs('.');
  const referencias = new Set();
  for (const arquivo of fontes) {
    for (const achado of read(arquivo).matchAll(/SQL V[0-9][A-Z0-9_]+/g)) referencias.add(achado[0]);
  }
  assert.ok(referencias.size >= 5, `referências SQL encontradas: ${[...referencias].join(', ')}`);
});

test('F02/F03 (comportamento atual): login e sessão são locais e sem hash', () => {
  const fonte = read('financeiro.js');
  assert.ok(fonte.includes('.eq("senha", senha)'), 'login compara senha direta');
  assert.ok(fonte.includes('insert([{login,senha'), 'criação grava senha sem hash');
  assert.ok(fonte.includes('localStorage.setItem("usuarioLogado"'), 'sessão em localStorage');
  assert.ok(fonte.includes("localStorage.setItem('integrations_admin_key'"), 'chave admin em localStorage');
});

test('F06 corrigido: filtro de rastreio Correios não tem espaço antes do id', () => {
  for (const arquivo of [
    'lib/integracoes/consultar-rastreio-correios.js',
    'consultar-rastreio-correios.js'
  ]) {
    const fonte = read(arquivo);
    assert.ok(!fonte.includes('& id='), `${arquivo}: query ainda tem "& id="`);
    assert.ok(!fonte.includes(".replace(' &','&')"), `${arquivo}: replace ineficaz ainda presente`);
    assert.ok(fonte.includes('&id=eq.'), `${arquivo}: filtro bem formado ausente`);
  }
});

test('F08/F09 (comportamento atual): lote usa chave legada e Rodonaves fixa homologação', () => {
  const lote = read('lib/integracoes/atualizar-rastreios-geral.js');
  assert.ok(lote.includes('process.env.INTEGRATIONS_ADMIN_KEY'));
  assert.ok(lote.includes('limit=700'));

  for (const arquivo of [
    'lib/integracoes/_rodonaves-tracking.js',
    'lib/integracoes/_rodonaves-pickup.js',
    'lib/integracoes/agendar-coleta-rodonaves.js'
  ]) {
    const fonte = read(arquivo);
    assert.ok(fonte.includes('ambiente=eq.homologacao'), `${arquivo}: ambiente fixo`);
    assert.ok(fonte.includes('auth_type:"DEV"'), `${arquivo}: auth_type DEV`);
  }
});

test('F11 (comportamento atual): rastreio Correios testa 3 escopos e 3 variantes', () => {
  const fonte = read('lib/integracoes/_correios.js');
  assert.ok(fonte.includes("const escopos=['cartao','contrato','user']"));
  assert.ok(fonte.includes("const requisicoes=["));
});

test('F20 (comportamento atual): criptografia SMTP deriva da service role', () => {
  const fonte = read('api/enviar-email.js');
  assert.ok(fonte.includes('sofisticatto:smtp:v60:'));
  assert.ok(fonte.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
