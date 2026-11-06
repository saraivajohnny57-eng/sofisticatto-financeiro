'use strict';
/**
 * Validação de pré-transmissão do PUT de alteração Bradesco.
 * Não monta valores de encargos: escala e início devem vir do contrato homologado.
 * Não envia requisições e não altera títulos.
 */
const CAMPOS=['nossoNumero','produto','negociacao','seuNumero','dataEmissao','especie','dataVencto','valorTitulo'];
function validarPreAlteracao({original,proposto,consulta,confirmacaoEscala}={}){
 const erros=[];
 if(!original||typeof original!=='object'||!proposto||typeof proposto!=='object')return {apto:false,erros:['Dados originais e proposta obrigatórios']};
 if(!consulta||consulta.http_status!==200||consulta.codStatus!==1||consulta.pago||consulta.baixado||consulta.descontado)erros.push('Consulta bancária atual não confirma título aberto elegível');
 for(const campo of CAMPOS){
  if(original[campo]===undefined||original[campo]===null||String(original[campo]).trim()==='')erros.push('Campo original ausente: '+campo);
  if(String(original[campo]??'')!==String(proposto[campo]??''))erros.push('Campo imutável divergente: '+campo);
 }
 const enc=proposto.comissaoPermanencia;
 if(!enc||Number(enc.codigoComissaoPermanencia)!==2||!Number.isFinite(Number(enc.valorComissaoPermanencia))||Number(enc.valorComissaoPermanencia)<=0)erros.push('Juros percentuais inválidos');
 if(Number(proposto.codigoMulta)!==2||!Number.isFinite(Number(proposto.valorMulta))||Number(proposto.valorMulta)<=0)erros.push('Multa percentual inválida');
 if(!Number.isInteger(Number(enc?.diasComissaoPermanencia))||Number(enc.diasComissaoPermanencia)<0)erros.push('Dias de juros inválidos');
 if(!Number.isInteger(Number(proposto.diasMulta))||Number(proposto.diasMulta)<0)erros.push('Dias de multa inválidos');
 if(confirmacaoEscala!=='CONTRATO_PUT_VALIDADO')erros.push('Escala e datas do PUT ainda não homologadas');
 return {apto:erros.length===0,erros};
}
module.exports={validarPreAlteracao};
