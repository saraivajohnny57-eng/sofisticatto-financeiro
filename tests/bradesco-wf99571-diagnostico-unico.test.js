'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarCandidato}=require('../lib/bradesco/wf99571-diagnostico-unico');
const base=()=>({
 t:{snumero:'56078-02',dataEmis:'28092026',especDocto:'DM',dataVencto:'08/11/2026',valMoeda:52796,
  codValMul:0,codComisPerm:0,valMulta:0,qmoedaComisPerm:0,vlrPagto:0,codStatus:1,aceite:'N',
  sacado:{cnpj:'05231182443',nome:'Pagador de teste',endereco:'Rua Teste',cep:'74550',cepc:'470'},sacador:{},
  dataDesc1:'',valDesc1:0,codValDe1:0,dataDesc2:'',valDesc2:0,codValDe2:0,dataDesc3:'',valDesc3:0,codValDe3:0,
  codInscrProt:0,diasProt:0,qtdDiasDecurPrz:0,valAbat:0,permitePgtoParcial:'N',qtdePgtoParcial:0},
 reg:{referencia:'BRADESCO-56078-02',parcela_numero:2,nosso_numero:'62710000058',vencimento:'2026-11-08',valor:527.96},
 cp:{cpfCnpj:{cpfCnpj:5451985,filial:1,controle:95},negociacao:'12345678901',produto:'09',nossoNumero:'62710000058'},
 sit:{codStatus:1,pago:false,baixado:false,descontado:false}
});
const run=(p)=>validarCandidato(p.t,p.reg,{},p.cp,p.sit);
test('analisa estrutura candidata em uma unica chamada sem transmitir',()=>{
 const d=run(base());
 assert.equal(d.verificacoes.length,18);
 assert.ok(d.pendencias.some(x=>x.includes('Código de protesto')));
 assert.ok(d.pendencias.some(x=>x.includes('zero à esquerda')));
 assert.equal(d.conclusao,'BLOQUEADO_POR_CONTRATO');
 assert.equal(d.alteracao_enviada,false);
 assert.equal(d.liberar_put,false);
 assert.equal(d.hash_payload_candidato.length,64);
});
test('nunca reutiliza o numero de uma parcela diferente',()=>{
 const p=base();p.t.snumero='56078-01';
 assert.ok(run(p).pendencias.length>0);
});
test('protesto e descontos preexistentes bloqueiam manutencao automatica',()=>{
 const p=base();p.t.valDesc1=50;
 assert.ok(run(p).pendencias.some(x=>x.includes('Descontos')));
 const q=base();q.t.diasProt=1;
 assert.ok(run(q).pendencias.some(x=>x.includes('Protesto')));
});
test('pago ou com encargos ja registrados bloqueia envio',()=>{
 const p=base();p.sit.pago=true;
 assert.ok(run(p).pendencias.some(x=>x.includes('pago')));
 const q=base();q.t.codValMul=2;
 assert.ok(run(q).pendencias.some(x=>x.includes('Encargos')));
});
test('não altera data e valor nominal em dados de origem',()=>{
 const p=base(),before=JSON.stringify(p);
 run(p);assert.equal(JSON.stringify(p),before);
});

test('retorno com documento do avalista sem nome impede alteração',()=>{
 const p=base();p.t.sacador={cnpj:'11222333000181',nome:''};
 const r=run(p);
 assert.ok(r.pendencias.some(x=>x.includes('sacador avalista')));
 assert.equal(r.liberar_put,false);
});
test('não altera cobrança com dados originais ambiguos mesmo com origem conferida',()=>{
 const r=run(base());
 assert.equal(r.alteracao_enviada,false);
 assert.equal(r.liberar_put,false);
 assert.equal(r.conclusao,'BLOQUEADO_POR_CONTRATO');
});
