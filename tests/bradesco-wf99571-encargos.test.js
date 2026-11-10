'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CONFIG,revisarWF99571,validarAlvo}=require('../lib/bradesco/wf99571-encargos-confirmados');
const titulo=()=>({documento:'55994-01',nossoNumero:'62710000024',carteira:'09',vencimento:'2026-10-18',valorNominal:441.91});
test('juros 5% e multa 2% seguem representacao explicitamente informada pelo Bradesco',()=>{
 assert.equal(CONFIG.valorComissaoPermanencia,'050000');
 assert.equal(CONFIG.valorMulta,'020000');
 assert.equal(CONFIG.codigoComissaoPermanencia,2);
 assert.equal(CONFIG.codigoMulta,2);
});
test('encargos iniciam depois do minimo de um dia corrido',()=>{
 assert.equal(CONFIG.diasComissaoPermanencia,1);
 assert.equal(CONFIG.diasMulta,1);
 assert.equal(revisarWF99571().dias_corridos,true);
});
test('manutencao real permanece bloqueada sem dados integrais',()=>{
 const x=revisarWF99571();
 assert.equal(x.envio_real_autorizado,false);
 assert.equal(x.aplicacao_retroativa_em_titulo_vencido_validada,false);
});
test('titulo piloto correto pode ser conferido sem alterar vencimento ou valor',()=>{
 const r=validarAlvo(titulo());
 assert.equal(r.identidade_conferida,true);
 assert.equal(r.alterar_vencimento,false);
 assert.equal(r.alterar_valor_nominal,false);
 assert.equal(r.transmitido,false);
});
test('troca de Nosso Numero ou parcela e bloqueada',()=>{
 const r=titulo();r.nossoNumero='62710000025';
 assert.throws(()=>validarAlvo(r),/nossoNumero/);
 const p=titulo();p.documento='55994-02';
 assert.throws(()=>validarAlvo(p),/documento/);
});
test('alteracao inadvertida do nominal ou vencimento e bloqueada',()=>{
 const r=titulo();r.valorNominal=442;
 assert.throws(()=>validarAlvo(r),/Valor nominal/);
 const v=titulo();v.vencimento='2026-11-10';
 assert.throws(()=>validarAlvo(v),/vencimento/);
});
