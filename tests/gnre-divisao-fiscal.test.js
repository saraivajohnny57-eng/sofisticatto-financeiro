'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {estimar,compararComNfe}=require('../gnre-divisao-fiscal');
const dir=path.join(__dirname,'..');
function simular(base=410.41,interno=.19,interestadual=.12,fcp=.02){
 return estimar({valorOperacao:base,aliquotaInterestadual:interestadual,
  aliquotaInterna:interno,aliquotaFcp:fcp});
}
test('planilha do usuario: 410,41, GO 12%, PA 19%, FCP 2% => 28,73 + 8,21 = 36,94',()=>{
 const r=simular();
 assert.equal(r.base,'410.41');assert.equal(r.difal,'28.73');
 assert.equal(r.fcp,'8.21');assert.equal(r.total,'36.94');
 assert.equal(r.receitas_sugeridas[0].codigo,'100102');
 assert.equal(r.receitas_sugeridas[0].valor,'28.73');
 assert.equal(r.receitas_sugeridas[1].codigo,'100129');
 assert.equal(r.receitas_sugeridas[1].valor,'8.21');
 assert.equal(r.transmissao,false);
 assert.ok(r.receitas_sugeridas.every(x=>x.situacao==='pendente_configuf_e_validacao_fiscal'));
 assert.doesNotMatch(JSON.stringify(r),/100099/);
});
test('aplicar arredondamento por componente antes de somar',()=>{
 const r=simular(1.50,.19,.12,.02);
 // 7% de 1,50 => 0,11; 2% => 0,03
 assert.equal(r.difal,'0.11');assert.equal(r.fcp,'0.03');
 assert.equal(r.total,'0.14');
});
test('quando FCP e zero somente o DIFAL e candidato a guia',()=>{
 const r=simular(100,.19,.12,0);
 assert.equal(r.difal,'7.00');assert.equal(r.fcp,'0.00');
 assert.equal(r.total,'7.00');assert.equal(r.receitas_sugeridas[1].incluir,false);
});
test('NF-e antiga 50834: XML 449,39 / DIFAL 31,48 / FCP 0,00 diverge de planilha 2%',()=>{
 const r=simular(449.39);
 assert.equal(r.difal,'31.46');
 assert.equal(r.fcp,'8.99');
 assert.equal(r.total,'40.45');
 // A GNRE antiga 100099 por R$40,44 não decorre automaticamente
 // da soma de valores arredondados por rubrica.
 assert.notEqual(r.total,'40.44');
 const check=compararComNfe(r,{valorNf:449.39,difalXml:31.48,fcpXml:0});
 assert.equal(check.conforme,false);assert.equal(check.emissao_liberada,false);
 assert.equal(check.dados_xml.difal,'31.48');
 assert.equal(check.dados_xml.fcp,'0.00');
 assert.ok(check.pendencias.some(x=>/FCP do XML difere/.test(x)));
});
test('nao arredondar nem inventar tributos de valores invalidos',()=>{
 for(const value of [NaN,Infinity,-1,'410.41',null]){
  assert.throws(()=>estimar({valorOperacao:value,aliquotaInterestadual:.12,
   aliquotaInterna:.19,aliquotaFcp:.02}));
 }
 assert.throws(()=>simular(410.41,.12,.19,.02),/inferior/);
 assert.throws(()=>simular(410.41,.19,.12,2),/numero valido/);
});
test('cotacao usa total somado e mostra guias apenas como prévia, sem criar GNRE',()=>{
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const js=fs.readFileSync(path.join(dir,'cotacoes.js'),'utf8');
 assert.match(html,/src="gnre-divisao-fiscal\.js/);
 assert.ok(html.indexOf('src="gnre-divisao-fiscal.js')<html.indexOf('src="cotacoes.js'));
 assert.match(html,/id="freteGnreDivisao"/);
 assert.match(js,/SofisticattoGnreDivisao\.estimar/);
 assert.match(js,/freteGnreDivisaoAtual=calc/);
 assert.match(js,/campo\.value=Number\(calc\.total\)/);
 assert.match(js,/gnre_valor: numeroFrete\(freteValor\("freteGnreValor"\)\)/);
 assert.match(js,/GNRE estimada\/manual|TOTAL PARA INFORMAR AO CLIENTE|Total estimado GNRE/);
 assert.match(js,/SofisticattoGnreDivisao\.compararComNfe/);
 assert.doesNotMatch(fs.readFileSync(path.join(dir,'gnre-divisao-fiscal.js'),'utf8'),
  /enviarSoap|fetch\(|GnreLoteRecepcao/);
});
