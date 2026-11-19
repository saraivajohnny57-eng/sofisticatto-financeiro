'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'..'),b=fs.readFileSync(path.join(dir,'api/banco-bradesco.js'),'utf8');
const f=fs.readFileSync(path.join(dir,'bradesco-piloto-v438.js'),'utf8');
const i=fs.readFileSync(path.join(dir,'index.html'),'utf8');
test('V512 documenta campos fixos em vez de sinalizar pendências artificiais',()=>{
 assert.match(b,/codigoNegativacao','PROPOSTO'/);
 assert.match(b,/tipoAbatimento','PROPOSTO'/);
 assert.doesNotMatch(b,/codigoNegativacao','PENDENTE'/);
 assert.doesNotMatch(b,/tipoAbatimento','PENDENTE'/);
});
test('V512 mantém escalas de juros/multa não homologadas e nenhum PUT automático',()=>{
 assert.match(b,/valorComissaoPermanencia','PENDENTE'/);
 assert.match(b,/valorMulta','PENDENTE'/);
 assert.match(b,/alteracoes_put:0/);
 assert.match(b,/transmissao_put_realizada:false/);
});
test('V512 lembra resultado PUT anterior e não trata vencimento futuro como bloqueio',()=>{
 assert.match(f,/CBTT0797/);
 assert.match(f,/Não precisa estar vencido/);
 assert.match(i,/v=512-retomar-put/);
});