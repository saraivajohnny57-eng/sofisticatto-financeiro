// Regression checks for browser polling, without external API calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('full tracking API sweep is skipped when browser tab is hidden',()=>{
 const s=read('coletas.js');
 assert.match(s,/if\(!document\.hidden\)atualizarTodosRastreiosSaida\(true\)/);
 assert.match(s,/timerAtualizacaoAutomaticaRastreios=setInterval/);
});

test('universal tracking list refresh is skipped when tab is hidden',()=>{
 const s=read('rastreio-universal.js');
 assert.match(s,/if\(!document\.hidden && tabela && tabela\.offsetParent !== null\)/);
});

test('universal tracking refresh is not more frequent than every 3 minutes',()=>{
 const s=read('rastreio-universal.js');
 assert.match(s,/\}, 180000\);/);
});
