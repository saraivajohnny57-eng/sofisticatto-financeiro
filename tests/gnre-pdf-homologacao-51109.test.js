'use strict';
// Consulta PDF em HOMOLOGAÇÃO, exclusivamente com dados sintéticos, sem rede.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const {montarConsultaRecibo,montarConsultaReciboComPdf}=require('../lib/integracoes/gnre-consulta-xml');
const utils=require('../lib/integracoes/_utils');
const recibo='1234567890';
const ref={chave_nfe:'5'.repeat(44),numero_nfe:'51109',receita:'100102',
 uf_favorecida:'MG',valor_principal:'19.01',ambiente:'homologacao',situacao:'recebida'};
const pdf=Buffer.from('%PDF-1.4\n'+('exemplo pdf sintético sem dados reais '.repeat(8))+'\n%%EOF');
function resposta(comPdf=false){
 return '<soap12:Envelope><soap12:Body><ns1:TResultLote_GNRE xmlns:ns1="http://www.gnre.pe.gov.br">'
  +'<ns1:ambiente>2</ns1:ambiente><ns1:numeroRecibo>'+recibo+'</ns1:numeroRecibo>'
  +'<ns1:situacaoProcess><ns1:codigo>402</ns1:codigo>'
  +'<ns1:descricao>Lote Processado com sucesso</ns1:descricao></ns1:situacaoProcess>'
  +'<ns1:resultado><ns1:guia versao="2.00"><ns1:situacaoGuia>0</ns1:situacaoGuia>'
  +'<ns1:ufFavorecida>MG</ns1:ufFavorecida><ns1:itensGNRE><ns1:item>'
  +'<ns1:receita>100102</ns1:receita><ns1:documentoOrigem tipo="10">51109</ns1:documentoOrigem>'
  +'<ns1:valor tipo="11">19.01</ns1:valor></ns1:item></ns1:itensGNRE></ns1:guia>'
  +(comPdf?'<ns1:pdfGuias>'+pdf.toString('base64')+'</ns1:pdfGuias>':'')
  +'</ns1:resultado></ns1:TResultLote_GNRE></soap12:Body></soap12:Envelope>';
}
let response=resposta(false),called=0,queryXml='',maxLimit=0;
const handler=withModuleStubs({
 './gnre-idempotencia-repo':{obterReciboParaConsulta:async()=>recibo},
 './gnre-certificado':{credenciais:async()=>({pfx:Buffer.from('FAKE'),passphrase:'TEST'})},
 './gnre-soap-homologacao':{enviarSoap:async args=>{
  called++;queryXml=args.xml;maxLimit=args.maxRespostaBytes;
  return {status:200,body:response,analise:{ok:true,categoria:'soap_ok'}};
 }},
 './_utils':{...utils,supabaseRest:async()=>[ref]}
},()=>require('../lib/integracoes/gnre-pdf-homologacao-51109'));
const auth={'x-integrations-admin-key':'fake-admin'};
function env(){setEnv({
 INTEGRATIONS_ADMIN_KEY:'fake-admin',
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',
 GNRE_AMBIENTE:'homologacao',
 GNRE_PILOTO_51109_LOTE_SHA256:'e664978727ec6f8a035c7184856afe4dcafb1cd1bd0f3d71da9bfb5a8979c41d',
 GNRE_PILOTO_MG_51109_ENVIO:'0'
});}
async function invoke(body={piloto_mg_51109:true},headers=auth){
 const res=fakeResponse();
 await handler(fakeRequest({method:'POST',headers,body}),res);return res;
}
preserveEnv();test.beforeEach(()=>{resetEnv();response=resposta(false);called=0;queryXml='';maxLimit=0});test.after(()=>restoreEnv());
test('consulta padrao permanece sem pdf; consulta opcional acrescenta incluirPDFGuias=S',()=>{
 assert.doesNotMatch(montarConsultaRecibo(recibo),/incluirPDFGuias/);
 const xml=montarConsultaReciboComPdf(recibo);
 assert.match(xml,/<numeroRecibo>1234567890<\/numeroRecibo><incluirPDFGuias>S<\/incluirPDFGuias>/);
 assert.equal((xml.match(/TConsLote_GNRE/g)||[]).length,2);
 assert.throws(()=>montarConsultaReciboComPdf('abc'));
});
test('resposta sem pdf informa indisponibilidade sem nova recepcao',async()=>{
 env();const r=await invoke();
 assert.equal(r.statusCode,200);
 assert.equal(r.body.pdf_disponivel,false);
 assert.equal(r.body.codigo_gnre,'402');
 assert.equal(r.body.transmissao,false);
 assert.equal(called,1);
 assert.match(queryXml,/<incluirPDFGuias>S<\/incluirPDFGuias>/);
 assert.equal(maxLimit,4*1024*1024);
});
test('PDF original de base64 valido é devolvido com ambiente homologacao, sem PDF falso',async()=>{
 env();response=resposta(true);
 const r=await invoke();
 assert.equal(r.statusCode,200);
 assert.match(r.getHeader('content-type'),/application\/pdf/);
 assert.match(r.getHeader('content-disposition'),/HOMOLOGACAO/);
 assert.match(r.getHeader('cache-control'),/no-store/);
 assert.ok(Buffer.isBuffer(r.body));
 assert.deepEqual(r.body,pdf);
 assert.equal(called,1);
});
test('sem autenticacao ou fora da Preview bloqueia chamada ao servico',async()=>{
 env();let r=await invoke({piloto_mg_51109:true},{});
 assert.equal(r.statusCode,401);assert.equal(called,0);
 setEnv({VERCEL_ENV:'production'});
 r=await invoke();assert.equal(r.statusCode,403);assert.equal(called,0);
 env();r=await invoke({});assert.equal(r.statusCode,403);assert.equal(called,0);
});
test('PDF inválido ou retorno divergente não gera documento',async()=>{
 env();
 response=resposta(true).replace(pdf.toString('base64'),Buffer.from('invalid PDF content repeated '.repeat(7)).toString('base64'));
 let r=await invoke();
 assert.equal(r.statusCode,502);
 assert.equal(r.getHeader('content-type'),undefined);
 response=resposta(true).replace('>51109</ns1:documentoOrigem>','>51110</ns1:documentoOrigem>');
 r=await invoke();assert.equal(r.statusCode,409);
});
test('rota apenas consulta PDF de lote existente e nunca retransmite GNRE',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-pdf-homologacao-51109.js'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'../api/integracoes.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 assert.doesNotMatch(code,/executarRecepcao|montarPlanoRecepcao|reservar\(/);
 assert.match(code,/montarConsultaReciboComPdf/);
 assert.match(api,/gnre-pdf-homologacao-51109/);
 assert.match(ui,/async function solicitarPdfHomologacaoGnre51109/);
});
