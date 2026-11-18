'use strict';
/**
 * Valida exclusivamente os dados locais antes de montar/transmitir um PUT.
 * O manual de alteração NÃO possui dadosTitulo.valorTitulo:
 * o nominal é protegido por comparação entre a consulta bancária e o cadastro.
 * Esta função não acessa o Bradesco e NÃO libera transmissões.
 */
const camposChave=[
  'cpfCnpj.cpfCnpj','cpfCnpj.filial','cpfCnpj.controle',
  'produto','negociacao','nossoNumero',
  'dadosPagador.cpfCnpjSacado.cpfCnpj',
  'dadosPagador.cpfCnpjSacado.filial',
  'dadosPagador.cpfCnpjSacado.controle',
  'dadosTitulo.seuNumero','dadosTitulo.dataEmissao',
  'dadosTitulo.vencimento.dataVencimento'
];
const get=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
const numeroInteiroSeguro=v=>v!==undefined&&v!==null&&v!==''&&Number.isSafeInteger(Number(v));
function validarPreAlteracao({original,proposto,consulta,confirmacaoEscala}={}){
  const erros=[];
  if(!original||!proposto||typeof original!=='object'||typeof proposto!=='object')
    return {apto:false,erros:['Payload original e proposto obrigatórios']};
  if(!consulta||consulta.http_status!==200||Number(consulta.codStatus)!==1||consulta.pago||consulta.baixado||consulta.descontado)
    erros.push('Consulta bancária atual não confirma título aberto elegível');
  // Nominal não é um campo de entrada do PUT documentado na V1.6.3.
  if(Object.hasOwn(proposto.dadosTitulo||{},'valorTitulo'))
    erros.push('dadosTitulo.valorTitulo não pertence ao contrato PUT: remover este campo');
  if(Object.hasOwn(original.dadosTitulo||{},'valorTitulo'))
    erros.push('O nominal original deve ser validado fora do JSON do PUT');
  const banco=consulta?.valorNominalBancoCentavos,local=consulta?.valorNominalLocalCentavos;
  if(!numeroInteiroSeguro(banco)||!numeroInteiroSeguro(local)||Number(banco)<=0||Number(banco)!==Number(local))
    erros.push('Valor nominal não conferido em centavos entre banco e portal');
  for(const path of camposChave){
    const antes=get(original,path),depois=get(proposto,path);
    if(antes===undefined||antes===null||antes==='')erros.push('Campo original ausente: '+path);
    if(String(antes??'')!==String(depois??''))erros.push('Campo original divergente: '+path);
  }
  const t=proposto.dadosTitulo,juros=t?.comissaoPermanencia;
  if(!juros||Number(juros.codigoComissaoPermanencia)!==2||!Number.isFinite(Number(juros.valorComissaoPermanencia))||Number(juros.valorComissaoPermanencia)<=0)
    erros.push('Juros percentuais inválidos');
  if(!t||Number(t.codigoMulta)!==2||!Number.isFinite(Number(t.valorMulta))||Number(t.valorMulta)<=0)
    erros.push('Multa percentual inválida');
  for(const [campo,valor] of [['diasComissaoPermanencia',juros?.diasComissaoPermanencia],['diasMulta',t?.diasMulta]]){
    if(!numeroInteiroSeguro(valor)||Number(valor)<0||Number(valor)>999)
      erros.push('Dias inválidos: '+campo);
  }
  if(confirmacaoEscala!=='CONTRATO_PUT_VALIDADO')
    erros.push('Escala numérica e dias do PUT não homologados');
  return {apto:erros.length===0,erros};
}
module.exports={validarPreAlteracao};
