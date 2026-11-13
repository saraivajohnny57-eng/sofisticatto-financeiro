'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {descobrirCartas,validarCotacao,validarDestinatario,montarPrepostagem,valorBR,separarNumeroEnderecoCarta,pilotoHabilitado,assinaturaPiloto,validarAssinaturaPiloto,telefoneRemetenteCarta,mensagensValidacaoCorreios,hojeBrasil,validarDataPrevistaCarta,layoutRegistradaConfirmado,dataPrevistaFormatoApiCorreios,arquivoImportacaoRegistrada,documentoValidoCarta}=require('../lib/integracoes/carta-comercial-correios')._teste;
const dataTeste=hojeBrasil();
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
test('cotação em gramas, não quilos e envelope até 500 g',()=>{assert.deepEqual(validarCotacao({cepDestino:'74000-000',pesoGramas:20,dataPrevistaPostagem:dataTeste}),{cep:'74000000',peso:20});assert.throws(()=>validarCotacao({cepDestino:'74000000',pesoGramas:501}));assert.throws(()=>validarCotacao({cepDestino:'74000000',pesoGramas:0}));});
test('valor retornado pela API aceita vírgula ou ponto decimal',()=>{assert.equal(valorBR('3,85'),3.85);assert.equal(valorBR('15.60'),15.60);assert.equal(valorBR('1.234,56'),1234.56);});
test('destinatário exige endereço completo',()=>{assert.equal(validarDestinatario(destino).nome,'Cliente Teste');assert.throws(()=>validarDestinatario({nome:'X',endereco:{cep:'123'}}));});
test('registrada documental não adiciona NF-e nem declaração de cosméticos',()=>{const p=montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s);assert.equal(p.codigoFormatoObjetoInformado,'1');assert.equal(p.pesoInformado,20);assert.ok(!('tipoDocumento' in p));assert.ok(!('chaveNFe' in p));assert.equal(p.destinatario.nome,'Cliente Teste');});
test('não tenta criar carta simples pela API individual',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,{...s,categoria:'simples'}),/lote/);});
test('bloqueia envio de produtos como Carta',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'COSMETICOS',destinatario:destino},c,s),/documentos/);});
test('protege divergência entre CEP usado na cotação e na etiqueta',()=>{assert.throws(()=>montarPrepostagem({cepDestino:'74200000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s),/CEP/);});

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
 assert.ok(pagina.includes('cartaEmitirPiloto'));
 assert.ok(pagina.includes('onclick="cartaEmitir()" disabled'));
 assert.ok(pagina.includes('primeira Carta Registrada REAL'));
});

test('passo 5 no navegador consulta somente GET com token sem divulgar credenciais',async()=>{
 const a=prepararTelaCarta('sdv1.teste');
 await a.contexto.window.cartaDiagnosticarRotulo();
 assert.equal(a.chamadas.length,1);
 assert.match(a.chamadas[0].url,/modo=diagnostico-rotulo/);
 assert.equal(a.chamadas[0].opts.method,'GET');
 assert.equal(a.chamadas[0].opts.headers['x-integrations-admin-key'],'sdv1.teste');
});
test('diagnostico backend de rotulo usa apenas GET e devolve somente status sem dados pessoais',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const chamadas=[];const mockModule={exports:{}};
 const fakeReq=nome=>{
   if(nome==='./_utils')return {exigirAdmin:()=>true};
   if(nome==='node:crypto')return require('node:crypto');
   if(nome==='./_correios')return {
     cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
     configuracaoEfetiva:async()=>({contrato:'123456',cartao:'1234567890'}),
     gerarToken:async()=>{throw Error('Token direto não deve ser solicitado');},
     apiComToken:async(url,opts)=>{chamadas.push({url,opts});return {ok:true};}
   };
   throw Error('Dependencia inesperada '+nome);
 };
 new Function('require','module','process',arquivo)(fakeReq,mockModule,{env:{VERCEL_ENV:'preview'}});
 let status=0,body;
 const res={status(s){status=s;return this;},json(x){body=x;return this;}};
 await mockModule.exports({method:'GET',query:{modo:'diagnostico-rotulo'}},res);
 assert.equal(status,200);
 assert.equal(body.ok,true);
 assert.equal(body.somenteLeitura,true);
 assert.equal(body.postagensCriadas,0);
 assert.equal(body.rotulosSolicitados,0);
 assert.equal(chamadas.length,2);
 assert.ok(chamadas.every(x=>!x.opts?.method || x.opts.method==='GET'));
 assert.deepEqual(chamadas.map(x=>x.url),[
   'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/123456/solicitadas',
   'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/123456/saldo'
 ]);
 assert.ok(chamadas.every(x=>x.url.startsWith('https://api.correios.com.br/prepostagem/')));
 assert.ok(!JSON.stringify(body).includes('1234567890'));
 assert.ok(!JSON.stringify(body).includes('Cliente Teste'));
});
test('diagnostico do rotulo nao confunde HTTP 403 com autorizacao comprovada',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}};
 const rf=nome=>{
   if(nome==='./_utils')return {exigirAdmin:()=>true};
   if(nome==='node:crypto')return require('node:crypto');
   return {cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[]}),
     configuracaoEfetiva:async()=>({contrato:'123'}),
     apiComToken:async()=>{const e=Error('Forbidden');e.httpStatus=403;throw e;},
     gerarToken:async()=>''};
 };
 new Function('require','module','process',arquivo)(rf,mod,{env:{}});
 let body;
 await mod.exports({method:'GET',query:{modo:'diagnostico-rotulo'}},{status(){return this},json(j){body=j;return this}});
 assert.equal(body.ok,true);
 assert.equal(body.diagnosticos.length,2);
 assert.ok(body.diagnosticos.every(x=>x.estado==='sem_permissao'));
 assert.equal(body.postagensCriadas,0);
});

