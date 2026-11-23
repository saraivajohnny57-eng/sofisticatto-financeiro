'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8');
const frontend=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
const route=api.slice(api.indexOf("if(action==='preparar-put-60584-v515'||action==='confirmar-put-60584-v515')"),api.indexOf("// Título 55937-004",api.indexOf("if(action==='preparar-put-60584-v515'")));
test('V516 mantém reserva original sem duplicar a emissão',()=>{
 assert.match(route,/status==='falha_auditoria_sem_envio'/);
 assert.match(route,/plan.hash!==controle.hash_request/);
 assert.match(route,/hash_request=eq.'\+plan.hash/);
 assert.match(route,/status=eq.falha_auditoria_sem_envio/);
 assert.match(route,/tomada.length!==1/);
});
test('V516 audita antes do único PUT',()=>{
 assert.equal((route.match(/method:'PUT'/g)||[]).length,1);
 assert.ok(route.indexOf("await salvar('bradesco:producao:put-v515-60584-02'")<route.indexOf("method:'PUT',body:plan.payload"));
 assert.ok(route.indexOf("tomada.length!==1")<route.indexOf("method:'PUT',body:plan.payload"));
 assert.match(route,/FALHA_AUDITORIA_SEM_ENVIO/);
 assert.match(route,/auditoria-put-v515/);
});
test('V516 mantém hash, confirmação explícita e pós-consulta',()=>{
 assert.match(route,/CONFIRMO PUT 60584-02/);
 assert.match(route,/CBTT0445/);
 assert.match(route,/consultarTituloBradesco\(amb,\{nosso_numero:'62860000010'\},contexto\)/);
 assert.match(frontend,/recuperacao_segura/);
});