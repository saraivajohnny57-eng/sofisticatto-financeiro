'use strict';
/* Sofisticatto: cálculo de ESTIMATIVA GNRE para cotação. Sem acesso à rede,
 * sem decisão fiscal, sem criação de guias pagáveis.
 * UMD para compartilhar o MESMO cálculo entre navegador e testes Node. */
(function (raiz, fabrica) {
 const api=fabrica();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(raiz&&typeof raiz==='object')raiz.SofisticattoGnreDivisao=api;
})(typeof window!=='undefined'?window:null,function(){
 function numero(v,nome,limite){
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>limite)
   throw new TypeError(nome+' deve ser um numero valido, nao negativo.');
  return v;
 }
 function moeda(centavos){return (centavos/100).toFixed(2);}
 function centavos(valor,nome){
  return Math.round(numero(valor,nome,1e10)*100);
 }
 function fator(aliquota,nome){
  const a=numero(aliquota,nome,1);
  return Math.round(a*1e6);
 }
 function estimar({valorOperacao,aliquotaInterestadual,aliquotaInterna,aliquotaFcp}={}){
  const base=centavos(valorOperacao,'valorOperacao');
  const inter=fator(aliquotaInterestadual,'aliquotaInterestadual');
  const interna=fator(aliquotaInterna,'aliquotaInterna');
  const fcp=fator(aliquotaFcp,'aliquotaFcp');
  if(interna<inter)throw new TypeError('Aliquota interna inferior a interestadual; conferir parametros fiscais.');
  // Sem dupla contagem: cada componente e arredondado em centavos ANTES da soma.
  const difalCentavos=Math.round(base*(interna-inter)/1e6);
  const fcpCentavos=Math.round(base*fcp/1e6);
  const totalCentavos=difalCentavos+fcpCentavos;
  return {
   base:moeda(base),difal:moeda(difalCentavos),fcp:moeda(fcpCentavos),
   total:moeda(totalCentavos),
   diferenca_percentual:((interna-inter)/1e4).toFixed(2),
   fcp_percentual:(fcp/1e4).toFixed(2),
   modo:'estimativa_planilha',transmissao:false,
   // Duas propostas distintas; nao significam receitas aprovadas pela UF.
   receitas_sugeridas:[
    {codigo:'100102',tipo:'DIFAL',valor:moeda(difalCentavos),incluir:difalCentavos>0,
     situacao:'pendente_configuf_e_validacao_fiscal'},
    {codigo:'100129',tipo:'FCP',valor:moeda(fcpCentavos),incluir:fcpCentavos>0,
     situacao:'pendente_configuf_e_validacao_fiscal'}
   ],
   aviso:'Cotacao estimada. Validar NCM, FCP efetivamente incidente, base, datas, receita e UF antes de gerar GNRE.'
  };
 }
 function compararComNfe(estimativa,{valorNf,difalXml,fcpXml}={}){
  if(!estimativa||estimativa.modo!=='estimativa_planilha')
   throw new TypeError('Estimativa GNRE obrigatoria.');
  const pendencias=[];
  const nf=centavos(valorNf,'valorNf');
  const valorBase=centavos(Number(estimativa.base),'base');
  const difal=centavos(difalXml,'difalXml');
  const fcp=centavos(fcpXml,'fcpXml');
  if(nf!==valorBase)pendencias.push('Valor utilizado na estimativa difere do valor total da NF-e.');
  if(difal!==centavos(Number(estimativa.difal),'difalEstimado'))
   pendencias.push('DIFAL do XML difere do valor estimado por aliquotas.');
  if(fcp!==centavos(Number(estimativa.fcp),'fcpEstimado'))
   pendencias.push('FCP do XML difere do FCP estimado pela tabela; nao emitir FCP sem revisao fiscal.');
  return {
   conforme:pendencias.length===0,
   pendencias,
   dados_xml:{valor_nf:moeda(nf),difal:moeda(difal),fcp:moeda(fcp)},
   cotacao_total:estimativa.total,
   emissao_liberada:false
  };
 }
 return Object.freeze({estimar,compararComNfe});
});
