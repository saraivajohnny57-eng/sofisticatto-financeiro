// V487: validação do documento sacado.cnpj do Bradesco, representado em 15 posições.
// Testes 100% locais: nenhum acesso à API, nenhuma mutação de boletos reais.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','api','banco-bradesco.js'),'utf8');
const a=src.indexOf('function compararDocumentoSacadoBradescoV487(');
const b=src.indexOf('// V484: dados originais confirmados',a);
assert.ok(a>=0&&b>a);
const comparador=new Function(src.slice(a,b)+'return compararDocumentoSacadoBradescoV487;')();
test('CPF com zero inicial, convertido para numero 14 dígitos pelo Bradesco, confere',()=>{
 // CPF local hipotetico com zero inicial: 0 + 8 digitos de raiz + 2 controles.
 const cpf='01234567890',docBanco=Number(cpf.slice(0,9)+'0000'+cpf.slice(9)).toString();
 assert.equal(docBanco.length,14);
 const res=comparador(cpf,docBanco);
 assert.equal(res.confere,true);assert.equal(res.formato,'LAYOUT_9_4_2');
 assert.match(res.tipo_banco,/CPF bancário/);
});
test('Documento local e banco do caso real, sem exibir dados pessoais',()=>{
 // Nao inserimos dados de pessoas reais no codigo de teste.
 const cpf='12345678901',docBanco='123456789000001';
 const res=comparador(cpf,docBanco);
 assert.equal(res.confere,true);assert.equal(res.tipo_local,'CPF (11 dígitos)');
});
test('CPF banco diferente continua pendente, mesmo quando controle coincide',()=>{
 const res=comparador('01234567890','987654321000090');
 assert.equal(res.confere,false);
 assert.equal(res.formato,'NAO_VALIDADO');
});
test('CNPJ de 14 posições com zero à esquerda pode vir como numero bancário',()=>{
 const cnpj='01234567000189';
 const banco=Number('0'+cnpj).toString();
 const res=comparador(cnpj,banco);
 assert.equal(res.confere,true);assert.equal(res.tipo_banco,'CNPJ bancário (9+4+2)');
});
test('CPF direto ainda é aceito se igual; banco ausente não é aceito',()=>{
 assert.equal(comparador('01234567890','01234567890').confere,true);
 assert.equal(comparador('01234567890','').confere,false);
 assert.equal(comparador('','').confere,false);
});
test('A resposta não expõe documentos completos e PUT permanece bloqueado',()=>{
 const res=comparador('01234567890','12345678000090');
 assert.ok(!JSON.stringify(res).includes('01234567890'));
 const p=src.slice(src.indexOf("if(action==='preparar-manutencao-encargos-v433')"),src.indexOf("if(action==='consultar-status-titulo')"));
 assert.match(p,/transmissao_autorizada:false/);
 assert.doesNotMatch(p,/method:\s*['"]PUT['"]/);
});
