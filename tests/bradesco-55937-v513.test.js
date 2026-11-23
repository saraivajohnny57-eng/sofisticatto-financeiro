'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8'),ui=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
const frag=api.slice(api.indexOf("if(action==='preflight-55937-v513')"),api.indexOf("// V433: pré-validação autenticada"));
test('V513: consulta bancária direta sem depender de histórico',()=>{
 assert.match(frag,/nosso!=='13625803774'/);
 assert.match(frag,/consultarTituloBradesco\(amb,\{nosso_numero:nn\}\)/);
 assert.doesNotMatch(frag,/supabaseRest\('cobrancas_bancarias'/);
});
test('V513: identifica título e status antes de qualquer mudança',()=>{
 assert.match(frag,/seu==='55937-004'/);
 assert.match(frag,/sit.codStatus===1/);
 assert.match(frag,/693.19/);
 assert.match(frag,/2026-11-13/);
});
test('V513: sem PUT e exporta verificações',()=>{
 assert.match(frag,/alteracoes_put:0/);
 assert.match(frag,/transmitido:false/);
 assert.match(ui,/Bradesco_WF-99571_55937-004_V513.txt/);
});