test('retorno 404 das faixas nao compromete saldo e nao cria rotulos',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},chamadas=[];
 const requireMock=nome=>{
   if(nome==='./_utils')return {exigirAdmin:()=>true};
   if(nome==='node:crypto')return require('node:crypto');
   return {cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[]}),
     configuracaoEfetiva:async()=>({contrato:'ABC123'}),
     apiComToken:async(url,opts)=>{
       chamadas.push({url,opts});
       if(url.endsWith('/solicitadas')){const e=Error('Nao encontrado');e.httpStatus=404;throw e}
       return {saldo:12};
     },
     gerarToken:async()=>{throw Error('Criacao de objeto nao permitida')}
   };
 };
 new Function('require','module','process',arquivo)(requireMock,mod,{env:{}});
 let result;
 await mod.exports({method:'GET',query:{modo:'diagnostico-rotulo'}},{status(){return this;},json(body){result=body;return this;}});
 assert.equal(result.ok,true);
 assert.equal(result.saldoAcessivel,true);
 assert.equal(result.diagnosticos[0].estado,'nao_encontrado');
 assert.equal(result.diagnosticos[1].estado,'acessivel');
 assert.equal(result.postagensCriadas,0);
 assert.equal(result.rotulosSolicitados,0);
 assert.equal(chamadas.length,2);
});
test('diagnostico de carta nao acessa a listagem v2 que retornou 404 em filtro sem objetos',()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const diagnostic=arquivo.slice(arquivo.indexOf("if(acao==='diagnostico-rotulo')"),arquivo.indexOf('const p=req.body||{};',arquivo.indexOf("if(acao==='diagnostico-rotulo')")));
 assert.ok(!diagnostic.includes("await verificar('consulta_registradas'"));
 assert.ok(!diagnostic.includes("v2/prepostagens?status="));
 assert.ok(diagnostic.includes("/solicitadas"));
 assert.ok(diagnostic.includes("/saldo"));
});

