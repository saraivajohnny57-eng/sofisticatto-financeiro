'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=fs.readFileSync(path.join(__dirname,'../api/banco-bradesco.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../bradesco-piloto-v438.js'),'utf8');
const inicio=api.indexOf("if(action==='executar-manutencao-56078-wf99571')");
const fim=api.indexOf("if(action==='conferir-piloto-56078-v459')",inicio);
const txt=api.slice(inicio,fim);
test('piloto limitado a POST + Preview branch especifica',()=>{
 assert.ok(inicio>=0&&fim>inicio);
 assert.match(txt,/req.method!=='POST'/);
 assert.match(txt,/VERCEL_ENV!=='preview'/);
 assert.match(txt,/VERCEL_GIT_COMMIT_REF!=='bradesco-piloto-56078-02-nf-parcela-20261110'/);
});
test('somente titulo e aceite explicitamente delimitados',()=>{
 assert.match(txt,/AUTORIZO-56078-02-JUROS5-MULTA2/);
 assert.match(txt,/BRADESCO-56078-02/);
 assert.match(txt,/62710000058/);
 assert.match(txt,/527\.96/);
});
test('unicidade persistente antes da transmissao',()=>{
 const a=txt.indexOf("await supabaseRest(tabela,{method:'POST'");
 const b=txt.indexOf("method:'PUT'");
 assert.ok(a>=0&&b>a,'Reserva persistente ANTES da unica chamada PUT');
 assert.equal((txt.match(/method:'PUT'/g)||[]).length,1);
});
test('timeout nao dispara reenviar automaticamente',()=>{
 assert.match(txt,/resultado_incerto/);
 assert.match(txt,/sem_reenvio:true/);
 assert.doesNotMatch(txt,/setTimeout\s*\(/);
});
test('consulta posterior exige ambos percentuais e conservacao do nominal',()=>{
 assert.match(txt,/taxaJuros===50000&&taxaMulta===20000/);
 assert.match(txt,/nominalMantido/);
 assert.match(txt,/dataBradescoIso\(tb.dataVencto\)==='2026-11-08'/);
});
test('interface so reabilita botao quando nao houve transmissao nem reserva',()=>{
 assert.match(ui,/executar.disabled=true/);
 assert.match(ui,/if\(info.transmitido===false&&!info.sem_reenvio\)/);
 assert.match(ui,/executar.disabled=false/);
 assert.match(ui,/consultar-manutencao-56078-wf99571/);
});
test('conciliacao nao tem PUT',()=>{
 const a=api.indexOf("if(action==='consultar-manutencao-56078-wf99571')");
 const b=api.indexOf("if(action==='executar-manutencao-56078-wf99571')",a);
 assert.ok(a>=0&&b>a);
 assert.doesNotMatch(api.slice(a,b),/method:'PUT'/);
});
