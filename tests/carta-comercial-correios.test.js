'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {descobrirCartas,validarCotacao,validarDestinatario,montarPrepostagem,valorBR}=require('../lib/integracoes/carta-comercial-correios')._teste;
const c={usuario:'teste',cartao:'000',cnpj:'05451985000195',cepOrigem:'74550470'};
const destino={nome:'Cliente Teste',endereco:{cep:'74000000',logradouro:'Rua B',numero:'30',bairro:'Centro',cidade:'Goiânia',uf:'GO'}};
const s={codigo:'12345',descricao:'CARTA REGISTRADA',categoria:'registrada'};
test('filtra somente códigos de cartas do contrato, não PAC e API',()=>{assert.deepEqual(descobrirCartas({todosServicos:[{codigo:'03298',descricao:'PAC CONTRATO AG'},{codigo:'12345',descricao:'CARTA REGISTRADA'},{codigo:'22222',descricao:'CARTA COMERCIAL'},{codigo:'33333',descricao:'API PRE POSTAGEM CARTA'}]}).map(x=>x.codigo),['12345','22222']);});
test('cotação em gramas, não quilos e envelope até 500 g',()=>{assert.deepEqual(validarCotacao({cepDestino:'74000-000',pesoGramas:20}),{cep:'74000000',peso:20});assert.throws(()=>validarCotacao({cepDestino:'74000000',pesoGramas:501}));assert.throws(()=>validarCotacao({cepDestino:'74000000',pesoGramas:0}));});
test('valor retornado pela API aceita vírgula ou ponto decimal',()=>{assert.equal(valorBR('3,85'),3.85);assert.equal(valorBR('15.60'),15.60);assert.equal(valorBR('1.234,56'),1234.56);});
test('destinatário exige endereço completo',()=>{assert.equal(validarDestinatario(destino).nome,'Cliente Teste');assert.throws(()=>validarDestinatario({nome:'X',endereco:{cep:'123'}}));});
test('registrada documental não adiciona NF-e nem declaração de cosméticos',()=>{const p=montarPrepostagem({cepDestino:'74000000',pesoGramas:20,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s);assert.equal(p.codigoFormatoObjetoInformado,'1');assert.equal(p.pesoInformado,20);assert.ok(!('tipoDocumento' in p));assert.ok(!('chaveNFe' in p));assert.equal(p.destinatario.nome,'Cliente Teste');});
test('não tenta criar carta simples pela API individual',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74000000',pesoGramas:20,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,{...s,categoria:'simples'}),/lote/);});
test('bloqueia envio de produtos como Carta',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74000000',pesoGramas:20,tipoConteudo:'COSMETICOS',destinatario:destino},c,s),/documentos/);});
test('protege divergência entre CEP usado na cotação e na etiqueta',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74200000',pesoGramas:20,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s),/CEP/);});

const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const telaCarta=fs.readFileSync(path.join(__dirname,'../cartas-comerciais-correios.js'),'utf8');
function prepararTelaCarta(autorizacao,retorno){
  const elementos=new Map();
  const campo=id=>{
    if(!elementos.has(id))elementos.set(id,{value:'',textContent:'',style:{},children:[],replaceChildren(){this.children=[]},append(item){this.children.push(item)},appendChild(item){this.children.push(item)}});
    return elementos.get(id);
  };
  const chamadas=[];
  const contexto={
    window:{},
    document:{getElementById:campo,createElement:()=>({value:'',textContent:'',label:''})},
    obterChaveIntegracoesCotacao:async()=>autorizacao,
    sessionStorage:{getItem:()=>''},localStorage:{getItem:()=>''},
    fetch:async (url,opts)=>{
      chamadas.push({url,opts});
      return {ok:retorno?.status!==401,status:retorno?.status||200,json:async()=>retorno?.body||{ok:true,servicos:[{codigo:'12345',descricao:'CARTA REGISTRADA'}],observacao:'Serviço disponível'}};
    }
  };
  vm.runInNewContext(telaCarta,contexto,{timeout:1000});
  return {contexto,campo,chamadas};
}
test('diagnóstico usa autorização do portal em vez de exigir chave manual',async()=>{
  const a=prepararTelaCarta('sdv1.token_teste');
  await a.contexto.window.cartaDiagnosticar();
  assert.equal(a.chamadas.length,1);
  assert.equal(a.chamadas[0].opts.headers['x-integrations-admin-key'],'sdv1.token_teste');
  assert.match(a.campo('cartaStatus').textContent,/Serviço disponível/);
  assert.equal(a.campo('cartaServico').children.length,2);
});
test('cancelar autorização não consulta serviço privado dos Correios',async()=>{
  const a=prepararTelaCarta('');
  await a.contexto.window.cartaDiagnosticar();
  assert.equal(a.chamadas.length,0);
  assert.match(a.campo('cartaStatus').textContent,/Autorização cancelada/);
});
test('401 orienta revalidar acesso no ambiente Preview',async()=>{
  const a=prepararTelaCarta('sdv1.token_invalido',{status:401,body:{ok:false,erro:'Invalida'}});
  await a.contexto.window.cartaDiagnosticar();
  assert.equal(a.chamadas.length,1);
  assert.match(a.campo('cartaStatus').textContent,/Autorização recusada neste Preview/);
});