test('piloto so habilita com flag, branch exata e ambiente Preview',()=>{
 const env={...process.env},base={CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112'};
 try{
   for(const [k,v] of Object.entries(base))process.env[k]=v;
   assert.equal(pilotoHabilitado(),true);
   process.env.VERCEL_ENV='production';assert.equal(pilotoHabilitado(),false);
   process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='main';assert.equal(pilotoHabilitado(),false);
   process.env.VERCEL_GIT_COMMIT_REF=base.VERCEL_GIT_COMMIT_REF;process.env.CORREIOS_CARTAS_EMISSAO_HABILITADA='0';assert.equal(pilotoHabilitado(),false);
 }finally{for(const k of Object.keys(base)){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
test('confirmacao HMAC expira em 10 minutos e impede troca de destinatario',()=>{
 const old=process.env.INTEGRATIONS_ENCRYPTION_KEY;
 process.env.INTEGRATIONS_ENCRYPTION_KEY='chave-de-teste-exclusiva-nao-real-12345678901234';
 try{
   const payload=montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s);
   const assinatura=assinaturaPiloto(payload);
   assert.equal(validarAssinaturaPiloto(assinatura,payload),true);
   const outro={...payload,destinatario:{...payload.destinatario,nome:'Outro destinatario'}};
   assert.equal(validarAssinaturaPiloto(assinatura,outro),false);
   assert.equal(validarAssinaturaPiloto(assinaturaPiloto(payload,Date.now()-11*60000),payload),false);
 }finally{if(old===undefined)delete process.env.INTEGRATIONS_ENCRYPTION_KEY;else process.env.INTEGRATIONS_ENCRYPTION_KEY=old}
});
test('sem confirmacao valida backend nao faz POST de primeira carta',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},chamadas=[];
 const env={CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',CORREIOS_CARTA_REGISTRADA_LAYOUT_VALIDADO:'1',INTEGRATIONS_ENCRYPTION_KEY:'segredo-de-testes-suficientemente-longo-1234'};
 const req=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
   cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
   configuracaoEfetiva:async()=>({...c,contrato:'12345',dr:'01'}),
   apiComToken:async()=>({codigo:'86720',pcFinal:'15,60'}),
   gerarToken:async()=>{throw Error('Nao deve ser chamado')}
 };
 new Function('require','module','process','fetch',src)(req,mod,{env},async()=>{chamadas.push('POST');throw Error('POST proibido')});
 let body,status;
 const resp={status(n){status=n;return this},json(j){body=j;return this}};
 await mod.exports({method:'POST',query:{modo:'emitir'},body:{cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,codigoServico:'12345',tipoConteudo:'DOCUMENTOS',destinatario:destino,confirmarEmissaoReal:true}},resp);
 assert.equal(status,403);
 assert.equal(body.codigo,'CONFIRMACAO_PILOTO_INVALIDA');
 assert.equal(chamadas.length,0);
});
test('piloto exige preflight 86720 + cotacao; primeiro POST unico e ID retornado',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},chamadas=[];
 const env={CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',CORREIOS_CARTA_REGISTRADA_LAYOUT_VALIDADO:'1',INTEGRATIONS_ENCRYPTION_KEY:'segredo-de-testes-suficientemente-longo-1234'};
 const requireMock=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
   cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
   configuracaoEfetiva:async()=>({...c,contrato:'12345',dr:'01'}),
   apiComToken:async url=>url.includes('/preco/')?{pcFinal:'15,60'}:{codigo:'86720'},
   gerarToken:async()=> 'token-mock'
 };
 const mockFetch=async(url,opts)=>{chamadas.push({url,opts});return {ok:true,status:200,async text(){return JSON.stringify({id:'PRabcdefghij1234567890AB'})}}};
 new Function('require','module','process','fetch',src)(requireMock,mod,{env},mockFetch);
 async function invoke(modo,body){
   let status=0,result;
   await mod.exports({method:'POST',query:{modo},body},{status(n){status=n;return this},json(x){result=x;return this}});
   return {status,result};
 }
 const p={cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,codigoServico:'12345',tipoConteudo:'DOCUMENTOS',destinatario:destino};
 const antes=await invoke('preparar',p);
 assert.equal(antes.status,200);assert.ok(antes.result.confirmacaoPiloto);assert.equal(antes.result.valorCotado,15.60);
 const emitido=await invoke('emitir',{...p,confirmarEmissaoReal:true,confirmacaoPiloto:antes.result.confirmacaoPiloto});
 assert.equal(emitido.status,200);assert.equal(emitido.result.idPrePostagem,'PRabcdefghij1234567890AB');
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].opts.method,'POST');
 const enviado=JSON.parse(chamadas[0].opts.body);
 assert.equal(enviado.codigoFormatoObjetoInformado,'1');assert.equal(enviado.pesoInformado,20);
 assert.match(enviado.dataPrevistaPostagem,/^\d{2}\/\d{2}\/\d{4}$/);
 assert.equal(enviado.precoPostagem,0);assert.ok(!('chaveNFe' in enviado));
});

