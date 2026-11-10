'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepararDuasGuias,conferirNfe}=require('../lib/integracoes/gnre-duas-guias-nova');
function chave(){
 const b='5226110545198500019555001000051076100000001';
 assert.equal(b.length,43);
 const pesos=[2,3,4,5,6,7,8,9];
 const soma=[...b].reduce((s,_,i)=>s+Number(b[42-i])*pesos[i%8],0);
 const r=soma%11;return b+(r<2?0:11-r);
}
const FLAGS={emitente:'O',destinatario:'N',documento_origem:'O',
 detalhamento:'N',produto:'N',periodo_referencia:'N',
 vencimento:'O',pagamento:'O',convenio:'S',campos_adicionais:'N',valor_fcp:'N'};
const perfil=(cod,docs=['24'])=>({ok:true,uf:'PA',receita:cod,exigencias:{...FLAGS},
 documentos:docs.map(codigo=>({codigo,descricao:'Chave DF-e'})),pendencias:[]});
function base(){
 const nfe={chave:chave(),numero:'51076',cnpjEmitente:'05451985000195',
  ufDestino:'PA',ufOrigem:'GO',razaoSocialEmitente:'Sofisticatto',
  municipioEmitente:'5208707',cepEmitente:'74550470',
  enderecoEmitente:'Rua 4, 217',statusAutorizacao:'100',
  chaveProtocolo:chave(),ambienteNfe:'1',difal:'28.73',fcp:'8.21'};
 return {nfe,fiscal:{vencimento:'2026-11-20',pagamento:'2026-11-20'},
  novaOperacao:true,perfis:{100102:perfil('100102'),100129:perfil('100129')}};
}
test('gera dois XMLs independentes, 100102 valor 11 e 100129 valor 12',()=>{
 const p=prepararDuasGuias(base());
 assert.equal(p.guias.length,2);
 assert.match(p.guias[0],/<receita>100102<\/receita>/);
 assert.match(p.guias[1],/<receita>100129<\/receita>/);
 assert.match(p.guias[0],/<documentoOrigem tipo="24">/);
 assert.match(p.guias[1],/<documentoOrigem tipo="24">/);
 assert.match(p.guias[0],/<valor tipo="11">28\.73<\/valor>/);
 assert.match(p.guias[1],/<valor tipo="12">8\.21<\/valor>/);
 assert.equal(p.resumo.total_cotacao,'36.94');
 assert.equal(p.resumo.transmissao,false);
 assert.equal(p.resumo.guias_pagaveis,false);
});
test('sem FCP positivo nao inventar segunda guia',()=>{
 const b=base();b.nfe.fcp='0.00';
 assert.throws(()=>prepararDuasGuias(b),/Duas guias exigem/);
});
test('sem ConfigUF de FCP a preparacao e bloqueada',()=>{
 const b=base();delete b.perfis['100129'];
 assert.throws(()=>prepararDuasGuias(b),/ConfigUF da receita 100129/);
});
test('documento tipo 24 precisa ser confirmado em ambas receitas',()=>{
 const b=base();b.perfis['100129']=perfil('100129',['10','22']);
 assert.throws(()=>prepararDuasGuias(b),/tipo 24/);
});
test('detalhamento ou campo adicional obrigatorio precisa implementacao especifica',()=>{
 const b=base();b.perfis['100129'].exigencias.detalhamento='O';
 assert.throws(()=>prepararDuasGuias(b),/exige detalhamento/);
});
test('chave adulterada nao passa validacao',()=>{
 const b=base();b.nfe.chave=b.nfe.chave.slice(0,-1)+'9';
 assert.throws(()=>prepararDuasGuias(b),/digito verificador/);
});
test('NF-e sem protocolo de autorizacao nao passa',()=>{
 const b=base();b.nfe.statusAutorizacao='101';
 assert.throws(()=>prepararDuasGuias(b),/protocolo autorizado/);
});
test('mesmo lote gera hash igual e nao transmite',()=>{
 const a=prepararDuasGuias(base()),b=prepararDuasGuias(base());
 assert.equal(a.resumo.idempotency_key,b.resumo.idempotency_key);
 assert.equal(a.resumo.lote_sha256.length,64);
});
