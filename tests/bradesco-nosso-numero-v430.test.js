// Testes isolados: não acessam rede, banco ou Supabase.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','api','banco-bradesco.js'),'utf8');
const fn=source.match(/function nossoNumeroConsultaBradesco\(valor\)\{[\s\S]*?\n\}/);
assert.ok(fn,'Normalizador V430 ausente');
const normalize=vm.runInNewContext(fn[0]+';nossoNumeroConsultaBradesco');
test('Bradesco: número impresso 6267000001-9 retira DV e completa 11 posições',()=>assert.equal(normalize('6267000001-9'),'06267000001'));
test('Bradesco: Net Empresa sem DV gera a mesma chave',()=>assert.equal(normalize('6267000001'),'06267000001'));
test('Bradesco: 11 posições sem hífen preserva último dígito',()=>assert.equal(normalize('06267000001'),'06267000001'));
test('Bradesco: números ausentes ou maiores que 11 são rejeitados',()=>{assert.throws(()=>normalize(''));assert.throws(()=>normalize('123456789012'))});
