'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
test('V510 seleciona NF/parcela 56078-03 e bloqueia V508 obsoleta',()=>{
 assert.match(ui,/numero_nf:'56078',parcela:3/);
 assert.match(api,/Teste antigo desativado/);
 assert.doesNotMatch(ui,/56078-02|62710000058/);
});
test('V510 reutiliza apenas consulta autenticada recente para o mesmo título',()=>{
 assert.match(api,/function retornoBancarioJaConsultadoV510/);
 assert.match(api,/idade>30\*60\*1000/);
 assert.match(api,/String\(t.snumero\|\|'\)/);
});
test('V510 mantém alteração bloqueada e relatório por campo',()=>{
 assert.match(api,/transmissao_put_realizada:false/);
 assert.match(api,/alteracoes_put:0/);
 assert.match(ui,/Baixar relatório técnico TXT/);
});
