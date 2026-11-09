'use strict';
// Simulacao do piloto PA/51076. ZERO comunicacao GNRE/Supabase real.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const utils=require('../lib/integracoes/_utils');
const {prepararPreEnvioPa,montarGuiaPa}=require('../lib/integracoes/gnre-preenvio-pa');
const {montarPlanoRecepcao}=require('../lib/integracoes/gnre-recepcao-executor');
const cnpj='12345678000195';
const chave='52'+'2611'+cnpj+'55'+'001'+'000051076'+'1'+'00062672'+'8';
const nfe={chave,numero:'51076',cnpjEmitente:cnpj,chaveProtocolo:chave,
 statusAutorizacao:'100',ambienteNfe:'1',consumidorFinal:'1',indIeDest:'9',
 ufDestino:'PA',ufOrigem:'GO',municipioEmitente:'5208707',cepEmitente:'74550470',
 enderecoEmitente:'Rua Ficticia, 100',razaoSocialEmitente:'Empresa Ficticia',
 valorDifal:'21.10',valorFcp:'0.00'};
const fiscal={vencimento:'2099-11-09',pagamento:'2099-11-09',convenio:'',
 vencimentoConfirmado:true,obrigacaoConfirmada:true,convenioConfirmado:false};
const plano=prepararPreEnvioPa({nfe,fiscal}).plano;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let exec=0,reserva=0,busca=0,cert=0,db=0;
let jaReservado=false,registros=[];
const handler=withModuleStubs({
 './gnre-recepcao-executor':{montarPlanoRecepcao,
   executarRecepcao:async args=>{
    exec++;assert.equal(args.permitirTransmissao,true);
    assert.equal(args.guias.length,1);
    assert.match(args.guias[0],/<documentoOrigem tipo="24">/);
    assert.match(args.guias[0],/<valor tipo="11">21\.10<\/valor>/);
    assert.doesNotMatch(args.guias[0],/<detalhamentoReceita>|<camposAdicionais>/);
    return {ok:true,estado:'concluido',codigo_gnre:'100',
     idempotency_key:montarPlanoRecepcao(args.guias).idempotency_key,
     recibo_mascarado:'••••••1234',categoria:'soap_recebido'};
   }},
 './gnre-idempotencia-repo':{
   buscar:async()=>{busca++;return jaReservado?{estado:'reservado'}:null;},
   reservar:async ({chave})=>{
    reserva++;assert.match(chave,/^gnre:trava-pa-51076:[a-f0-9]{32}$/);
    if(jaReservado)return {ok:false,existente:{estado:'reservado'}};
    jaReservado=true;return {ok:true};
   }},
 './gnre-certificado':{credenciais:async()=>{cert++;return {meta:{cnpj,expirado:false},
  pfx:Buffer.from('ficticio'),passphrase:'senha-ficticia'};}},
 './_utils':{...utils,supabaseRest:async(_table,opt)=>{
  db++;if(opt?.method==='POST')return [{chave_idempotencia:plano.lote_sha256}];
  return registros;
 }}
},()=>require('../lib/integracoes/gnre-piloto-pa-51076'));
const auth={'x-integrations-admin-key':'admin-ficticio'};
const body={nfe,fiscal,lote_sha256:plano.lote_sha256,
 confirmacao:'TRANSMITIR_HOMOLOGACAO_PA_51076',autorizacao_usuario:true};
