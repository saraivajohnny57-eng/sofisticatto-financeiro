// Testes de regressão da conferência Bradesco V486: nenhuma rede, nenhum boleto alterado.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'..','api','banco-bradesco.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','bradesco-piloto-v438.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const a=backend.indexOf('function avaliarOriginaisBradescoV484(');
const b=backend.indexOf('// V485: filtragem da conferência bancária',a);
assert.ok(a>=0&&b>a);
const converter=data=>({'28092026':'2026-09-28','08/11/2026':'2026-11-08','18/11/2026':'2026-11-18'}[String(data)]||null);
const avaliar=new Function('dataBradescoIso',backend.slice(a,b)+';return avaliarOriginaisBradescoV484')(converter);
function sample(documentoLocal,documentoBanco){
 return avaliar({titulo:{snumero:'56078-02',dataEmis:'28092026',especDocto:'DM',
 dataVencto:'08/11/2026',dataVenctoBol:'18/11/2026',valMoeda:'52796',
 codInscrProt:0,diasProt:0,codComisPerm:0,codValMul:0,
 sacado:{cnpj:documentoBanco,nome:'CLIENTE DE TESTE',endereco:'RUA TESTE',cep:'74000000'}}},
 {referencia:'BRADESCO-56078-02',valor:527.96,vencimento:'2026-11-08',cpf_cnpj:documentoLocal,cliente_nome:'CLIENTE DE TESTE'});
}
test('CPF local e CNPJ bancário divergentes não são marcados como iguais',()=>{
 const r=sample('12345678901','98765432000199');
 assert.equal(r.documento_pagador.situacao,'DIVERGENTE');
 assert.equal(r.documento_pagador.tipo_local,'11 dígitos (formato CPF)');
 assert.equal(r.documento_pagador.tipo_banco,'14 dígitos (formato CNPJ)');
 assert.equal(r.documento_pagador.nome_confere,true);
 assert.equal(r.origem.documento_pagador,false);
 assert.equal(r.contrato_put_liberado,false);
});
test('Mesmo CPF com máscara de zeros à esquerda não cria divergência falsa',()=>{
 const r=sample('12345678901','00012345678901');
 assert.equal(r.documento_pagador.situacao,'CONFERE');
 assert.equal(r.origem.documento_pagador,true);
 assert.equal(r.transmitido,false);
});
test('Data original e data do boleto atualizado são distinguidas',()=>{
 const r=sample('12345678901','12345678901');
 assert.equal(r.resumo.vencimento_banco,'2026-11-08');
 assert.equal(r.resumo.vencimento_boleto_atualizado,'2026-11-18');
 assert.match(ui,/Vencimento ORIGINAL no Bradesco/);
 assert.match(ui,/Vencimento do BOLETO ATUALIZADO/);
});
test('Nenhum documento completo é devolvido ao navegador no diagnóstico',()=>{
 const r=sample('12345678901','98765432000199');
 const serial=JSON.stringify(r.documento_pagador);
 assert.ok(!serial.includes('12345678901'));
 assert.ok(!serial.includes('98765432000199'));
 assert.equal(r.documento_pagador.sem_documento_completo,true);
});
test('Mudança visual publicada sem alterar fluxo PUT',()=>{
 assert.ok(index.includes('bradesco-piloto-v438.js?v=486-duas-datas-documento'));
 const sec=backend.slice(backend.indexOf("if(action==='preparar-manutencao-encargos-v433')"),backend.indexOf("if(action==='consultar-status-titulo')"));
 assert.match(sec,/transmissao_autorizada:false/);
 assert.doesNotMatch(sec,/method:\s*['"]PUT['"]/);
});