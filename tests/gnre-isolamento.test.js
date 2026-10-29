const test=require('node:test');
const assert=require('node:assert/strict');
const {verificarIsolamento,HOMOLOGACAO}=require('../lib/integracoes/gnre-isolamento');
const env=()=>({GNRE_AMBIENTE:'homologacao',GNRE_BASE_URL:HOMOLOGACAO,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'cline-testes-integracoes'});
test('GNRE isolated preview passes read-only preflight',()=>{
 assert.deepEqual(verificarIsolamento(env()),{isolado:true,problemas:[],emissaoHabilitada:false});
});
test('GNRE preflight blocks production, wrong branch and inherited secrets',()=>{
 const wrong=[
  {VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {GNRE_AMBIENTE:'producao'},
  {GNRE_BASE_URL:'https://www.gnre.pe.gov.br/gnreWS/services'},
  {SUPABASE_SERVICE_ROLE_KEY:'dummy'},
  {SUPABASE_URL:'https://database.example'},
  {GNRE_CERT_PFX_BASE64:'dummy'},
  {GNRE_CERT_PASSWORD:'dummy'}
 ];
 for(const extra of wrong){
  const result=verificarIsolamento({...env(),...extra});
  assert.equal(result.isolado,false);
  assert.equal(result.emissaoHabilitada,false);
  assert.ok(result.problemas.length);
  assert.doesNotMatch(JSON.stringify(result),/dummy/);
 }
});
