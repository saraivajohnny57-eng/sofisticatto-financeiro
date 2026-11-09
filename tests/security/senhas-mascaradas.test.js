'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');

test('campos mestre, token, segredos e senha de usuario possuem type=password',()=>{
 const html=read('index.html');
 for(const id of ['senha','novaSenha','gnreCertSenhaV423','braspressRapidoSenha',
  'integracaoAdminKey','integracaoCredSenha','integracaoCredSenhaRastreioSSW',
  'integracaoCredToken','integracaoCredApiKey','integracaoCredClientSecret',
  'bbIntegrationsAdminKey','bbAppKey','bbClientId','bbClientSecret',
  'bradescoClientId','bradescoClientSecret','bradescoP12Senha']){
  const match=html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>'));
  // A tela de login declara o type antes do id; as outras combinam as ordens.
  const matchAlternativo=html.match(new RegExp('<input\\b[^>]*\\btype="password"[^>]*\\bid="'+id+'"[^>]*>'));
  const input=match?.[0]||matchAlternativo?.[0];
  assert.ok(input,'Campo ausente: '+id);
  assert.match(input,/\btype="password"/,'Campo deveria ser mascarado: '+id);
 }
});

test('script de entrada segura e carregado antes dos modulos financeiros',()=>{
 const html=read('index.html');
 const seguranca=html.indexOf('<script src="senha-segura.js?v=');
 const financeiro=html.indexOf('<script src="financeiro.js?v=');
 assert.ok(seguranca>=0&&seguranca<financeiro);
});
test('senha mestre e chave administrativa nao utilizam mais prompt visivel',()=>{
 const financeiro=read('financeiro.js');
 assert.doesNotMatch(financeiro,/prompt\s*\(\s*['"][\s\S]{0,200}(?:Senha Mestre|senha de aplicativo|INTEGRATIONS_ADMIN_KEY)/i);
 assert.match(financeiro,/const chave=await obterChaveAdminSmtp\(\)/);
 assert.match(financeiro,/async function obterChaveAdminSmtp\(\)/);
 assert.match(financeiro,/await solicitarSegredoSofisticatto\(\{titulo:'Acesso aos relatórios bancários'/);
 assert.match(financeiro,/await solicitarSegredoSofisticatto\(\{titulo:'Senha de aplicativo do Google'/);
});
test('nenhum botao do HTML revela credenciais sensiveis enquanto se digita',()=>{
 const html=read('index.html');
 const cotacoes=read('cotacoes.js');
 const integracoes=read('integracoes-seguras.js');
 assert.doesNotMatch(html,/onclick="alternarSenhaIntegracao\('/);
 assert.doesNotMatch(cotacoes,/verChaveIntegracoesCotacao|input\.type=input\.type==="password"\?"text"/);
 assert.match(cotacoes,/id="campoChaveIntegracoesCotacao" type="password"/);
 assert.doesNotMatch(integracoes,/campo\.type=campo\.type==="password"\?"text":"password"/);
 assert.match(integracoes,/campo\.type="password"/);
});
test('modal de senhas nao armazena nem registra segredo',()=>{
 const s=read('senha-segura.js');
 assert.doesNotMatch(s,/localStorage|sessionStorage|console\.|prompt\s*\(/);
 assert.match(s,/input\.type='password'/);
 assert.match(s,/input\.value=''/);
});

function mockDocumento(){
 const document={activeElement:null};
 function no(tag){
  const el={tagName:tag.toUpperCase(),children:[],handlers:{},value:'',
   append(...els){for(const e of els){e.parent=this;this.children.push(e)}},
   appendChild(el){this.append(el);return el},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this)},
   setAttribute(name,value){this[name]=value},
   addEventListener(name,fn){this.handlers[name]=fn},
   removeEventListener(name){delete this.handlers[name]},
   focus(){document.activeElement=this}
  };
  return el;
 }
 document.createElement=no;
 document.getElementById=()=>null;
 document.body=no('body');document.head=no('head');document.activeElement=no('button');
 return document;
}
function localizar(node,pred){
 if(pred(node))return node;
 for(const c of node.children||[]){const found=localizar(c,pred);if(found)return found}
 return null;
}
test('modal mascara de fato a entrada e apaga campo ao confirmar ou cancelar',async()=>{
 const document=mockDocumento(),window={};
 vm.runInNewContext(read('senha-segura.js'),{window,document,console:undefined,module:{exports:{}}});
 const pedir=window.solicitarSegredoSofisticatto;
 const senha=pedir({titulo:'Senha mestre',rotulo:'Senha'});
 const campo=localizar(document.body,n=>n.id==='sofSegredoCampo');
 const form=localizar(document.body,n=>n.tagName==='FORM');
 assert.equal(campo.type,'password');
 assert.equal(campo.autocomplete,'new-password');
 assert.equal(campo.spellcheck,false);
 campo.value='chave-sintetica-teste';
 form.handlers.submit({preventDefault(){}});
 assert.equal(await senha,'chave-sintetica-teste');
 assert.equal(campo.value,'');
 assert.equal(document.body.children.length,0);
 const cancelado=pedir({titulo:'Senha mestre'});
 const botao=localizar(document.body,n=>n.className==='sof-segredo-cancelar');
 botao.handlers.click();
 assert.equal(await cancelado,'');
 assert.equal(document.body.children.length,0);
});
test('GNRE 199 usa explicacao precisa e link para Automacao de homologacao',()=>{
 const js=read('cotacoes.js');
 assert.match(js,/codigo_199_nas_duas_consultas/);
 assert.match(js,/https:\/\/www\.testegnre\.pe\.gov\.br:444\/gnre\/portal\/automacao\.jsp/);
 assert.match(js,/rejeição 102/);
});
