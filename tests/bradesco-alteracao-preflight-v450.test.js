// V450: contrato do piloto Bradesco — testes estáticos sem chamadas bancárias.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','api','banco-bradesco.js'),'utf8');
test('piloto somente consulta e não transmite PUT',()=>{
 const start=src.indexOf("if(action==='conferir-piloto-55994-v435')");
 const end=src.indexOf("if(action==='preparar-manutencao-encargos-v433')",start);
 assert.ok(start>=0&&end>start);
 const bloco=src.slice(start,end);
 assert.match(bloco,/consultarTituloBradesco\(amb,reg\)/);
 assert.doesNotMatch(bloco,/requestBradescoJson\s*\(/);
 assert.doesNotMatch(bloco,/method\s*:\s*['\"]PUT['\"]/);
});
test('manual exige homologação da escala e retroatividade',()=>{
 assert.match(src,/juros_mensal_5_porcento_escala_homologada:false/);
 assert.match(src,/retroativo_vencido_aceito_confirmado:false/);
 assert.match(src,/put_autorizado:false/);
});
test('não presume espécie original a partir do default da emissão',()=>{
 assert.match(src,/espécie original não armazenada nem retornada na consulta/);
});
