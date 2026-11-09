'use strict';
// Piloto simulado: nenhuma chamada a GNRE, Supabase ou certificado real.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const {prepararPreEnvio}=require('../lib/integracoes/gnre-preenvio-mg');
const {montarPlanoRecepcao}=require('../lib/integracoes/gnre-recepcao-executor');
const utils=require('../lib/integracoes/_utils');
const cnpj='12345678000195';
const chave='52'+'2611'+cnpj+'55'+'001'+'000051109'+'1'+'00062672'+'8';
const nfe={chave,numero:'51109',cnpjEmitente:cnpj,chaveProtocolo:chave,
 statusAutorizacao:'100',ambienteNfe:'1',consumidorFinal:'1',indIeDest:'9',
 ufDestino:'MG',ufOrigem:'GO',municipioEmitente:'5208707',cepEmitente:'74550470',
 enderecoEmitente:'Rua Teste, 100',razaoSocialEmitente:'Empresa Ficticia',
 valorDifal:'19.01',valorFcp:'0.00'};
const fiscal={vencimento:'2026-11-09',pagamento:'2026-11-09',convenio:'',
 vencimentoConfirmado:true,convenioConfirmado:false,obrigacaoConfirmada:true};
const plano=prepararPreEnvio({nfe,fiscal}).plano;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
let execCalls=0, certCalls=0,dbCalls=0;
const handler=withModuleStubs({
 './gnre-recepcao-executor':{
  montarPlanoRecepcao,
  executarRecepcao:async args=>{
   execCalls++;
   assert.equal(args.guias.length,1);
   assert.match(args.guias[0],/<receita>100102<\/receita>/);
   assert.doesNotMatch(args.guias[0],/<convenio>/);
   return {ok:true,estado:'concluido',codigo_gnre:'100',recibo_mascarado:'••••••7890',
    idempotency_key:plano.idempotency_key,categoria:'soap_recebido',
    validacao_fiscal:'nao_realizada'};
  }
 },
 './gnre-certificado':{credenciais:async()=>{
  certCalls++;return {pfx:Buffer.from('teste'),passphrase:'ficticio',
    meta:{expirado:false,cnpj}};
 }},
 './gnre-idempotencia-repo':{buscar:async()=>null},
 './_utils':{...utils,supabaseRest:async (_table,opt)=>{
  dbCalls++;
  if(opt?.method==='POST')return [{chave_idempotencia:plano.idempotency_key}];
  return [];
 }}
},()=>require('../lib/integracoes/gnre-piloto-mg'));
const auth={'x-integrations-admin-key':'admin-ficticio'};
const body={nfe,fiscal,lote_sha256:plano.lote_sha256,
 confirmacao:'TRANSMITIR_HOMOLOGACAO_51109',autorizacao_usuario:true};
function env(){
 setEnv({
  INTEGRATIONS_ADMIN_KEY:'admin-ficticio',VERCEL_ENV:'preview',
  GNRE_AMBIENTE:'homologacao',VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',
  GNRE_HOMOLOGACAO_EXECUTOR:'1',GNRE_PILOTO_MG_51109_ENVIO:'1',
  GNRE_PILOTO_51109_CHAVE_SHA256:sha(chave),GNRE_PILOTO_51109_LOTE_SHA256:plano.lote_sha256
 });
}
async function call(data=body,headers=auth){
 const response=fakeResponse();
 await handler(fakeRequest({method:'POST',headers,body:data}),response);
 return response;
}
preserveEnv();test.beforeEach(()=>{resetEnv();execCalls=0;certCalls=0;dbCalls=0;});test.after(()=>restoreEnv());
test('desabilitado fora da preview ou sem a flag especifica',async()=>{
 env();setEnv({VERCEL_ENV:'production'});
 assert.equal((await call()).statusCode,403);
 env();setEnv({GNRE_PILOTO_MG_51109_ENVIO:'0'});
 assert.equal((await call()).statusCode,403);
 assert.equal(execCalls,0);
});
test('exige administrador e consentimento manual explicito',async()=>{
 env();assert.equal((await call(body,{})).statusCode,401);
 assert.equal((await call({...body,confirmacao:''})).statusCode,400);
 assert.equal((await call({...body,autorizacao_usuario:false})).statusCode,400);
 assert.equal(execCalls,0);
});
test('rejeita nota, valor, hash ou alteracao apos conferencia',async()=>{
 env();
 for(const p of [
  {...body,nfe:{...nfe,numero:'51110'}},
  {...body,nfe:{...nfe,valorDifal:'18.01'}},
  {...body,lote_sha256:'0'.repeat(64)},
  {...body,fiscal:{...fiscal,pagamento:'2026-11-10'}},
  {...body,nfe:{...nfe,chave:'0'.repeat(44)}},
 ]){
  const r=await call(p);
  assert.ok([400,403,409].includes(r.statusCode));
 }
 assert.equal(execCalls,0);assert.equal(certCalls,0);
});
test('simula uma unica transmissao depois de todas as verificacoes',async()=>{
 env();
 const r=await call();
 assert.equal(r.statusCode,200);
 assert.equal(r.body.codigo_gnre,'100');
 assert.equal(r.body.estado,'concluido');
 assert.equal(r.body.arquivamento,'recepcao_registrada');
 assert.equal(execCalls,1);
 assert.equal(certCalls,1);
 assert.ok(dbCalls>=2);
 assert.ok(!JSON.stringify(r.body).includes(cnpj));
});
test('status e somente leitura, sem chamar servico GNRE',async()=>{
 env();
 const r=await call({modo:'status'});
 assert.equal(r.statusCode,200);
 assert.equal(r.body.habilitado,true);
 assert.equal(r.body.transmissao,false);
 assert.equal(execCalls,0);assert.equal(certCalls,0);assert.equal(dbCalls,0);
});