function env(){
 setEnv({INTEGRATIONS_ADMIN_KEY:'admin-ficticio',VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',GNRE_AMBIENTE:'homologacao',
  GNRE_HOMOLOGACAO_EXECUTOR:'1',GNRE_PILOTO_PA_51076_ENVIO:'1',
  GNRE_PILOTO_PA_51076_CHAVE_SHA256:hash(chave),
  GNRE_PILOTO_PA_51076_LOTE_SHA256:plano.lote_sha256});
}
async function call(p=body,headers=auth){
 const res=fakeResponse();await handler(fakeRequest({method:'POST',headers,body:p}),res);return res;
}
preserveEnv();
test.beforeEach(()=>{resetEnv();exec=0;reserva=0;busca=0;db=0;cert=0;jaReservado=false;registros=[];});
test.after(()=>restoreEnv());
test('envio desabilitado por padrao, em producao ou sem hash autorizado',async()=>{
 env();setEnv({GNRE_PILOTO_PA_51076_ENVIO:'0'});
 assert.equal((await call()).statusCode,403);
 env();setEnv({VERCEL_ENV:'production'});
 assert.equal((await call()).statusCode,403);
 env();setEnv({GNRE_PILOTO_PA_51076_LOTE_SHA256:'0'.repeat(64)});
 assert.equal((await call()).statusCode,409);
 env();setEnv({GNRE_PILOTO_PA_51076_CHAVE_SHA256:''});
 assert.equal((await call()).statusCode,403);
 assert.equal(exec,0);assert.equal(reserva,0);
});
test('exige credencial de administrador e duas confirmacoes antes da reserva',async()=>{
 env();
 assert.equal((await call(body,{})).statusCode,401);
 assert.equal((await call({...body,autorizacao_usuario:false})).statusCode,400);
 assert.equal((await call({...body,confirmacao:''})).statusCode,400);
 assert.equal(exec,0);assert.equal(reserva,0);
});
test('impede nota, valor, chave e vencimento diferente da revisao aprovada',async()=>{
 env();
 for(const p of [
  {...body,nfe:{...nfe,numero:'51077'}},
  {...body,nfe:{...nfe,valorDifal:'21.11'}},
  {...body,nfe:{...nfe,chave:'0'.repeat(44)}},
  {...body,lote_sha256:'0'.repeat(64)},
  {...body,fiscal:{...fiscal,vencimento:'2099-11-10'}},
  {...body,fiscal:{...fiscal,obrigacaoConfirmada:false}}
 ]){
  const r=await call(p);
  assert.ok([400,403,409].includes(r.statusCode),'status '+r.statusCode);
 }
 assert.equal(exec,0);assert.equal(reserva,0);
});
test('reserva logica da NF-e antes de uma unica transmissao e bloqueia repeticao',async()=>{
 env();
 const r=await call();
 assert.equal(r.statusCode,200);
 assert.equal(r.body.estado,'concluido');
 assert.equal(r.body.codigo_gnre,'100');
 assert.equal(r.body.arquivamento,'recepcao_registrada');
 assert.equal(reserva,1);assert.equal(exec,1);
 assert.equal((await call()).statusCode,409);
 assert.equal(exec,1);assert.equal(reserva,1);
 assert.ok(!JSON.stringify(r.body).includes(cnpj));
});
test('consulta de status apenas le o bloqueio e nao transmite',async()=>{
 env();
 let r=await call({modo:'status'});
 assert.equal(r.statusCode,200);assert.equal(r.body.habilitado,true);
 assert.equal(r.body.transmissao,false);assert.equal(exec,0);assert.equal(reserva,0);assert.equal(cert,0);
 jaReservado=true;
 r=await call({modo:'status'});
 assert.equal(r.statusCode,200);assert.equal(r.body.bloqueado,true);
 assert.equal(r.body.habilitado,false);assert.equal(exec,0);
 env();setEnv({GNRE_PILOTO_PA_51076_ENVIO:'0'});
 r=await call({modo:'status'});
 assert.equal(r.statusCode,200);assert.equal(r.body.habilitado,false);
});
test('rotas e interface exigem habilitacao explicita e confirmacao de homologacao',()=>{
 const dir=path.join(__dirname,'..');
 const src=fs.readFileSync(path.join(dir,'lib/integracoes/gnre-piloto-pa-51076.js'),'utf8');
 const api=fs.readFileSync(path.join(dir,'api/integracoes.js'),'utf8');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const ui=fs.readFileSync(path.join(dir,'cotacoes.js'),'utf8');
 assert.match(api,/"gnre-piloto-pa-51076": gnrePilotoPa/);
 assert.match(html,/id="gnrePaBotaoTransmitir"[\s\S]*?disabled/);
 assert.match(ui,/async function consultarHabilitacaoGnrePa51076/);
 assert.match(ui,/async function transmitirGnrePilotoPa51076/);
 assert.match(src,/repo\.reservar\(\{chave:travaNfe\(\)/);
 assert.match(src,/GNRE_PILOTO_PA_51076_ENVIO/);
});
