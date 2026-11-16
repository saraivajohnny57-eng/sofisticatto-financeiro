const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const bras=fs.readFileSync('lib/integracoes/consultar-rastreio-braspress.js','utf8');
const geral=fs.readFileSync('lib/integracoes/atualizar-rastreios-geral.js','utf8');
test('Alfa no lote inclui NF',()=>{
  assert.ok(geral.includes("if(tipo==='alfa'&&item.numero_nfe)qp.set('nfe',String(item.numero_nfe))"));
});
test('Braspress exige dados de entrega e evento de entrega',()=>{
  assert.match(bras,/dataEntregaConfirmada=dataVal\(conhecimento\.dataEntrega\)/);
  assert.match(bras,/const entregaConfirmada=Boolean\(dataEntregaConfirmada\)/);
  assert.match(bras,/const status=entregaConfirmada\?'entregue'/);
});
test('Atualização Braspress mantém previsão anterior quando indisponível',()=>{
  assert.ok(bras.includes("if(previsao)patch.previsao_entrega=previsao.slice(0,10)"));
  assert.ok(!bras.includes("previsao_entrega:previsao?previsao.slice(0,10):null"));
});
test('Entrega válida grava data e campo finalizado',()=>{
  assert.match(bras,/if\(status==='entregue'\)patch\.finalizado_em=ultimo\?\.data\|\|dataEntregaConfirmada\|\|agora/);
});
