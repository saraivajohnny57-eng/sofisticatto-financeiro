'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const rod=require(path.join(root,'lib/integracoes/_rodonaves-tracking.js'));
const c=fs.readFileSync(path.join(root,'coletas.js'),'utf8');
test('Rodonaves: ordenação por data real ignora data placeholder 0001',()=>{
 const eventos=[
  {Date:'2026-11-17T20:00:07-03:00',OccurrenceDate:'0001-01-01T00:00:00-03:06',Description:'Mercadoria recebida pela transportadora na unidade'},
  {Date:'2026-11-19T09:43:00-03:00',OccurrenceDate:'0001-01-01T00:00:00-03:06',Description:'Entrega finalizada(Recebedor: Teste)'},
  {Date:'2026-11-18T05:44:16-03:00',OccurrenceDate:'0001-01-01T00:00:00-03:06',Description:'Em trânsito para outra unidade'}
 ];
 for(const arr of [eventos,eventos.slice().reverse()]){
  const x=rod.interpretarRastreio({Events:arr,Status:'0'});
  assert.equal(x.status,'entregue');
  assert.match(x.ultimaOcorrencia,/Entrega finalizada/);
  assert.equal(x.ultimaOcorrenciaEm,'2026-11-19T09:43:00-03:00');
 }
});
test('Rodonaves: evento posterior de trânsito não é confundido com entrega antiga',()=>{
 const x=rod.interpretarRastreio({Events:[
 {Date:'2026-11-18T05:44:16-03:00',OccurrenceDate:'0001-01-01T00:00:00-03:06',Description:'Entrega finalizada'},
 {Date:'2026-11-20T05:44:16-03:00',OccurrenceDate:'0001-01-01T00:00:00-03:06',Description:'Em trânsito para unidade'}]});
 assert.notEqual(x.status,'entregue');
});
test('Alfa e interface: eventos por data e entrega sem regressão',()=>{
 const a=fs.readFileSync(path.join(root,'lib/integracoes/_alfa-tracking.js'),'utf8');
 assert.match(a,/const ordenadas=extras.map/);
 assert.match(a,/Date.parse\(b.data/);
 assert.match(c,/startsWith\('0001-'\)/);
 assert.match(c,/entrega finalizada\|entrega efetuada/);
 assert.match(c,/includes\(String\(atual.status/);
});