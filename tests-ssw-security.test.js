'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const secret='a'.repeat(48);
const path=require('node:path');
const handlerPath=path.join(__dirname,'api/ssw-ocorrencias.js');
const utilsPath=require.resolve('./lib/integracoes/_utils');
function makeHandler(db){
 const old= require.cache[utilsPath];
 require.cache[utilsPath]={id:utilsPath,filename:utilsPath,loaded:true,exports:{supabaseRest:db}};
 delete require.cache[handlerPath];
 const fn=require(handlerPath);
 if(old)require.cache[utilsPath]=old;else delete require.cache[utilsPath];
 return fn;
}
function res(){return {statusCode:200,payload:null,status(n){this.statusCode=n;return this},json(v){this.payload=v;return this}}}
const request=(body={},auth)=>({method:'POST',query:{convite_id:'known'},headers:auth?{authorization:`Bearer ${auth}`}:{},body});
const db=async(table,opts={})=>{
 if(table==='integracao_convites')return [{id:'known',transportadora_nome:'Demo'}];
 if(table==='frete_transportadoras')return [{id:'11111111-1111-1111-1111-111111111111',nome:'Demo'}];
 return [];
};
test('sem token configurado falha fechado',async()=>{delete process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN;const r=res();await makeHandler(db)(request(),r);assert.equal(r.statusCode,401)});
test('token ausente ou incorreto rejeitado antes de consultar banco',async()=>{process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;let calls=0;const fn=makeHandler(async()=>{calls++;return []});for(const token of [undefined,'incorreto']){const r=res();await fn(request({},token),r);assert.equal(r.statusCode,401)}assert.equal(calls,0)});
test('token autorizado aceita e grava ocorrência uma vez',async()=>{process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;const writes=[];const fn=makeHandler(async(t,o={})=>{if(o.method)writes.push([t,o]);return db(t,o)});const r=res();await fn(request({nf:{numeroNFe:'123'},ocorrencia:{descricao:'Coleta realizada',dataHoraEvento:'2026-10-27T12:00:00Z'}},secret),r);assert.equal(r.statusCode,200);assert.ok(writes.some(([t])=>t==='ssw_ocorrencias_recebidas'));assert.ok(writes.some(([t])=>t==='logistica_rastreamentos'))});
test('sincronização de evento não relacionado à coleta não altera coleta',async()=>{process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;const writes=[];const fn=makeHandler(async(t,o={})=>{if(t==='coleta_agendamentos'&&!o.method)return [{id:'ag1',status:'aguardando_coleta'}];if(o.method)writes.push([t,o]);return db(t,o)});const r=res();await fn(request({nf:{numeroNFe:'123'},ocorrencia:{descricao:'Chegada na filial'}},secret),r);assert.equal(r.statusCode,200);assert.ok(!writes.some(([t])=>t==='coleta_agendamentos'))});
test('evento de coleta comprovado atualiza coleta',async()=>{process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;const writes=[];const fn=makeHandler(async(t,o={})=>{if(t==='coleta_agendamentos'&&!o.method)return [{id:'ag1',status:'aguardando_coleta'}];if(o.method)writes.push([t,o]);return db(t,o)});const r=res();await fn(request({nf:{numeroNFe:'123'},ocorrencia:{descricao:'Coleta realizada'}},secret),r);assert.equal(r.statusCode,200);assert.ok(writes.some(([t])=>t==='coleta_agendamentos'))});
test('erro interno não vaza detalhes',async()=>{process.env.SSW_OCORRENCIAS_WEBHOOK_TOKEN=secret;const fn=makeHandler(async()=>{throw Error('senha secreta do banco')});const r=res();const old=console.error;console.error=()=>{};try{await fn(request({},secret),r)}finally{console.error=old}assert.equal(r.statusCode,500);assert.doesNotMatch(JSON.stringify(r.payload),/senha secreta/)});
