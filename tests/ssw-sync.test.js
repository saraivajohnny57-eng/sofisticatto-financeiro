const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const handlerPath = require.resolve('../api/ssw-ocorrencias');
const utilsPath = require.resolve('../lib/integracoes/_utils');

function setup() {
  const original = require.cache[utilsPath];
  const calls = [];
  const records = {
    integracao_convites: [{id:'convite-1', transportadora_nome:'Transportadora Teste'}],
    frete_transportadoras: [{id:'transportadora-1', nome:'Transportadora Teste'}],
    ssw_ocorrencias_recebidas: [],
    logistica_rastreamentos: [],
    coleta_agendamentos: [{id:'agendamento-1',numero_nf:'123',transportadora_id:'transportadora-1',status:'aguardando_coleta'}],
    coleta_status_eventos: []
  };
  const supabaseRest = async (table, options={}) => {
    calls.push({table,...options});
    const data=records[table] || [];
    if (options.method === 'POST') {data.push(options.body);return [options.body];}
    if (options.method === 'PATCH') {return [{ok:true}];}
    if (table==='integracao_convites') return records.integracao_convites;
    if (table==='frete_transportadoras') return options.query?.includes('ilike.') ? records.frete_transportadoras : records.frete_transportadoras;
    if (table==='ssw_ocorrencias_recebidas') return data.filter(x=>options.query?.includes(x.hash_evento));
    if (table==='coleta_agendamentos') return data.filter(x=>options.query?.includes('numero_nf=eq.'+x.numero_nf));
    return [];
  };
  require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{supabaseRest}};
  delete require.cache[handlerPath];
  const handler=require(handlerPath);
  return {handler,calls,records,restore(){delete require.cache[handlerPath];if(original)require.cache[utilsPath]=original;else delete require.cache[utilsPath];}};
}
function response(){
  return {statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};
}
function req(token,descricao,method='POST'){
  return {method,headers:token?{authorization:'Bearer '+token}:{},query:{convite_id:'convite-1'},body:{nf:{numeroNFe:'123'},cte:{numeroCTe:'456'},ocorrencia:{codigo:'10',descricao,dataHoraEvento:'2026-10-28T12:00:00Z'}}};
}
test('SSW rejects missing and invalid bearer without querying database',async()=>{
 const prior=process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;
 const secret=crypto.randomBytes(32).toString('hex');
 process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;
 const s=setup();
 try{
   for(const token of [null,'wrong']){const res=response();await s.handler(req(token,'Chegada na filial'),res);assert.equal(res.statusCode,401);}
   assert.equal(s.calls.length,0);
 }finally{s.restore();if(prior===undefined)delete process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;else process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=prior;}
});
test('SSW sync: authorized filial event does not mark collection completed; duplicate ignored',async()=>{
 const prior=process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;
 const secret=crypto.randomBytes(32).toString('hex');process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;
 const s=setup();
 try{
   const first=response();await s.handler(req(secret,'Chegada na filial'),first);
   assert.equal(first.statusCode,200);
   assert.equal(first.body.resultados[0].processado,true);
   assert.equal(s.calls.filter(x=>x.table==='coleta_agendamentos'&&x.method==='PATCH').length,0);
   assert.equal(s.records.ssw_ocorrencias_recebidas.length,1);
   const second=response();await s.handler(req(secret,'Chegada na filial'),second);
   assert.equal(second.body.resultados[0].duplicado,true);
   assert.equal(s.records.ssw_ocorrencias_recebidas.length,1);
 }finally{s.restore();if(prior===undefined)delete process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;else process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=prior;}
});
test('SSW sync: explicit collected event updates matching scheduled collection',async()=>{
 const prior=process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;
 const secret=crypto.randomBytes(32).toString('hex');process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;
 const s=setup();
 try{
   const res=response();await s.handler(req(secret,'Coleta realizada'),res);
   assert.equal(res.statusCode,200);
   assert.equal(s.calls.filter(x=>x.table==='coleta_agendamentos'&&x.method==='PATCH').length,1);
   assert.equal(s.calls.filter(x=>x.table==='coleta_status_eventos'&&x.method==='POST').length,1);
 }finally{s.restore();if(prior===undefined)delete process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;else process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=prior;}
});
