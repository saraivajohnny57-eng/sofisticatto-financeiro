// Auditoria de segurança, sem rede nem mutações em produção.
// Execute: node --test security/tests/auth-baseline.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname,'../../financeiro.js'),'utf8');

test('diagnóstico: login legado consulta usuarios com senha no navegador', () => {
  const login = source.match(/async function entrar\(\)[\s\S]*?\n}\n/);
  assert.ok(login, 'função de login não localizada; revisar manualmente');
  assert.match(login[0], /\.from\(["']usuarios["']\)\.select\(["']\*["']\)/);
  assert.match(login[0], /\.eq\(["']senha["'],\s*senha\)/);
});

test('diagnóstico: sessão é recuperada de localStorage sem revalidação', () => {
  assert.match(source, /localStorage\.getItem\(["']usuarioLogado["']\)/);
  assert.match(source, /usuarioLogado\s*=\s*JSON\.parse\(salvo\)/);
});

test('diagnóstico: não expor service_role no frontend', () => {
  assert.doesNotMatch(source, /(?:sb_secret_|service_role)/i);
});

test('mitigação: senha não é persistida no localStorage após login', () => {
  assert.match(source, /const \{ senha: _senhaDescartada, \.\.\.usuarioSemSenha \} = resposta\.data/);
  assert.match(source, /localStorage\.setItem\("usuarioLogado", JSON\.stringify\(usuarioSemSenha\)\)/);
});

test('mitigação: senha legada é removida ao restaurar sessão', () => {
  assert.match(source, /const \{ senha: _senhaLegada, \.\.\.usuarioSemSenha \} = JSON\.parse\(salvo\)/);
});
