'use strict';
// Preflight de DUAS guias de NF-e NOVA. Sem transmissao e sem documento pagavel.
// Perfis sao derivados da ConfigUF no servidor, nunca de selecao do cliente.
const {guiaSimples}=require('./gnre-guia-simples-offline');
const {montarPlanoRecepcao}=require('./gnre-recepcao-executor');
const {cnpjValido}=require('./gnre-documento-fiscal');
const RECEITAS=Object.freeze([{tributo:'DIFAL',codigo:'100102',campo:'difal'},{tributo:'FCP',codigo:'100129',campo:'fcp'}]);
function quantia(valor,nome){
 if(typeof valor!=='string'||! /^(0|[1-9]\d{0,9})\.\d{2}$/.test(valor))throw new TypeError(nome+' deve ter duas casas decimais.');
 return BigInt(valor.replace('.',''));
}
function dinheiro(centavos){return (centavos/100n).toString()+'.'+(centavos%100n).toString().padStart(2,'0');}
function data(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function dvChave(s){
 if(!/^\d{44}$/.test(String(s)))return false;
 const pesos=[2,3,4,5,6,7,8,9];let soma=0;
 for(let i=42;i>=0;i--)soma+=Number(s[i])*pesos[(42-i)%8];
 const resto=soma%11;return Number(s[43])===(resto<2?0:11-resto);
}
function conferirNfe(n){
 if(!n||typeof n!=='object'||Array.isArray(n)||!dvChave(n.chave))
  throw new TypeError('Chave de NF-e invalida ou sem digito verificador correto.');
 if(!cnpjValido(n.cnpjEmitente)||n.chave.slice(6,20)!==n.cnpjEmitente||n.chave.slice(20,22)!=='55')
  throw new TypeError('CNPJ/modelo 55 nao conferem com a chave da NF-e.');
 if(!/^\d{1,9}$/.test(String(n.numero||''))||Number(n.chave.slice(25,34))!==Number(n.numero))
  throw new TypeError('Numero de NF-e divergente da chave.');
 if(n.statusAutorizacao!=='100'||n.chaveProtocolo!==n.chave||n.ambienteNfe!=='1')
  throw new TypeError('NF-e deve conter protocolo autorizado cStat 100 em producao.');
 if(!/^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/.test(n.ufDestino))
  throw new TypeError('UF de destino invalida.');
 if(!/^[0-9]{7}$/.test(n.municipioEmitente)||!/[0-9]{8}/.test(n.cepEmitente)
 || !/^[A-Z]{2}$/.test(n.ufOrigem)||!/^.{1,60}$/.test(n.enderecoEmitente||''))
  throw new TypeError('Endereco do emitente incompleto.');
}
function perfilValido(p,uf,codigo){
 if(!p||p.ok!==true||p.uf!==uf||p.receita!==codigo||!p.exigencias)
  throw new TypeError('ConfigUF da receita '+codigo+' nao confirmada pela SEFAZ.');
 const x=p.exigencias;
 if((p.pendencias||[]).length)throw new TypeError('ConfigUF '+codigo+' possui exigencias nao resolvidas.');
 for(const campo of ['documento_origem','emitente','vencimento','pagamento','detalhamento','campos_adicionais','produto','destinatario','periodo_referencia']){
  if(!['N','S','O'].includes(x[campo]))throw new TypeError('Exigencia '+campo+' nao reconhecida para '+codigo);
 }
 if(x.documento_origem==='N')throw new TypeError('ConfigUF '+codigo+' nao permite documento de origem exigido neste fluxo.');
 const docs=(p.documentos||[]).map(d=>d.codigo);
 if(!docs.includes('24'))throw new TypeError('ConfigUF '+codigo+' nao confirmou documento de origem tipo 24 (chave DF-e).');
 for(const campo of ['detalhamento','campos_adicionais','produto','destinatario','periodo_referencia'])
  if(x[campo]==='O')throw new TypeError('ConfigUF '+codigo+' exige '+campo+'; implantar respectivo campo antes do envio.');
 return p;
}
function prepararDuasGuias({nfe,fiscal,perfis,novaOperacao}={}){
 if(novaOperacao!==true)throw new TypeError('Somente novas operacoes expressamente identificadas.');
 conferirNfe(nfe);
 if(!fiscal||!data(fiscal.vencimento)||!data(fiscal.pagamento))
  throw new TypeError('Vencimento e data de pagamento validos sao obrigatorios.');
 if(fiscal.vencimento<fiscal.pagamento)
  throw new TypeError('Pagamento posterior ao vencimento: conferir encargos antes do envio.');
 if(!perfis||typeof perfis!=='object')throw new TypeError('Consulta ConfigUF nao realizada.');
 const valores=RECEITAS.map(r=>({r,cents:quantia(nfe[r.campo],r.tributo)}));
 if(valores.some(v=>v.cents<=0n))throw new TypeError('Duas guias exigem DIFAL e FCP positivos na NF-e; nunca inventar tributo.');
 const contribuinte={cnpj:nfe.cnpjEmitente,razaoSocial:nfe.razaoSocialEmitente,
  endereco:nfe.enderecoEmitente,municipio:nfe.municipioEmitente.slice(2),
  uf:nfe.ufOrigem,cep:nfe.cepEmitente};
 const guias=valores.map(({r,cents})=>{
  const perfil=perfilValido(perfis[r.codigo],nfe.ufDestino,r.codigo);
  return guiaSimples({
   ufFavorecida:nfe.ufDestino,receita:r.codigo,valorPrincipal:dinheiro(cents),
   dataVencimento:fiscal.vencimento,dataPagamento:fiscal.pagamento,
   tipoDocumentoOrigem:'24',documentoOrigem:nfe.chave,contribuinte,
   tipoValor:r.tributo==='FCP'?'12':'11',
   convenio:null,
   detalhamentoReceita:null
  });
 });
 const plano=montarPlanoRecepcao(guias);
 return {guias,resumo:{
  nfe:nfe.numero,uf:nfe.ufDestino,quantidade:2,
  tributos:valores.map(v=>({tributo:v.r.tributo,receita:v.r.codigo,valor:dinheiro(v.cents),tipo_documento:'24'})),
  total_cotacao:dinheiro(valores.reduce((s,v)=>s+v.cents,0n)),
  lote_sha256:plano.lote_sha256,idempotency_key:plano.idempotency_key,
  transmissao:false,guias_pagaveis:false,ambiente:'homologacao',
  pendente:'Verificar duplicidades por NF-e+receita, validar XSD e obter retorno individual oficial antes de transmitir.'
 }};
}
module.exports={RECEITAS,prepararDuasGuias,conferirNfe,perfilValido,dvChave};
