'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'cotacoes.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const match=js.match(/function diagnosticarNfeGnreMg100102\(nfe\)\{[\s\S]*?\n\}/);
assert.ok(match,'Funcao de diagnostico da NF-e precisa existir');
const diagnosticar=vm.runInNewContext('('+match[0]+')');
const base={numero:'51076',ufOrigem:'GO',ufDestino:'MG',
 consumidorFinal:'1',indIeDest:'9',valorDifal:'19.01'};
test('XML autorizado MG com DIFAL positivo permanece apto para pre-envio',()=>{
 assert.equal(diagnosticar(base).length,0);
});
test('NF-e para outro estado pode ser lida mas NAO gera guia MG',()=>{
 const p=diagnosticar({...base,ufDestino:'SP'});
 assert.equal(p.length,1);
 assert.match(p[0],/Destino detectado: SP/);
});
test('NF-e sem vICMSUFDest no total mostra pendencia em vez de ser rejeitada na importacao',()=>{
 for(const valorDifal of ['', '0.00', 'texto']){
  const p=diagnosticar({...base,valorDifal});
  assert.ok(p.some(x=>/DIFAL de destino/.test(x)));
 }
});
test('destinatario contribuinte ou operacao nao final bloqueia emissao MG mas preserva diagnostico',()=>{
 const p=diagnosticar({...base,consumidorFinal:'0',indIeDest:'1'});
 assert.equal(p.length,2);
});
test('importador conserva NF-e autorizada mesmo se UF/DIFAL nao se encaixam no piloto',()=>{
 assert.doesNotMatch(js,/if\(dados\.ufOrigem!=='GO'\|\|dados\.ufDestino!=='MG'\|\|!dados\.valorDifal\)\s*throw/);
 assert.match(js,/gnrePreenvioNfeLida=dados;\s*const pendencias=diagnosticarNfeGnreMg100102\(dados\)/);
 assert.match(js,/dados\.statusAutorizacao!=='100'/);
 assert.match(js,/dados\.chaveProtocolo!==chave/);
 assert.match(js,/dados\.ambienteNfe!=='1'/);
 assert.match(js,/gnrePreenvioLoteAprovado=null;/);
 assert.match(js,/ganrePreenvioResultado|gnrePreenvioResultado/);
});
test('pre-envio e pre-producao aplicam diagnostico antes da chamada autenticada',()=>{
 const pre=js.slice(js.indexOf('async function verificarPreenvioGnreMg()'),js.indexOf('// Só é permitido enviar após pré-envio'));
 const prod=js.slice(js.indexOf('async function verificarGnrePreProducaoMg()'),js.indexOf('// Confirmacao independente do endpoint ConfigUF'));
 assert.ok(pre.indexOf('diagnosticarNfeGnreMg100102')<pre.indexOf('obterChaveIntegracoesCotacao'));
 assert.ok(prod.indexOf('diagnosticarNfeGnreMg100102')<prod.indexOf('obterChaveIntegracoesCotacao'));
 assert.match(html,/Importe qualquer XML autorizado de NF-e/);
 assert.match(html,/A importação não gera guia/);
});
