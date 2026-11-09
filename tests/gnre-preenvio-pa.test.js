'use strict';
// Testes offline do pre-envio PA 100102. Nenhuma chamada externa ou dado fiscal real.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const utils=require('../lib/integracoes/_utils');
const {prepararPreEnvioPa,montarGuiaPa}=require('../lib/integracoes/gnre-preenvio-pa');
const {montarLoteGnre}=require('../lib/integracoes/gnre-lote-xml');
const cnpj='12345678000195';
const chave='52'+'2611'+cnpj+'55'+'001'+'000051076'+'1'+'00062672'+'8';
const nfe={
 chave,numero:'51076',cnpjEmitente:cnpj,chaveProtocolo:chave,
 statusAutorizacao:'100',ambienteNfe:'1',consumidorFinal:'1',indIeDest:'9',
 ufDestino:'PA',ufOrigem:'GO',municipioEmitente:'5208707',cepEmitente:'74550470',
 enderecoEmitente:'Rua Ficticia, 100',razaoSocialEmitente:'Empresa de Teste',
 valorDifal:'21.10',valorFcp:'0.00'
};
const fiscal={vencimento:'2099-11-09',pagamento:'2099-11-09',convenio:'',
 vencimentoConfirmado:true,convenioConfirmado:false,obrigacaoConfirmada:true};
