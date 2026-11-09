'use strict';
// Conferência de resultado individual em HOMOLOGAÇÃO, sem emissão ou pagamento.
// Entrada: registro GNRE recebido (Supabase) e retorno autenticado de consulta.
// Saída: somente indicadores, sem chave de acesso, CNPJ, recibo ou XML fiscal.
function texto(x){return x==null?'':String(x).trim();}
function centavos(x){
 const s=texto(x);
 if(!/^\d{1,12}(?:\.\d{1,4})?$/.test(s))return null;
 const [real,decimal='']=s.split('.');
 const fraction=decimal.padEnd(4,'0');
 if(fraction.slice(2)!=='00')return null;
 return BigInt(real)*100n+BigInt(fraction.slice(0,2));
}
function conferirResultadoIndividual(retorno,referencia){
 const pendencias=[];
 const guia=retorno?.guias?.length===1?retorno.guias[0]:null;
 const base={
  confirmado:false,
  documento_valido_para_pagamento:false,
  ambiente:'homologacao',
  conferencia:'pendente',
  pendencias
 };
 if(!referencia||typeof referencia!=='object'){
  pendencias.push('Registro da NF-e nao foi localizado no historico de homologacao.');
  return base;
 }
 if(!retorno?.ok||retorno.codigo!=='402'||!retorno.guia_confirmada)
  pendencias.push('A consulta nao confirmou processamento individual 402 com situacao 0.');
 if(!guia)pendencias.push('Consulta nao retornou exatamente uma guia individual.');
 if(texto(referencia.ambiente)!=='homologacao')
  pendencias.push('Ambiente do registro nao corresponde a homologacao.');
 if(texto(referencia.situacao)!=='recebida'&&texto(referencia.situacao)!=='validada')
  pendencias.push('Estado do registro de recepcao nao permite conciliacao.');
 if(!/^\d{44}$/.test(texto(referencia.chave_nfe)))
  pendencias.push('Chave da NF-e arquivada invalida.');
 if(guia){
  if(guia.situacao!=='0')pendencias.push('Situacao da guia diferente de zero.');
  if(texto(guia.receita)!==texto(referencia.receita))
   pendencias.push('Receita do retorno difere da receita do registro.');
  if(texto(guia.uf)!==texto(referencia.uf_favorecida))
   pendencias.push('UF favorecida do retorno difere do registro.');
  const a=centavos(guia.valor),b=centavos(referencia.valor_principal);
  if(a===null||b===null||a!==b)
   pendencias.push('Valor principal da guia difere do registro.');
  const documento=texto(guia.documento_origem);
  if(!documento)
   pendencias.push('Documento de origem da guia nao foi identificado no retorno.');
  else if(documento.replace(/^0+(?=\d)/,'')!==texto(referencia.numero_nfe).replace(/^0+(?=\d)/,''))
   pendencias.push('Documento de origem difere do numero da NF-e.');
 }
 const confirmado=pendencias.length===0;
 return {...base,confirmado,conferencia:confirmado?'compativel_com_registro':'pendente',
  resumo:{
   numero_nfe:texto(referencia.numero_nfe),
   receita:texto(referencia.receita),
   uf_favorecida:texto(referencia.uf_favorecida),
   valor_principal:texto(referencia.valor_principal),
   guia_situacao:guia?.situacao||null,
   possui_numero_guia:Boolean(guia?.numero_controle),
   possui_linha_digitavel:Boolean(guia?.linha_digitavel),
   possui_codigo_barras:Boolean(guia?.codigo_barras),
   possui_pdf_individual:Boolean(guia?.pdf_base64),
   pdf_lote_indicado:Boolean(retorno?.diagnostico?.pdf_guias_presente)
  }
 };
}
module.exports={conferirResultadoIndividual,centavos};
