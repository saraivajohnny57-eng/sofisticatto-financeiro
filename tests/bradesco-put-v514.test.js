'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8'),ui=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
const frag=api.slice(api.indexOf("function prepararAlteracaoBradesco55937V514"),api.indexOf("// V513 — Novo título"));
test('V514: idempotência e reserva única antes do PUT',()=>{
 assert.match(frag,/bradesco_put_controlado_v514/);
 assert.ok(frag.indexOf("method:'POST',body:reserva")<frag.indexOf("method:'PUT',body:plan.payload"));
 assert.match(frag,/RESULTADO_INCERTO/);
});
test('V514: preservação do título e retenção de auditoria criptografada',()=>{
 assert.match(frag,/codigoNegativacao:1,diasNegativacao:0/);
 assert.match(frag,/codInstrucaoProtesto:0,qtdeDiasProtesto:0/);
 assert.match(frag,/valorComissaoPermanencia:jurosDiaCentavos/);
 assert.match(frag,/valorMulta:multaPercentualEscalado/);
 assert.match(frag,/salvar\('bradesco:producao:put-v514-55937-004'/);
});
test('V514: valores exatos e bloqueios contra alterações perigosas',()=>{
 assert.match(frag,/jurosDiaCentavos===115/);
 assert.match(frag,/multaPercentualEscalado===200/);
 assert.match(frag,/sem_descontos_abatimentos/);
 assert.match(frag,/status_bancario/);
 assert.match(frag,/pagador_bancario/);
});
test('V514: real só depois de prévia com hash e confirmação',()=>{
 assert.match(ui,/preparar-put-55937-v514/);
 assert.match(ui,/confirmar-put-55937-v514/);
 assert.match(ui,/window.confirm/);
 assert.match(frag,/hash_previa/);
});
