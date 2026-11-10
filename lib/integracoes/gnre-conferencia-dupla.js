'use strict';
// Conciliacao de lote com DUAS guias diferentes, exclusivamente homologacao.
// Nao equivale a documento pagavel; preserva informacoes do retorno sem nova transmissao.
const TIPOS=['100102','100129'];
function cents(x){
 const v=String(x==null?'':x).trim();
 if(!/^\d{1,11}(?:\.\d{1,4})?$/.test(v))return null;
 const [a,b='']=v.split('.');
 if(b.padEnd(4,'0').slice(2)!=='00')return null;
 return BigInt(a)*100n+BigInt(b.padEnd(2,'0').slice(0,2));
}
function conciliarDuasGuias(retorno,referencias){
 const pendencias=[];
 if(!retorno||retorno.codigo!=='402'||!retorno.lote_completo_confirmado)
  pendencias.push('Lote ainda nao confirmou processamento completo 402 de todas as guias.');
 if(!Array.isArray(referencias)||referencias.length!==2||!Array.isArray(retorno?.guias)||retorno.guias.length!==2)
  pendencias.push('Sao obrigatorios exatamente dois registros fiscais e duas guias no retorno.');
 const refs=Array.isArray(referencias)?referencias:[];
 const gs=Array.isArray(retorno?.guias)?retorno.guias:[];
 const result=[];
 for(const receita of TIPOS){
  const encontrados=refs.filter(x=>x?.receita===receita);
  const correspondentes=gs.filter(x=>x?.receita===receita);
  if(encontrados.length!==1||correspondentes.length!==1){
   pendencias.push('Falta correspondencia individual e unica para receita '+receita+'.');
   continue;
  }
  const [r,g]=[encontrados[0],correspondentes[0]];
  if(r.ambiente!=='homologacao')pendencias.push('Ambiente de registro divergente na receita '+receita);
  if(!['recebida','validada'].includes(r.situacao))pendencias.push('Registro nao conciliavel na receita '+receita);
  if(g.situacao!=='0')pendencias.push('Guia rejeitada/pendente na receita '+receita);
  if(r.uf_favorecida!==g.uf)pendencias.push('UF diferente na receita '+receita);
  if(cents(r.valor_principal)===null||cents(g.valor)===null||cents(r.valor_principal)!==cents(g.valor))
   pendencias.push('Valor principal divergente na receita '+receita);
  if(!/^\d{44}$/.test(String(r.chave_nfe||''))||g.documento_origem!==r.chave_nfe)
   pendencias.push('Chave NF-e de origem divergente na receita '+receita);
  result.push({receita,valor:r.valor_principal,uf:r.uf_favorecida,
   guia_processada:g.situacao==='0',numero_controle:!!g.numero_controle,
   pdf_individual:!!g.pdf_base64});
 }
 if(refs.length===2&&refs[0]?.chave_nfe!==refs[1]?.chave_nfe)
  pendencias.push('Guias associadas a NF-e diferentes.');
 const confirmado=pendencias.length===0;
 return {confirmado,ambiente:'homologacao',duas_guias:result,
  pendencias,documentos_validos_para_pagamento:false,
  aviso:'Homologacao nao gera guias pagaveis. PDFs e autorizacao fiscal de producao precisam de verificacao independente.'};
}
module.exports={conciliarDuasGuias,cents};
