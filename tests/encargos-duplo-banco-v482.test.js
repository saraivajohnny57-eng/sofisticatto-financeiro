// V482 - regressao de juros e multa BB / Bradesco em emissao individual e em massa.
// Nenhum teste pode acessar banco, rede ou emitir boleto.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const br=load('api/banco-bradesco.js');
const bb=load('api/banco-bb.js');
const front=load('financeiro.js');
function trecho(src,inicio,fim){
 const a=src.indexOf(inicio),b=src.indexOf(fim,a);
 assert.ok(a>=0&&b>a,'Trecho nao encontrado: '+inicio);
 return src.slice(a,b);
}
const brUtils=new Function(trecho(br,'function percentualEncargoRegistroV482(','function montarPayloadRegistroReal(')+'\nreturn {encargosBradescoRegistroV482,instrucaoSemProtestoBradescoV482};')();
const bbUtils=new Function('amanhaDaData',trecho(bb,'function percentualEncargoBbV482(','async function prepararBoletoPiloto(')+'\nreturn encargosBbV482;')(()=>'19.11.2026');
const brFront=new Function(trecho(front,'function payloadBradescoDeCobranca(','async function emitirBradescoOperacional(')+'\nreturn payloadBradescoDeCobranca;')();
const bbFront=new Function('numeroTituloParcelaBb','enderecoParcelaBb',
 trecho(front,'function corpoEmissaoBbDaParcela(','async function emitirParcelaBbReal(')+'\nreturn corpoEmissaoBbDaParcela;')(
 p=>p.numero_nf,p=>String(p.endereco||'')+' '+String(p.numero||''));
test('Bradesco: padrão 5% a.m. e 2%, ambos a partir de um dia',()=>{
 const x=brUtils.encargosBradescoRegistroV482({});
 assert.deepEqual([x.percentualJuros,x.percentualMulta,x.qtdeDiasJuros,x.qtdeDiasMulta],[5,2,1,1]);
});
test('Bradesco: zero/zero explícito não é sobrescrito pelo padrão',()=>{
 const x=brUtils.encargosBradescoRegistroV482({juros_percentual:0,multa_percentual:0});
 assert.deepEqual([x.percentualJuros,x.percentualMulta,x.qtdeDiasJuros,x.qtdeDiasMulta],[0,0,0,0]);
});
test('Bradesco: taxa fora da faixa é rejeitada antes do POST',()=>{
 assert.throws(()=>brUtils.encargosBradescoRegistroV482({multa_percentual:3}),/Multa/);
 assert.throws(()=>brUtils.encargosBradescoRegistroV482({juros_percentual:-1}),/Juros/);
});
test('Bradesco: protesto/decurso/negativação não utilizados = zero',()=>{
 const x=brUtils.instrucaoSemProtestoBradescoV482();
 assert.deepEqual(x,{protesto:{codInstrucaoProtesto:0,qtdeDiasProtesto:0},decurso:{codDecursoPrazo:0,diasDecursoPrazo:0},codigoNegativacao:0,diasNegativacao:0});
});
test('Bradesco: fluxo operacional transmite encargos cadastrados',()=>{
 const x=brFront({juros_percentual:4.5,multa_percentual:1.5},'56078-02');
 assert.equal(x.juros_percentual,4.5);assert.equal(x.multa_percentual,1.5);assert.equal(x.seuNumero,'56078-02');
});
test('Bradesco: permanece bloqueada a mudança PUT sem homologação',()=>{
 assert.ok(br.includes("transmissao_autorizada:false"));
 assert.ok(!br.includes('https://openapi.bradesco.com.br/boleto/cobranca-altera/v1/alterar'));
});
test('BB: cobrança v2 tipo 2 - 5% ao mês, 2% multa no dia seguinte',()=>{
 const x=bbUtils({},'2026-11-18');
 assert.deepEqual(x,{jurosMora:{tipo:2,porcentagem:5},multa:{tipo:2,data:'19.11.2026',porcentagem:2}});
});
test('BB: taxa zero não é substituída por 5%/2%',()=>{
 const x=bbUtils({jurosPercentual:0,multaPercentual:0},'2026-11-18');
 assert.deepEqual(x,{jurosMora:{tipo:0},multa:{tipo:0}});
});
test('BB: taxa personalizada aceita valores válidos',()=>{
 const x=bbUtils({jurosPercentual:4.75,multaPercentual:1.5},'2026-11-18');
 assert.equal(x.jurosMora.porcentagem,4.75);assert.equal(x.multa.porcentagem,1.5);
});
test('BB: taxa inválida é recusada antes do POST',()=>{
 assert.throws(()=>bbUtils({multaPercentual:2.5},'2026-11-18'),/Multa/);
});
test('BB: parcelas da emissão individual e em massa usam cadastro',()=>{
 const x=bbFront({numero_nf:'56078',juros_percentual:4.75,multa_percentual:1.5});
 assert.equal(x.jurosPercentual,4.75);assert.equal(x.multaPercentual,1.5);
});
test('Impressão: não atribui encargos fictícios ao banco',()=>{
 assert.ok(front.includes('jurosInfo==null?'));
 assert.ok(front.includes('Cadastro local não comprova encargos registrados'));
 assert.ok(!front.includes('nominalCentavos*0.05/30'));
});

test('V488: inventario da consulta e campos divergentes sem PUT',()=>{
  assert.ok(br.includes('function relatorioRetornoBradescoV488('));
  assert.ok(br.includes('diagnostico_campos_v488:relatorioRetornoBradescoV488(q.data)'));
  assert.ok(br.includes('codigoNegativacao: exemplo 0 / layout fixo 1'));
  assert.ok(br.includes('tipoAbatimento: exemplo 0 / layout fixo 1'));
  assert.ok(!br.includes("action==='executar-manutencao-encargos-v488'"));
});
test('V488: painel exibe resposta campo por campo, sem alterar boleto',()=>{
  const piloto=load('bradesco-piloto-v438.js');
  assert.ok(piloto.includes('j.diagnostico_campos_v488?.campos'));
  assert.ok(piloto.includes('TRANSMISSÃO PUT: BLOQUEADA'));
});
