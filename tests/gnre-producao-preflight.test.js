'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {prepararPlanoProducao,SERVICOS_PRODUCAO}=require('../lib/integracoes/gnre-producao-plano');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const utils=require('../lib/integracoes/_utils');
const cnpj='12345678000195';
const chave='52'+'9911'+cnpj+'55'+'001'+'000005109'+'1'+'00062672'+'8';
const nfe={chave,numero:'5109',cnpjEmitente:cnpj,chaveProtocolo:chave,
 statusAutorizacao:'100',ambienteNfe:'1',consumidorFinal:'1',indIeDest:'9',
 ufDestino:'MG',ufOrigem:'GO',municipioEmitente:'5208707',cepEmitente:'74550470',
 enderecoEmitente:'Rua Ficticia 100',razaoSocialEmitente:'Empresa Ficticia',
 valorDifal:'19.01',valorFcp:'0.00'};
const fiscal={vencimento:'2099-11-09',pagamento:'2099-11-09',convenio:'',
 vencimentoConfirmado:true,convenioConfirmado:false,obrigacaoConfirmada:true};
test('plano de producao usa exclusivamente endpoint oficial, nao envia',()=>{
 const p=prepararPlanoProducao({nfe,fiscal});
 assert.equal(p.apto_para_revisao,true);
 assert.equal(p.transmissao,false);
 assert.equal(p.ambiente,'producao');
 assert.equal(p.plano.guias,1);
 assert.match(p.plano.destino,/^https:\/\/www\.gnre\.pe\.gov\.br\/gnreWS\/services\/GnreLoteRecepcao$/);
 assert.match(p.plano.idempotency_key,/^gnre:producao:[a-f0-9]{32}$/);
 assert.notEqual(p.plano.destino,'https://www.testegnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao');
 assert.equal(SERVICOS_PRODUCAO.resultado,'https://www.gnre.pe.gov.br/gnreWS/services/GnreResultadoLote');
 assert.doesNotMatch(JSON.stringify(p),/TDadosGNRE|CNPJ|12345678000195/);
});
test('nota 51109 do piloto, datas vencidas e obrigacao fiscal nao confirmada bloqueiam pre-producao',()=>{
 for(const [nf,fi] of [
  [{...nfe,numero:'51109',chave:chave.slice(0,25)+'000051109'+chave.slice(34)},fiscal],
  [nfe,{...fiscal,pagamento:'2020-01-01'}],
  [nfe,{...fiscal,vencimento:'2020-01-01'}],
  [nfe,{...fiscal,obrigacaoConfirmada:false}],
 ]) {
  const r=prepararPlanoProducao({nfe:nf,fiscal:fi});
  assert.equal(r.apto_para_revisao,false);
  assert.equal(r.transmissao,false);
  assert.ok(r.pendencias.length>0);
 }
});
let existing=[],calls=0;
const preflight=withModuleStubs({
 './gnre-certificado':{credenciais:async()=>({meta:{cnpj,expirado:false}})},
 './_utils':{...utils,supabaseRest:async(_table,_opt)=>{calls++;return existing;}}
},()=>require('../lib/integracoes/gnre-producao-preflight'));
const auth={'x-integrations-admin-key':'admin-ficticio'};
preserveEnv();test.beforeEach(()=>{resetEnv();existing=[];calls=0;
 setEnv({INTEGRATIONS_ADMIN_KEY:'admin-ficticio',VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',GNRE_PRODUCAO_HABILITACAO_CONFIRMADA:'0'});
});
test.after(()=>restoreEnv());
async function req(body={nfe,fiscal},headers=auth){
 const res=fakeResponse();
 await preflight(fakeRequest({method:'POST',headers,body}),res);
 return res;
}
test('preflight de producao nao permite emissao nem com certificado compativel',async()=>{
 const r=await req();assert.equal(r.statusCode,200);
 assert.equal(r.body.transmissao,false);
 assert.equal(r.body.pronto_para_transmitir,false);
 assert.equal(r.body.certificado_compativel,true);
 assert.equal(r.body.apto_para_revisao,false);
 assert.ok(r.body.pendencias.some(x=>/Habilitacao/.test(x)));
 assert.equal(calls,1);
});
test('bloqueia registro existente, sem autenticacao e ambiente errado',async()=>{
 existing=[{situacao:'recebida'}];
 const r=await req();assert.equal(r.statusCode,200);
 assert.equal(r.body.possui_duplicata,true);
 assert.equal(r.body.pronto_para_transmitir,false);
 assert.ok(r.body.pendencias.some(x=>/guia\/tentativa/.test(x)));
 const denied=await req({nfe,fiscal},{});
 assert.equal(denied.statusCode,401);
 setEnv({VERCEL_ENV:'production'});
 const wrong=await req();assert.equal(wrong.statusCode,403);
});
test('nenhum caminho de pre-producao executa SOAP ou permite emissao',()=>{
 const base=path.join(__dirname,'..');
 const files=['lib/integracoes/gnre-producao-plano.js',
  'lib/integracoes/gnre-producao-preflight.js'].map(f=>fs.readFileSync(path.join(base,f),'utf8'));
 for(const file of files)assert.doesNotMatch(file,/executarRecepcao|enviarSoap|permitirTransmissao:true/);
 const api=fs.readFileSync(path.join(base,'api/integracoes.js'),'utf8');
 const ui=fs.readFileSync(path.join(base,'cotacoes.js'),'utf8');
 assert.match(api,/"gnre-producao-preflight": gnreProducaoPreflight/);
 assert.match(ui,/async function verificarGnrePreProducaoMg/);
 assert.match(ui,/Nenhuma GNRE de produção foi emitida/);
});