test('PA GO->PA DIFAL 21,10: plano offline usa chave de acesso tipo 24',()=>{
 const p=prepararPreEnvioPa({nfe,fiscal});
 assert.equal(p.ok,true);
 assert.equal(p.apto_para_revisao,true);
 assert.equal(p.resumo.receita,'100102');
 assert.equal(p.resumo.tipo_documento,'24');
 assert.equal(p.resumo.valor_difal,'21.10');
 assert.equal(p.resumo.valor_fcp_nfe,'0.00');
 assert.equal(p.plano.guia_quantidade,1);
 assert.match(p.plano.lote_sha256,/^[a-f0-9]{64}$/);
 assert.equal(p.transmissao,false);
 assert.equal(p.plano.transmissao_habilitada,false);
 assert.doesNotMatch(JSON.stringify(p),new RegExp(cnpj));
 assert.doesNotMatch(JSON.stringify(p),new RegExp(chave));
});
test('XML PA tipo 24 tem chave DFe, sem convenio, detalhamento 0303 ou FCP artificial',()=>{
 const xml=montarGuiaPa(nfe,fiscal);
 assert.ok(xml.includes('<ufFavorecida>PA</ufFavorecida>'));
 assert.ok(xml.includes('<receita>100102</receita>'));
 assert.ok(xml.includes('<documentoOrigem tipo="24">'+chave+'</documentoOrigem>'));
 assert.ok(xml.includes('<valor tipo="11">21.10</valor>'));
 assert.doesNotMatch(xml,/<detalhamentoReceita>|<camposAdicionais>|<convenio>|<valor tipo="12">/);
 assert.equal(montarLoteGnre([xml]).match(/<TDadosGNRE /g).length,1);
});
test('nao aceita nota incompatível, protocolo não autorizado ou adulteração',()=>{
 for(const patch of [
  {ufDestino:'MG'},{ufOrigem:'SP'},{valorDifal:'0.00'},
  {consumidorFinal:'0'},{indIeDest:'1'},
  {statusAutorizacao:'101'},{ambienteNfe:'2'},
  {chaveProtocolo:'0'.repeat(44)},{numero:'51077'},
  {cnpjEmitente:'00000000000000'},{valorFcp:'xxx'},
 ])assert.throws(()=>prepararPreEnvioPa({nfe:{...nfe,...patch},fiscal}));
});
test('sem obrigação fiscal, vencimento ou com FCP positivo bloqueia plano',()=>{
 for(const patch of [
  {vencimentoConfirmado:false},{obrigacaoConfirmada:false},
  {vencimento:'2020-01-01'},{pagamento:'2020-01-01'},
  {vencimento:'2099-02-30'},{convenio:'ABC',convenioConfirmado:false}
 ]){
  const p=prepararPreEnvioPa({nfe,fiscal:{...fiscal,...patch}});
  assert.equal(p.apto_para_revisao,false);
  assert.ok(p.pendencias.length);
  assert.equal(p.plano,undefined);
 }
 const fcp=prepararPreEnvioPa({nfe:{...nfe,valorFcp:'1.00'},fiscal});
 assert.equal(fcp.apto_para_revisao,false);
 assert.match(fcp.pendencias.join(' '),/FCP/);
});
let cached=false,rows=[],calls=0;
const handler=withModuleStubs({
 './gnre-idempotencia-repo':{buscar:async()=>cached?{estado:'recebido'}:null},
 './gnre-certificado':{credenciais:async()=>({meta:{cnpj,expirado:false}})},
 './_utils':{...utils,supabaseRest:async()=>{calls++;return rows;}}
},()=>require('../lib/integracoes/gnre-preenvio-pa-rota'));
const auth={'x-integrations-admin-key':'admin-ficticio'};
function env(){
 setEnv({INTEGRATIONS_ADMIN_KEY:'admin-ficticio',VERCEL_ENV:'preview',
 GNRE_AMBIENTE:'homologacao',VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',
 GNRE_HOMOLOGACAO_EXECUTOR:'1'});
}
async function request(h=auth){
 const res=fakeResponse();
 await handler(fakeRequest({method:'POST',headers:h,body:{nfe,fiscal}}),res);
 return res;
}
preserveEnv();
test.beforeEach(()=>{resetEnv();cached=false;rows=[];calls=0;});
test.after(()=>restoreEnv());
test('preflight PA confirma A1 da preview e duplicidade, mas nao faz emissao',async()=>{
 env();
 const r=await request();
 assert.equal(r.statusCode,200);
 assert.equal(r.body.apto_para_revisao,true);
 assert.equal(r.body.certificado_verificado,true);
 assert.equal(r.body.duplicidade_verificada,true);
 assert.equal(r.body.checagens_executadas,true);
 assert.equal(r.body.transmissao,false);
 assert.equal(calls,1);
});
test('pendencia fiscal nao executa verificacao de certificado nem duplicidade e informa motivo',async()=>{
 env();
 const res=fakeResponse();
 await handler(fakeRequest({method:'POST',headers:auth,body:{nfe,
  fiscal:{...fiscal,obrigacaoConfirmada:false}}}),res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.apto_para_revisao,false);
 assert.equal(res.body.checagens_executadas,false);
 assert.equal(res.body.certificado_verificado,null);
 assert.equal(res.body.duplicidade_verificada,null);
 assert.equal(calls,0);
 assert.match(res.body.pendencias.join(' '),/obrigacao de DIFAL/);
});
test('preflight bloqueia duplicidade, falta de admin e producao',async()=>{
 env();rows=[{ambiente:'producao',situacao:'registrada'}];
 let r=await request();assert.equal(r.body.apto_para_revisao,false);
 assert.match(r.body.pendencias.join(' '),/Ja existe guia/);
 cached=true;rows=[];r=await request();assert.equal(r.body.apto_para_revisao,false);
 r=await request({});assert.equal(r.statusCode,401);
 setEnv({VERCEL_ENV:'production'});
 r=await request();assert.equal(r.statusCode,403);
});
const hasSchema=spawnSync('python3',['-c','import xmlschema'],{encoding:'utf8'}).status===0;
test('lote PA com tipo 24 e chave de 44 digitos passa XSD oficial 2.00',
 {skip:hasSchema?false:'Dependencia python xmlschema indisponivel'},()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-pa-xsd-'));
 try{
  const xml=montarLoteGnre([montarGuiaPa(nfe,fiscal)]);
  const file=path.join(folder,'pa.xml');fs.writeFileSync(file,xml);
  const p=spawnSync('python3',[path.join(__dirname,'../scripts/gnre-validar-xsd.py'),
   '--schema',path.join(__dirname,'../docs/gnre-xsd/lote_gnre_v2.00.xsd'),'--xml',file],
   {encoding:'utf8'});
  assert.equal(p.status,0,JSON.stringify({out:p.stdout,err:p.stderr}).slice(0,2200));
  assert.equal(JSON.parse(p.stdout).ok,true);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('aviso fiscal PA identifica data da NF-e e impede presumir vencimento do teste',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(js,/dataEmissao:val\(ide,'dhEmi'\)/);
 assert.match(js,/dataSaida:val\(ide,'dhSaiEnt'\)/);
 assert.match(js,/vencimento do DIFAL no Pará depende de inscrição estadual/);
 assert.match(html,/A data 09\/11\/2026 usada no piloto NÃO foi confirmada/);
});
test('rota PA é read-only e a UI nunca chama recepcao diretamente',()=>{
 const route=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-preenvio-pa-rota.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'../api/integracoes.js'),'utf8');
 assert.doesNotMatch(route,/executarRecepcao|enviarSoap|permitirTransmissao:true/);
 assert.match(route,/transmissao:false/);
 assert.match(ui,/async function verificarPreenvioPa100102/);
 assert.match(api,/"gnre-preenvio-pa": gnrePreenvioPa/);
});