test('preflight permite 86720 ausente da listagem geral quando GET especifico do cartao confirma',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 assert.ok(!arquivo.includes("if(!autorizado)throw Object.assign(Error('O serviço 86720"));
 assert.ok(arquivo.includes("apiComToken(u,{},'contrato')"));
});
test('preflight continua bloqueando quando consulta especifica devolve outro codigo',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},env={
  VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',
  CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',INTEGRATIONS_ENCRYPTION_KEY:'teste-seguro-com-mais-de-32-caracteres-123'
 };
 const deps=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
  cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
  configuracaoEfetiva:async()=>({...c,contrato:'12345',dr:'01'}),
  apiComToken:async()=>({codigo:'00999'}),
  gerarToken:async()=>{throw Error('POST não permitido')}
 };
 new Function('require','module','process',arquivo)(deps,mod,{env});
 let status,retorno;await mod.exports({
  method:'POST',query:{modo:'preparar'},body:{
   cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,codigoServico:'12345',tipoConteudo:'DOCUMENTOS',destinatario:destino}
 },{status(n){status=n;return this},json(x){retorno=x;return this}});
 assert.equal(status,422);
 assert.match(retorno.erro,/não confirmou o código 86720/);
});

test('erros oficiais msgs[] sao lidos sem expor CPF, token, senha, email ou stackTrace',()=>{
 const d=mensagensValidacaoCorreios({
  msgs:['PPN-123: Telefone do remetente inválido','RTL-036: Falta número do destinatário','CPF 12345678901 / usuario@exemplo.com'],
  causa:'java.sql.SQLException: java.stack.Segredo',stackTrace:'interno com token',
  token:'super-secreto'
 });
 assert.equal(d.length,3);
 assert.match(d[0],/PPN-123/);
 assert.match(d[1],/RTL-036/);
 assert.ok(!d.join(' ').includes('12345678901'));
 assert.ok(!d.join(' ').includes('usuario@exemplo.com'));
 assert.ok(!d.join(' ').includes('java.stack'));
 assert.ok(!d.join(' ').includes('super-secreto'));
});
test('telefone do remetente igual ao usado pelo PAC tem DDD e numero validos',()=>{
 assert.deepEqual(telefoneRemetenteCarta('(62) 3293-0035'),{dddTelefone:'62',telefone:'32930035'});
 assert.throws(()=>telefoneRemetenteCarta('123'),/Telefone do remetente/);
 const payload=montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s);
 assert.equal(payload.remetente.dddTelefone,'62');
 assert.equal(payload.remetente.telefone,'32930035');
});
test('HTTP 400 real com msgs preserva codigo e nao tenta repetir POST',async()=>{
 const fonte=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},chamadas=[];
 const env={CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',CORREIOS_CARTA_REGISTRADA_LAYOUT_VALIDADO:'1',INTEGRATIONS_ENCRYPTION_KEY:'segredo-dos-testes-de-cartas-2026-abcdef'};
 const mockRequire=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
  cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
  configuracaoEfetiva:async()=>({...c,contrato:'12345',dr:'01'}),
  apiComToken:async url=>url.includes('/preco/')?{pcFinal:'15,60'}:{codigo:'86720'},
  gerarToken:async()=> 'token-ficticio'
 };
 const mockFetch=async(url,options)=>{
  chamadas.push({url,options});
  return {ok:false,status:400,async text(){return JSON.stringify({msgs:['PPN-123: Campo invalido para a carta','RTL-036: Falta documento'],stackTrace:'nao mostrar'});}};
 };
 new Function('require','module','process','fetch',fonte)(mockRequire,mod,{env},mockFetch);
 const reqBase={cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,codigoServico:'12345',tipoConteudo:'DOCUMENTOS',destinatario:destino};
 async function chamar(modo,body){let status=0,retorno;await mod.exports({method:'POST',query:{modo},body},{status(n){status=n;return this},json(x){retorno=x;return this}});return {status,retorno};}
 const previa=await chamar('preparar',reqBase);
 assert.equal(previa.status,200);
 const resultado=await chamar('emitir',{...reqBase,confirmarEmissaoReal:true,confirmacaoPiloto:previa.retorno.confirmacaoPiloto});
 assert.equal(resultado.status,400);
 assert.equal(resultado.retorno.codigo,'CORREIOS_PREPOSTAGEM_RECUSADA');
 assert.equal(resultado.retorno.codigoCorreios,'PPN-123');
 assert.match(resultado.retorno.erro,/Campo invalido/);
 assert.ok(!JSON.stringify(resultado.retorno).includes('stackTrace'));
 assert.equal(chamadas.length,1);
});
test('navegador bloqueia segundo POST apos erro 400 ate reconciliacao manual',async()=>{
 const campos=new Map(),memoria=new Map([['sofisticatto_carta_erro400_20261113_conferido','1']]),chamadas=[];
 const el=id=>{
  if(!campos.has(id))campos.set(id,{value:'',textContent:'',style:{},children:[],replaceChildren(){this.children=[]},append(o){this.children.push(o)}});
  return campos.get(id);
 };
 let confirmacoes=0;
 const contexto={
  window:{confirm(){confirmacoes++;return true;}},
  document:{getElementById:el,createElement:()=>({value:'',textContent:'',style:{}})},
  sessionStorage:{getItem:()=>null},
  localStorage:{getItem:key=>memoria.get(key)||null,setItem:(key,value)=>memoria.set(key,value),removeItem:key=>memoria.delete(key)},
  obterChaveIntegracoesCotacao:async()=> 'token-ficticio',
  fetch:async(url,options)=>{
   chamadas.push({url,options});
   const modo=String(url).split('modo=')[1];
   if(modo==='diagnostico')return {ok:true,status:200,json:async()=>({ok:true,servicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD',categoria:'registrada'}],emissaoDeTesteHabilitada:true,observacao:'Disponivel'})};
   if(modo==='preparar')return {ok:true,status:200,json:async()=>({ok:true,confirmacaoPiloto:'cp1.fake',resumo:{destinatario:'Cliente Teste',cepDestino:'74000000',endereco:'Rua B, 30',cidade:'Goiânia',uf:'GO',pesoGramas:20,dataPrevistaPostagem:dataTeste,modalidade:'CARTA REGISTRADA'},valorCotado:15.60})};
   if(modo==='emitir')return {ok:false,status:400,json:async()=>({ok:false,codigoCorreios:'PPN-123',erro:'Correios HTTP 400: PPN-123: Campo invalido'})};
   throw Error('Modo inesperado '+modo);
  }
 };
 vm.runInNewContext(telaCarta,contexto);
 await contexto.window.cartaDiagnosticar();
 for(const [id,value] of Object.entries({corCliente:'Cliente Teste',corCep:'74000000',corEndereco:'Rua B',corNumero:'30',corBairro:'Centro',corCidade:'Goiânia',corUf:'GO',cartaPesoGramas:'20'}))el(id).value=value;
 await contexto.window.cartaPreparar();
 await contexto.window.cartaEmitir();
 const postagens=()=>chamadas.filter(x=>String(x.url).includes('modo=emitir')).length;
 assert.equal(postagens(),1);
 assert.equal(memoria.has('sofisticatto_carta_piloto_tentativa_pendente'),true);
 assert.match(el('cartaStatus').textContent,/PPN-123/);
 await contexto.window.cartaEmitir();
 assert.equal(postagens(),1);
 assert.match(el('cartaStatus').textContent,/tentativa anterior/);
 assert.equal(confirmacoes,1);
 contexto.window.cartaConferiTentativaAnterior();
 assert.equal(memoria.has('sofisticatto_carta_piloto_tentativa_pendente'),false);
 assert.match(el('cartaStatus').textContent,/valide os dados|botão 3|botão 3/i);
 assert.equal(postagens(),1);
});

test('atualizacao exige verificar tentativa real de 13/11 antes de outra postagem',()=>{
 const tela=fs.readFileSync(path.join(__dirname,'../cartas-comerciais-correios.js'),'utf8');
 assert.ok(tela.includes("situacao:'reconciliar_envio_anterior_400'"));
 assert.ok(tela.includes('CHAVE_400_ANTERIOR_CONFERIDO'));
 assert.ok(tela.includes('const pendente=Boolean(localStorage.getItem(CHAVE_TENTATIVA_CARTA))'));
 assert.ok(tela.includes('botao.disabled=!(pilotoDisponivel&&tokenPiloto&&!emitida&&!pendente&&!pilotando)'));
});

test('data prevista de postagem no Brasil é ISO e obrigatória no payload',()=>{
 assert.match(dataTeste,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(validarDataPrevistaCarta(dataTeste),dataTeste);
 const p=montarPrepostagem({cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino},c,s);
 assert.equal(dataPrevistaFormatoApiCorreios(dataTeste),dataTeste.slice(8,10)+'/'+dataTeste.slice(5,7)+'/'+dataTeste.slice(0,4));
 assert.equal(p.dataPrevistaPostagem,dataTeste.slice(8,10)+'/'+dataTeste.slice(5,7)+'/'+dataTeste.slice(0,4));
 assert.equal(p.codigoFormatoObjetoInformado,'1');
});
test('data prevista passada, inválida, ausente ou muito distante é bloqueada',()=>{
 assert.throws(()=>validarDataPrevistaCarta(''),/Informe a data prevista/);
 assert.throws(()=>validarDataPrevistaCarta('2026-02-31'),/inválida/);
 assert.throws(()=>validarDataPrevistaCarta('2020-01-01'),/passado/);
 const futura=new Date(Date.parse(dataTeste+'T00:00:00Z')+15*86400000).toISOString().slice(0,10);
 assert.throws(()=>validarDataPrevistaCarta(futura),/14 dias/);
});
test('PPN-213 bloqueia novo envio real sem o layout registrado homologado',async()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},calls=[];
 const env={CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',INTEGRATIONS_ENCRYPTION_KEY:'segredo-de-testes-suficientemente-longo-1234'};
 const deps=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
  cfg:()=>({}),descobrirContrato:async()=>({todosServicos:[{codigo:'12345',descricao:'CARTA COML REG PL3 MFD'}]}),
  configuracaoEfetiva:async()=>({...c,contrato:'12345',dr:'01'}),
  apiComToken:async url=>url.includes('/preco/')?{pcFinal:'15,60'}:{codigo:'86720'},
  gerarToken:async()=> 'token-mock'
 };
 const mockFetch=async()=>{calls.push('POST');throw Error('POST inesperado')};
 new Function('require','module','process','fetch',arquivo)(deps,mod,{env},mockFetch);
 let code,body;
 const reply={status(n){code=n;return this;},json(x){body=x;return this;}};
 const p={cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,codigoServico:'12345',tipoConteudo:'DOCUMENTOS',destinatario:destino};
 await mod.exports({method:'POST',query:{modo:'preparar'},body:p},reply);
 assert.equal(code,200);
 assert.equal(body.emissaoDeTesteHabilitada,false);
 const sig=body.confirmacaoPiloto;
 await mod.exports({method:'POST',query:{modo:'emitir'},body:{...p,confirmarEmissaoReal:true,confirmacaoPiloto:sig}},reply);
 assert.equal(code,423);
 assert.equal(body.codigo,'PPN213_LAYOUT_REGISTRADO_PENDENTE');
 assert.equal(calls.length,0);
});

test('diagnostico de registrada usa GET especifico do 80799 sem qualquer POST',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},consultas=[],requisicoesCriacao=[];
 const deps=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
   cfg:()=>({}),
   descobrirContrato:async()=>({todosServicos:[
     {codigo:'80799',descricao:'CARTA COML REG PL3 CHANC ETIQ'},
     {codigo:'80810',descricao:'CARTA COML RG ARC PL3 CHAN ETI'}]}),
   configuracaoEfetiva:async()=>({...c,contrato:'123456',cartao:'0079210350',dr:'01'}),
   apiComToken:async(url,options,escopo)=>{consultas.push({url,options,escopo});return {codigo:'80799'};},
   gerarToken:async()=>{throw Error('Token de criação não deve ser obtido')}
 };
 new Function('require','module','process','fetch',src)(deps,mod,{env:{
   VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',
   CORREIOS_CARTAS_EMISSAO_HABILITADA:'1'
 }},async()=>{requisicoesCriacao.push('POST');throw Error('POST inesperado')});
 let resultado,status;await mod.exports({method:'GET',query:{modo:'diagnostico'}},
   {status(n){status=n;return this},json(j){resultado=j;return this}});
 assert.equal(status,200);
 assert.equal(resultado.registrada80799.codigo,'80799');
 assert.equal(resultado.registrada80799.presenteNoContrato,true);
 assert.equal(resultado.registrada80799.consultaDireta,'confirmado');
 assert.equal(resultado.emissaoDeTesteHabilitada,false);
 assert.equal(consultas.length,1);
 assert.match(consultas[0].url,/\/servicos\/80799$/);
 assert.equal(consultas[0].escopo,'contrato');
 assert.equal(consultas[0].options.method,undefined);
 assert.equal(requisicoesCriacao.length,0);
});
test('falha na consulta 80799 é inconclusiva, não confirma emissão real',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}};
 const deps=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
   cfg:()=>({}),
   descobrirContrato:async()=>({todosServicos:[{codigo:'80799',descricao:'CARTA COML REG PL3 CHANC ETIQ'}]}),
   configuracaoEfetiva:async()=>({...c,contrato:'123456',cartao:'0079210350',dr:'01'}),
   apiComToken:async()=>{const erro=Error('Sem acesso');erro.httpStatus=403;throw erro;},
   gerarToken:async()=>{throw Error('Token de criação não deve ser obtido')}
 };
 new Function('require','module','process',src)(deps,mod,{env:{
  VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112',
  CORREIOS_CARTAS_EMISSAO_HABILITADA:'1'
 }});
 let resposta;await mod.exports({method:'GET',query:{modo:'diagnostico'}},
  {status(){return this},json(x){resposta=x;return this}});
 assert.equal(resposta.registrada80799.consultaDireta,'consulta_falhou');
 assert.equal(resposta.registrada80799.httpStatus,403);
 assert.equal(resposta.emissaoDeTesteHabilitada,false);
});
test('interface prioriza 80799 sem permitir emissão enquanto o layout PPN-213 não foi homologado',()=>{
 const front=fs.readFileSync(path.join(__dirname,'../cartas-comerciais-correios.js'),'utf8');
 assert.ok(front.includes("servicos.find(x=>x.codigo==='80799'&&x.categoria==='registrada')"));
 assert.ok(front.includes("verificada?.consultaDireta==='confirmado'"));
 const back=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 assert.ok(back.includes('PPN213_LAYOUT_REGISTRADO_PENDENTE'));
 assert.ok(back.includes('if(!layoutRegistradaConfirmado())return responder(res,423'));
});

