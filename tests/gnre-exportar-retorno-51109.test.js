'use strict';
// Exportacao administrativa somente leitura de retorno GNRE. Dados totalmente sinteticos.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const utils=require('../lib/integracoes/_utils');
const recibo='1234567890',chave='5'.repeat(44);
const ref={
 chave_nfe:chave,numero_nfe:'51109',receita:'100102',uf_favorecida:'MG',
 valor_principal:'19.01',ambiente:'homologacao',situacao:'recebida'
};
const retorno='<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
 +'<soap12:Body><gnreRespostaMsg><ns1:TResultLote_GNRE xmlns:ns1="http://www.gnre.pe.gov.br">'
 +'<ns1:ambiente>2</ns1:ambiente><ns1:numeroRecibo>'+recibo+'</ns1:numeroRecibo>'
 +'<ns1:situacaoProcess><ns1:codigo>402</ns1:codigo>'
 +'<ns1:descricao>Lote Processado com sucesso</ns1:descricao></ns1:situacaoProcess>'
 +'<ns1:resultado><ns1:guia versao="2.00"><ns1:situacaoGuia>0</ns1:situacaoGuia>'
 +'<ns1:ufFavorecida>MG</ns1:ufFavorecida><ns1:itensGNRE><ns1:item>'
 +'<ns1:receita>100102</ns1:receita><ns1:documentoOrigem tipo="10">51109</ns1:documentoOrigem>'
 +'<ns1:valor tipo="11">19.01</ns1:valor></ns1:item></ns1:itensGNRE>'
 +'</ns1:guia></ns1:resultado></ns1:TResultLote_GNRE></gnreRespostaMsg></soap12:Body></soap12:Envelope>';
let called=0,storage=0,xmlResponse=retorno,dbRecord=ref;
const handler=withModuleStubs({
 './gnre-idempotencia-repo':{obterReciboParaConsulta:async()=>recibo},
 './gnre-certificado':{credenciais:async()=>({pfx:Buffer.from('FAKE'),passphrase:'TEST'})},
 './gnre-soap-homologacao':{enviarSoap:async()=>{
  called++;return {status:200,body:xmlResponse,analise:{ok:true,categoria:'soap_ok'}};
 }},
 './_utils':{...utils,supabaseRest:async()=>{
  storage++;return dbRecord?[dbRecord]:[];
 }}
},()=>require('../lib/integracoes/gnre-exportar-retorno-51109'));
const headers={'x-integrations-admin-key':'admin-ficticio'};
function env(){
 setEnv({
  INTEGRATIONS_ADMIN_KEY:'admin-ficticio',VERCEL_ENV:'preview',
  GNRE_AMBIENTE:'homologacao',VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',
  GNRE_PILOTO_51109_LOTE_SHA256:'e664978727ec6f8a035c7184856afe4dcafb1cd1bd0f3d71da9bfb5a8979c41d',
  GNRE_PILOTO_MG_51109_ENVIO:'0'
 });
}
async function request(body={piloto_mg_51109:true},h=headers){
 const res=fakeResponse();
 await handler(fakeRequest({method:'POST',headers:h,body}),res);
 return res;
}
preserveEnv();
test.beforeEach(()=>{resetEnv();called=0;storage=0;xmlResponse=retorno;dbRecord=ref;});
test.after(()=>restoreEnv());
test('download administrativo produz XML homologado sem reenvio',async()=>{
 env();
 const res=await request();
 assert.equal(res.statusCode,200);
 assert.match(res.getHeader('content-type'),/application\/xml/);
 assert.match(res.getHeader('content-disposition'),/HOMOLOGACAO/);
 assert.match(res.getHeader('cache-control'),/no-store/);
 assert.ok(String(res.body).includes('TResultLote_GNRE'));
 assert.equal(called,1);
 assert.equal(storage,1);
 assert.equal(handler.pilotoHabilitado(),true);
});
test('sem autenticacao e fora da preview nao consulta nem exporta',async()=>{
 env();
 let r=await request({piloto_mg_51109:true},{});
 assert.equal(r.statusCode,401);assert.equal(called,0);
 setEnv({VERCEL_ENV:'production'});
 r=await request();assert.equal(r.statusCode,403);assert.equal(called,0);
 env();r=await request({});assert.equal(r.statusCode,403);assert.equal(called,0);
});
test('retorno divergente, nao processado ou ambiente incorreto bloqueia exportacao',async()=>{
 env();
 for(const xml of [
  retorno.replace('<ns1:codigo>402</ns1:codigo>','<ns1:codigo>401</ns1:codigo>'),
  retorno.replace('>51109</ns1:documentoOrigem>','>51110</ns1:documentoOrigem>'),
  retorno.replace('>19.01</ns1:valor>','>29.01</ns1:valor>'),
  retorno.replace('>MG</ns1:ufFavorecida>','>GO</ns1:ufFavorecida>'),
  retorno.replace('>2</ns1:ambiente>','>1</ns1:ambiente>')
 ]){
  xmlResponse=xml;
  const r=await request();
  assert.equal(r.statusCode,409);
  assert.equal(r.getHeader('content-type'),undefined);
 }
 xmlResponse=retorno;dbRecord=null;
 assert.equal((await request()).statusCode,409);
});
test('rota de exportacao nunca executa recepcao nem escreve no Supabase',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-exportar-retorno-51109.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'../api/integracoes.js'),'utf8');
 assert.doesNotMatch(s,/executarRecepcao|montarPlanoRecepcao/);
 assert.match(s,/obterReciboParaConsulta/);
 assert.match(s,/conferirResultadoIndividual/);
 assert.match(api,/gnre-exportar-retorno-51109/);
 assert.match(ui,/async function baixarXmlRetornoGnre51109/);
 assert.match(ui,/Documento técnico de HOMOLOGAÇÃO/);
});
