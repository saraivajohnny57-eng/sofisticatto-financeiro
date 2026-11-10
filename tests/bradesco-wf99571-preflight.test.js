'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ENCARGOS,verificarOriginal}=require('../lib/bradesco/wf99571-preflight');
const reg=()=>({numero_nf:'55994',parcela_numero:1,referencia:'BRADESCO-55994-01',nosso_numero:'62710000024',valor:441.91,vencimento:'2026-10-18'});
const banco=()=>({snumero:'55994-01',dataEmis:'28092026',especDocto:'DM',dataVencto:'18/10/2026',valMoeda:44191,codStatus:1,codValMul:0,codComisPerm:0,sacado:{nome:'Pagador ficticio',cnpj:'12345678901',endereco:'Rua Teste',cep:'12345',cepc:'678'}});
test('percentuais 5 e 2 convertidos para valores numericos do PUT sem zeros ilegais em JSON',()=>{
 assert.equal(ENCARGOS.valorComissaoPermanencia,50000);
 assert.equal(ENCARGOS.valorMulta,20000);
 assert.equal(ENCARGOS.diasComissaoPermanencia,1);
 assert.equal(ENCARGOS.diasMulta,1);
});
test('origem valida e identificadores corretos',()=>{
 const r=verificarOriginal(reg(),banco());
 assert.equal(r.origem.seu_numero_confirmado,true);
 assert.equal(r.origem.emissao_confirmada,true);
 assert.equal(r.origem.especie_confirmada,true);
 assert.equal(r.origem.vencimento_original_confirmado,true);
 assert.equal(r.liberado_para_put,false);
 assert.equal(r.transmitido,false);
});
test('bloqueia dados de outra parcela',()=>{
 const r=reg();r.parcela_numero=2;
 assert.ok(verificarOriginal(r,banco()).pendencias.some(x=>x.includes('identificação')));
});
test('bloqueia banco com juros ou multa ja existentes',()=>{
 const t=banco();t.codValMul=2;
 assert.ok(verificarOriginal(reg(),t).pendencias.some(x=>x.includes('encargos já presentes')));
});
test('bloqueia titulo com status de pagamento',()=>{
 const t=banco();t.codStatus=61;
 assert.ok(verificarOriginal(reg(),t).pendencias.some(x=>x.includes('título não confirmado')));
});
test('contrato integral nunca e declarado como validado por leitura parcial',()=>{
 const r=verificarOriginal(reg(),banco());
 assert.equal(r.contrato_put_integral_validado,false);
 assert.ok(r.pendencias.some(x=>x.includes('sem mapeamento seguro')));
});