test('arquivo PPN de registrada 80799 segue a tabela oficial: array, registro 025, formato 001, data DD/MM/AAAA',()=>{
 const real={...destino,cpfCnpj:'39963241115'};
 const servico={codigo:'80799',descricao:'CARTA COML REG PL3 CHANC ETIQ',categoria:'registrada'};
 const arquivo=arquivoImportacaoRegistrada({
  cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',
  destinatario:real
 },c,servico);
 assert.equal(arquivo.length,1);
 const item=arquivo[0];
 assert.equal(item.codigoServico,'80799');
 assert.equal(item.pesoInformado,'20');
 assert.equal(item.codigoFormatoObjetoInformado,'001');
 assert.equal(item.cienteObjetoNaoProibido,1);
 assert.deepEqual(item.listaServicoAdicional,[{codigoServicoAdicional:'025'}]);
 assert.equal(item.sequencial,'1');
 assert.equal(item.dataPrevistaPostagem,dataTeste.slice(8)+'/'+dataTeste.slice(5,7)+'/'+dataTeste.slice(0,4));
 assert.equal(item.destinatario.cpfCnpj,'39963241115');
 assert.equal(item.remetente.cpfCnpj,'05451985000195');
 assert.ok(!('numeroCartaoPostagem' in item));
 assert.ok(!('idCorreios' in item));
 assert.ok(!('chaveNFe' in item));
 assert.ok(!('itensDeclaracaoConteudo' in item));
 assert.ok(!('precoPostagem' in item));
 assert.ok(!('pesoCubico' in item));
});
test('documento da carta brasileira deve existir e ter dígitos verificadores válidos',()=>{
 assert.equal(documentoValidoCarta('05451985000195'),true);
 assert.equal(documentoValidoCarta('39963241115'),true);
 assert.equal(documentoValidoCarta('39963241116'),false);
 assert.equal(documentoValidoCarta('00000000000'),false);
 assert.equal(documentoValidoCarta('05451985000196'),false);
 const dados={cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',destinatario:destino};
 assert.throws(()=>arquivoImportacaoRegistrada(dados,c,{codigo:'80799',categoria:'registrada'}),/CPF\/CNPJ válido/);
});
test('arquivo não permite serviço de AR nem PAC nem endereço fora dos limites da tabela PDF',()=>{
 const p={cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,tipoConteudo:'DOCUMENTOS',
  destinatario:{...destino,cpfCnpj:'39963241115'}};
 assert.throws(()=>arquivoImportacaoRegistrada(p,c,{codigo:'03298',categoria:'registrada'}),/somente para Carta Registrada 80799/);
 assert.throws(()=>arquivoImportacaoRegistrada(p,c,{codigo:'80810',categoria:'registrada_ar'}),/somente para Carta Registrada 80799/);
 const grande={...p,destinatario:{...p.destinatario,endereco:{...p.destinatario.endereco,numero:'1234567'}}};
 assert.throws(()=>arquivoImportacaoRegistrada(grande,c,{codigo:'80799',categoria:'registrada'}),/numero/);
});
test('endpoint exportar JSON 80799 é read-only perante Correios mesmo quando POST real está bloqueado',async()=>{
 const fonte=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 const mod={exports:{}},transmissoes=[];
 const deps=n=>n==='node:crypto'?require('node:crypto'):n==='./_utils'?{exigirAdmin:()=>true}:{
  cfg:()=>({}),
  descobrirContrato:async()=>({todosServicos:[{codigo:'80799',descricao:'CARTA COML REG PL3 CHANC ETIQ'}]}),
  configuracaoEfetiva:async()=>({...c,contrato:'123456',cartao:'0079210350',dr:'01'}),
  apiComToken:async()=>{throw Error('Consulta inesperada no modo exportar')},
  gerarToken:async()=>{throw Error('Token não pode ser solicitado')}
 };
 new Function('require','module','process','fetch',fonte)(deps,mod,{env:{
  CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112'
 }},async()=>{transmissoes.push('POST');throw Error('Transmissão não permitida')});
 let status,body;
 await mod.exports({method:'POST',query:{modo:'arquivo-registrado'},body:{
  cepDestino:'74000000',pesoGramas:20,dataPrevistaPostagem:dataTeste,
  tipoConteudo:'DOCUMENTOS',codigoServico:'80799',
  destinatario:{...destino,cpfCnpj:'39963241115'}
 }},{status(n){status=n;return this},json(x){body=x;return this}});
 assert.equal(status,200);
 assert.equal(body.ok,true);
 assert.equal(body.somenteArquivo,true);
 assert.equal(body.requerImportacaoManual,true);
 assert.equal(body.postagensCriadas,0);
 assert.equal(body.arquivo.length,1);
 assert.equal(body.arquivo[0].codigoServico,'80799');
 assert.equal(transmissoes.length,0);
});
test('download JSON é inserido na mesma tela sem liberar emissão real',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(html.includes('onclick="cartaExportarRegistrada()"'));
 assert.ok(html.includes('sem envio'));
 const front=fs.readFileSync(path.join(__dirname,'../cartas-comerciais-correios.js'),'utf8');
 assert.ok(front.includes("request('arquivo-registrado',corpo())"));
 assert.ok(front.includes("JSON.stringify(items,null,2)"));
 const back=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-comercial-correios.js'),'utf8');
 assert.ok(back.includes("if(!layoutRegistradaConfirmado())return responder(res,423"));
 assert.ok(!back.slice(back.indexOf("if(acao==='arquivo-registrado')"),back.indexOf("if(acao==='cotar')")).includes("gerarToken("));
});
