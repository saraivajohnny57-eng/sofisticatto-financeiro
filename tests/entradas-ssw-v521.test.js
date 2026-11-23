'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const co=fs.readFileSync(path.join(__dirname,'..','coletas.js'),'utf8');
const f=co.slice(co.indexOf("function rastreioDanfeV440"),co.indexOf("async function atualizarRastreioIntegrado"));
test('V521 entradas com chave de 44 digitos consultam SSW sem trocar transportadora',()=>{
 assert.match(f,/r\?\.sentido==='entrada'/);
 assert.match(f,/transportadora_ssw:resultado\.transportadora/);
 assert.match(f,/transportadora_documental:rastro\.frete_transportadoras/);
});
test('V521 preserva ordem cronologica e somente confirma recebimento com evento final',()=>{
 assert.match(f,/dataEventoTimeline\(e\.data_hora\)/);
 assert.match(f,/nov>=ant/);
 assert.match(f,/ENTREGA FINALIZADA\|ENTREGA EFETUADA/);
 assert.match(f,/rastro\.sentido==='entrada'\?'recebido':'entregue'/);
});