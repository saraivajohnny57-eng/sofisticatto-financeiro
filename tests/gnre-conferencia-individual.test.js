'use strict';
// Reconciliação offline do piloto MG/100102, sem credenciais nem chamadas fiscais.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {conferirResultadoIndividual,centavos}=require('../lib/integracoes/gnre-conferencia-individual');
const ref={
 chave_nfe:'5'.repeat(44),numero_nfe:'51109',receita:'100102',uf_favorecida:'MG',
 valor_principal:'19.01',ambiente:'homologacao',situacao:'recebida'
};
const guia={situacao:'0',documento_origem:'51109',receita:'100102',
 uf:'MG',valor:'19.01',numero_controle:null,linha_digitavel:null,codigo_barras:null,pdf_base64:null};
const fiscal={
 ok:true,codigo:'402',guia_confirmada:true,guias:[guia],
 diagnostico:{pdf_guias_presente:false}
};
test('conciliacao GNRE individual processada identifica dados iguais sem pagamento ou PDF',()=>{
 const r=conferirResultadoIndividual(fiscal,ref);
 assert.equal(r.confirmado,true);
 assert.equal(r.conferencia,'compativel_com_registro');
 assert.equal(r.documento_valido_para_pagamento,false);
 assert.equal(r.resumo.numero_nfe,'51109');
 assert.equal(r.resumo.possui_pdf_individual,false);
 assert.equal(r.resumo.possui_numero_guia,false);
 assert.doesNotMatch(JSON.stringify(r),new RegExp('5{44}'));
});
test('campos essenciais divergentes rejeitam comprovacao individual',()=>{
 const casos=[
  {r:{...ref,receita:'100129'},g:guia},
  {r:{...ref,uf_favorecida:'GO'},g:guia},
  {r:{...ref,valor_principal:'20.00'},g:guia},
  {r:ref,g:{...guia,documento_origem:'51110'}},
  {r:ref,g:{...guia,documento_origem:null}},
  {r:ref,g:{...guia,situacao:'2'}},
  {r:{...ref,ambiente:'producao'},g:guia},
  {r:{...ref,situacao:'rejeitada'},g:guia},
  {r:null,g:guia}
 ];
 for(const x of casos){
  const result=conferirResultadoIndividual({...fiscal,guias:[x.g]},x.r);
  assert.equal(result.confirmado,false,JSON.stringify(x));
  assert.ok(result.pendencias.length);
 }
});
test('processamento 402 sozinho nao confirma uma guia; nem retorno com duas guias',()=>{
 for(const f of [
  {...fiscal,guias:[],guia_confirmada:false},
  {...fiscal,guias:[guia,guia]},
  {...fiscal,codigo:'401'},
  {...fiscal,ok:false},
  {...fiscal,guia_confirmada:false},
 ]){
  assert.equal(conferirResultadoIndividual(f,ref).confirmado,false);
 }
});
test('comparação monetária preserva centavos e rejeita frações inválidas',()=>{
 assert.equal(centavos('19.01'),1901n);
 assert.equal(centavos('19.0100'),1901n);
 assert.equal(centavos('19.0101'),null);
 assert.equal(centavos('19,01'),null);
 assert.equal(centavos('abc'),null);
});
test('endpoint usa somente consulta e lê NF-e pelo registro já arquivado, sem reenvio',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-consulta-lote.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 assert.match(src,/conferirResultadoIndividual\(fiscal,Array\.isArray\(registro\)/);
 assert.match(src,/supabaseRest\('gnre_guias_arquivo'/);
 assert.doesNotMatch(src,/executarRecepcao|arquivarGuiaOficial/);
 assert.match(html,/Conferência com a NF-e arquivada/);
});
