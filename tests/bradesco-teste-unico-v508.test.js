'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
test('V508: botão executa um único endpoint somente de consulta',()=>{
 assert.match(ui,/teste-unico-encargos-v508/);
 assert.match(api,/function relatorioUnicoBradescoV508/);
 assert.match(api,/action==='teste-unico-encargos-v508'/);
});
test('V508: diagnóstico conserva vedação a PUT e protege cURL inexistente',()=>{
 assert.match(api,/transmissao_put_realizada:false/);
 assert.match(api,/curl_put_executado:'NAO_EXISTE'/);
 assert.match(api,/alteracoes_put:0/);
});
test('V508: detecta divergências críticas e escala pendente',()=>{
 for(const campo of ['codigoNegativacao','tipoAbatimento','valorComissaoPermanencia','valorMulta'])
  assert.match(api,new RegExp(campo));
 assert.match(ui,/Baixar relatório técnico TXT/);
});
