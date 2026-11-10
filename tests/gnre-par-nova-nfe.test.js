'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planejarPar}=require('../lib/integracoes/gnre-par-nova-nfe');
const base=()=>({
  chaveNfe:'1'.repeat(44),ufFavorecida:'PA',cnpjEmitente:'11222333000181',
  razaoSocial:'Empresa de teste',vencimento:'2026-11-20',
  difal:'28.73',fcp:'8.21',novaOperacao:true,
  receitasConfirmadas:{difal:true,fcp:true}
});
test('duas guias distintas, soma apenas na cotacao, sem transmissao',()=>{
 const {guias,resumo}=planejarPar(base());
 assert.equal(guias.length,2);
 assert.match(guias[0],/<receita>100102<\/receita>/);
 assert.match(guias[1],/<receita>100129<\/receita>/);
 assert.match(guias[0],/<valor tipo="11">28\.73<\/valor>/);
 assert.match(guias[1],/<valor tipo="11">8\.21<\/valor>/);
 assert.equal(resumo.total_cotacao,'36.94');
 assert.equal(resumo.quantidade_guias,2);
 assert.equal(resumo.pagaveis,false);
 assert.equal(resumo.transmissao,'nao_realizada');
 assert.equal(resumo.lote_sha256.length,64);
});
test('bloqueia NFe antiga ou nao confirmada',()=>{
 const p=base();delete p.novaOperacao;
 assert.throws(()=>planejarPar(p),/Apenas novas operações/);
});
test('bloqueia receitas nao confirmadas para a UF',()=>{
 const p=base();p.receitasConfirmadas.fcp=false;
 assert.throws(()=>planejarPar(p),/Confirmar incidência/);
});
test('nao inventa segunda guia quando FCP zero',()=>{
 const p=base();p.fcp='0.00';
 assert.throws(()=>planejarPar(p),/positivos/);
});
test('nao aceita valores arredondados ou strings inseguras',()=>{
 const p=base();p.difal='28,73';
 assert.throws(()=>planejarPar(p),/decimal/);
});
test('lote identico tem chave idempotente igual',()=>{
 const a=planejarPar(base()).resumo;
 const b=planejarPar(base()).resumo;
 assert.equal(a.idempotency_key,b.idempotency_key);
});
