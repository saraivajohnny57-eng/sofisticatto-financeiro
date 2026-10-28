const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('SSW webhook requires shared secret before database lookup', () => {
  const src = read('api/ssw-ocorrencias.js');
  assert.match(src, /SSW_OCORRENCIAS_WEBHOOK_TOKEN/, 'Webhook must use dedicated secret');
  const auth = src.search(/SSW_OCORRENCIAS_WEBHOOK_TOKEN/);
  const lookup = src.search(/supabaseRest\('integracao_convites'/);
  assert.ok(auth >= 0 && lookup > auth, 'Authentication must precede invite lookup');
});
test('SSW webhook must not mark all occurrences as collected', () => {
  const src = read('api/ssw-ocorrencias.js');
  assert.doesNotMatch(src, /eventoColeta\(descricao,codigo\)\s*\|\|\s*status\s*!==\s*'aguardando_coleta'/);
  assert.match(src, /eventoColeta\(descricao,codigo\)/);
});
test('SSW webhook does not expose internal exception message', () => {
  const src = read('api/ssw-ocorrencias.js');
  assert.doesNotMatch(src, /erro\s*:\s*e\.message/);
});
test('Integration router does not expose stack or internal diagnostics in HTTP 500', () => {
  const src = read('api/integracoes.js');
  assert.doesNotMatch(src, /erro:\s*"Falha interna ao executar a integração\.",\s*action,\s*diagnostico/);
});
test('DF-e diagnostics cannot be mistaken for completed SEFAZ integration', () => {
  const src = read('lib/integracoes/diagnostico-dfe-v445.js');
  assert.match(src, /pendente_integracao/);
  assert.match(src, /consultasFiscaisExecutadas:0/);
});
