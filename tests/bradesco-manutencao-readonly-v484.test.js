// V484: testes de conferencia real somente leitura — nao chamar banco nem Supabase.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const b=fs.readFileSync(path.join(__dirname,'..','api','banco-bradesco.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','bradesco-piloto-v438.js'),'utf8');
const a=b.indexOf('function avaliarOriginaisBradescoV484('),f=b.indexOf('/* V473 — repetição somente da consulta',a);
assert.ok(a>=0&&f>a);
const analyze=new Function('dataBradescoIso',b.slice(a,f)+';return avaliarOriginaisBradescoV484')(
 v=>({'28092026':'2026-09-28','08/11/2026':'2026-11-08'}[String(v)]||null));
test('Consulta bradesco mapeia dataEmis, especDocto e snumero originais',()=>{
 const reg={referencia:'BRADESCO-56078-02',vencimento:'2026-11-08',valor:527.96,cpf_cnpj:'12345678901'};
 const retorno={titulo:{snumero:'56078-02',dataEmis:'28092026',especDocto:'DM',dataVencto:'08/11/2026',valMoeda:'52796',
 codInscrProt:0,diasProt:0,codComisPerm:0,codValMul:0,sacado:{cnpj:'12345678901',nome:'TESTE',endereco:'RUA TESTE',cep:'74000'}}};
 const v=analyze(retorno,reg);
 assert.equal(v.resumo.especie,'DM');assert.equal(v.resumo.data_emissao,'2026-09-28');
 assert.equal(v.origem.seu_numero,true);assert.equal(v.origem.valor_nominal,true);
 assert.equal(v.origem.documento_pagador,true);assert.equal(v.contrato_put_liberado,false);assert.equal(v.transmitido,false);
});
test('Divergência de identidade bloqueia pré-conferência',()=>{
 const v=analyze({titulo:{snumero:'OUTRO',dataEmis:'28092026',especDocto:'DM',dataVencto:'08/11/2026',valMoeda:'52796'}},
 {referencia:'BRADESCO-56078-02',vencimento:'2026-11-08',valor:527.96,cpf_cnpj:'12345678901'});
 assert.equal(v.origem.seu_numero,false);assert.equal(v.contrato_put_liberado,false);
});
test('Endpoint de manutenção não transmite PUT',()=>{
 const part=b.slice(b.indexOf("if(action==='preparar-manutencao-encargos-v433')"),b.indexOf("if(action==='consultar-status-titulo')"));
 assert.ok(part.includes('consultarTituloBradesco('));assert.ok(!part.includes('requestBradescoJson('));assert.ok(!part.includes("method:'PUT'"));
 assert.ok(ui.includes('Conferir 56078-02 no Bradesco (sem alterar)'));
});
