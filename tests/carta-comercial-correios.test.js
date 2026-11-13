'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {descobrirCartas,validarCotacao,validarDestinatario,montarPrepostagem,valorBR,separarNumeroEnderecoCarta}=require('../lib/integracoes/carta-comercial-correios')._teste;
const c={usuario:'teste',cartao:'000',cnpj:'05451985000195',cepOrigem:'74550470'};
const destino={nome:'Cliente Teste',endereco:{cep:'74000000',logradouro:'Rua B',numero:'30',bairro:'Centro',cidade:'Goiânia',uf:'GO'}};
const s={codigo:'12345',descricao:'CARTA REGISTRADA',categoria:'registrada'};
test('seleciona somente cartas comerciais fisicas, exclui PAC e e-Carta',()=>{
 const servicos=descobrirCartas({todosServicos:[
   {codigo:'03298',descricao:'PAC CONTRATO AG'},
   {codigo:'12345',descricao:'CARTA COML REG PL3 MFD'},
   {codigo:'22222',descricao:'CARTA COML SIMPLES CHANCELA'},
   {codigo:'33333',descricao:'E CARTA REG INTEGRACAO'},
   {codigo:'44444',descricao:'CARTA RESP NAC CONVENCIONAL'},
   {codigo:'55555',descricao:'CARTA COML RG ARC PL3 CHAN ETI'},
   {codigo:'66666',descricao:'CARTA COML REG AR CONV PL3 MFD'}
 ]});
 assert.deepEqual(servicos.map(x=>x.codigo),['12345','22222','66666','55555']);
 assert.deepEqual(servicos.map(x=>x.categoria),['registrada','simples','registrada_ar','registrada_ar']);
});
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
  const anexos=[];
  const contexto={
    window:{},
    document:{getElementById:campo,createElement:()=>({value:'',textContent:'',label:'',style:{},remove(){}}),body:{appendChild:obj=>anexos.push(obj)}},
    obterChaveIntegracoesCotacao:async()=>autorizacao,
    sessionStorage:{getItem:()=>''},localStorage:{getItem:()=>''},
    fetch:async (url,opts)=>{
      chamadas.push({url,opts});
      return {ok:retorno?.status!==401,status:retorno?.status||200,json:async()=>retorno?.body||{ok:true,servicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD',categoria:'registrada'}],observacao:'Serviço disponível'}};
    }
  };
  vm.runInNewContext(telaCarta,contexto,{timeout:1000});
  return {contexto,campo,chamadas,anexos};
}
test('diagnóstico usa autorização do portal em vez de exigir chave manual',async()=>{
  const a=prepararTelaCarta('sdv1.token_teste');
  await a.contexto.window.cartaDiagnosticar();
  assert.equal(a.campo('cartaServico').value,'12345','Registrada deve ficar selecionada para validacao');
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

test('cotacao usa um unico codigo selecionado, evitando consulta massiva e HTTP 429',async()=>{
 const a=prepararTelaCarta('sdv1.token_teste');
 await a.contexto.window.cartaDiagnosticar();
 a.campo('corCep').value='74000000';
 a.campo('cartaPesoGramas').value='20';
 await a.contexto.window.cartaCotar();
 assert.equal(a.chamadas.length,2);
 assert.match(a.chamadas[1].url,/modo=cotar/);
 const payload=JSON.parse(a.chamadas[1].opts.body);
 assert.equal(payload.codigoServico,'12345');
 assert.equal(payload.pesoGramas,20);
});
test('senha mestre e senha SMTP nao sao solicitadas por prompt nativo visivel',()=>{
 const financeiro=fs.readFileSync(path.join(__dirname,'../financeiro.js'),'utf8');
 const coletas=fs.readFileSync(path.join(__dirname,'../coletas.js'),'utf8');
 const cotacoes=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 assert.ok(!/const senha=String\(prompt\('Acesso aos relatórios bancários/.test(financeiro));
 assert.ok(!/const senha=prompt\('Cole a senha de aplicativo/.test(financeiro));
 assert.ok(!/digitada=prompt\(/.test(coletas));
 assert.ok(cotacoes.includes("campo.type='password'"));
 assert.ok(cotacoes.includes('type="password"'));
 assert.ok(!cotacoes.includes('input.type=input.type==="password"?"text":"password"'));
});

test('normaliza numero duplicado: rua com 106 + campo 106',()=>{
 const a=separarNumeroEnderecoCarta('Rua Exemplo, 106','106');
 assert.equal(a.logradouro,'Rua Exemplo');
 assert.equal(a.numero,'106');
 const b=validarDestinatario({...destino,endereco:{...destino.endereco,logradouro:'Rua Exemplo, 106',numero:'106'}});
 assert.equal(b.endereco.logradouro,'Rua Exemplo');
 assert.equal(b.endereco.numero,'106');
});
test('nao apaga numero da rua: Rua 4, predio 217 e campos divergentes',()=>{
 const a=separarNumeroEnderecoCarta('Rua 4, 217','217');
 assert.equal(a.logradouro,'Rua 4');
 assert.equal(a.numero,'217');
 assert.throws(()=>separarNumeroEnderecoCarta('Rua Exemplo, 106','107'),/diverge/);
 assert.throws(()=>separarNumeroEnderecoCarta('Rua Exemplo, 106, 107',''),/diferentes/);
});
test('endereco impresso em A4 nao repete numero e avisa que nao e oficial',()=>{
 const a=prepararTelaCarta('sdv1.teste');
 a.campo('corCliente').value='Cliente Exemplo';
 a.campo('corCep').value='74000000';
 a.campo('corEndereco').value='Rua Exemplo, 106';
 a.campo('corNumero').value='106';
 a.campo('corBairro').value='Centro';
 a.campo('corCidade').value='Goiânia';
 a.campo('corUf').value='GO';
 a.contexto.window.cartaImprimirEnderecamento();
 assert.equal(a.anexos.length,1);
 assert.match(a.anexos[0].srcdoc,/Rua Exemplo, 106/);
 assert.ok(!a.anexos[0].srcdoc.includes('106, 106'));
 assert.match(a.anexos[0].srcdoc,/NÃO é rótulo postal oficial/);
 assert.match(a.anexos[0].srcdoc,/115mm/);
});
test('verificacao de API Pre-Postagem usa apenas GET, nunca cria carta',async()=>{
 const a=prepararTelaCarta('sdv1.teste');
 await a.contexto.window.cartaVerificarPrepostagem();
 assert.equal(a.chamadas.length,1);
 assert.match(a.chamadas[0].url,/modo=verificar-prepostagem/);
 assert.equal(a.chamadas[0].opts.method,'GET');
});
test('botao real segue bloqueado no ambiente de testes',()=>{
 const pagina=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(pagina.includes('Emissão real bloqueada até validação oficial'));
 assert.ok(pagina.includes('disabled title="Emissão real somente após o teste oficial'));
});
