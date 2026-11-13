'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chamarSoap,erroPaginaIndisponivelSSW}=require('../lib/integracoes/cotar-ssw')._teste;

const payload={
 dominio:'TESTE',login:'usuario_ficticio',senha:'senha_ficticia',
 cnpjPagador:'00000000000000',cnpjRemetente:'00000000000000',cnpjDestinatario:'11111111111111',
 cepOrigem:74550470,cepDestino:35010260,valorNF:741.60,quantidade:3,
 peso:42,volume:0.11,mercadoria:1,ciffob:'C',coletar:'S',entDificil:'N',
 destContribuinte:'N',qtdePares:1,altura:0.35,comprimento:0.38,largura:0.29,fatorMultiplicador:3
};
const paginaSSW='<html><head><title>SSW Sistemas</title></head><body><h1>502</h1><p>Oops! Algo deu errado.</p></body></html>';
function http(status,body){return {ok:status>=200&&status<300,status,async text(){return body}}}
const retornoOK='<soapenv:Envelope><soapenv:Body><cotarResponse><return>&lt;cotacao&gt;&lt;erro&gt;0&lt;/erro&gt;&lt;totalFrete&gt;123.45&lt;/totalFrete&gt;&lt;prazo&gt;3&lt;/prazo&gt;&lt;/cotacao&gt;</return></cotarResponse></soapenv:Body></soapenv:Envelope>';

test('identifica indisponibilidade somente quando o HTML pertence ao provedor SSW',()=>{
 assert.equal(erroPaginaIndisponivelSSW({httpStatus:502,resposta:paginaSSW}),true);
 assert.equal(erroPaginaIndisponivelSSW({httpStatus:503,resposta:paginaSSW}),true);
 assert.equal(erroPaginaIndisponivelSSW({httpStatus:400,resposta:paginaSSW}),false);
 assert.equal(erroPaginaIndisponivelSSW({httpStatus:502,resposta:'<Fault>Erro de tabela</Fault>'}),false);
});

test('CIF com SSW 502 tenta apenas um SOAP por endpoint e devolve erro de provedor sem HTML',async()=>{
 const antigo=global.fetch,solicitacoes=[];
 global.fetch=async url=>{solicitacoes.push(url);return http(502,paginaSSW)};
 try{
   await assert.rejects(chamarSoap({...payload}),e=>{
     assert.equal(e.httpStatus,503);
     assert.equal(e.codigo,'SSW_PROVEDOR_INDISPONIVEL');
     assert.match(e.message,/SSW Sistemas/);
     assert.match(e.message,/cotação manual/);
     assert.equal(JSON.parse(e.resposta).tentativas_realizadas,2);
     assert.ok(!String(e.resposta).includes('<html'));
     assert.ok(!String(e.resposta).includes(payload.senha));
     return true;
   });
   assert.equal(solicitacoes.length,2);
   assert.match(solicitacoes[0],/sswCotacaoColeta/);
   assert.match(solicitacoes[1],/sswCotacao\/index.php/);
 }finally{global.fetch=antigo}
});

test('FOB em indisponibilidade de origem evita fallback legado que trocaria pagador',async()=>{
 const antigo=global.fetch,solicitacoes=[];
 global.fetch=async url=>{solicitacoes.push(url);return http(502,paginaSSW)};
 try{
   await assert.rejects(chamarSoap({...payload,ciffob:'F'}),e=>{
     assert.equal(e.codigo,'SSW_PROVEDOR_INDISPONIVEL');
     assert.equal(JSON.parse(e.resposta).tipo,'FOB');
     return true;
   });
   assert.equal(solicitacoes.length,1);
 }finally{global.fetch=antigo}
});

test('CIF continua aceitando fallback legado se ele devolver cotação válida',async()=>{
 const antigo=global.fetch,solicitacoes=[];
 global.fetch=async url=>{solicitacoes.push(url);return url.includes('sswCotacaoColeta')?http(502,paginaSSW):http(200,retornoOK)};
 try{
   const r=await chamarSoap({...payload});
   assert.equal(r.valor,123.45);
   assert.equal(r.prazo,3);
   assert.equal(solicitacoes.length,2);
 }finally{global.fetch=antigo}
});

test('falha SOAP de negocio não é convertida em indisponibilidade 502 do provedor',async()=>{
 const antigo=global.fetch,solicitacoes=[];
 global.fetch=async url=>{solicitacoes.push(url);return http(200,'<soap:Envelope><soap:Body><faultstring>Tabela de frete recusada</faultstring></soap:Body></soap:Envelope>')};
 try{
   await assert.rejects(chamarSoap({...payload}),e=>{
     assert.notEqual(e.codigo,'SSW_PROVEDOR_INDISPONIVEL');
     assert.match(e.message,/Tabela de frete/);
     return true;
   });
   assert.equal(solicitacoes.length,5);
 }finally{global.fetch=antigo}
});
