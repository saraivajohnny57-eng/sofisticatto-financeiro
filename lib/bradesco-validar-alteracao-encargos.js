'use strict';
/** Validação somente local do contrato PUT de alteração; não envia requisições. */
const chaves=['produto','negociacao','nossoNumero'];
const tituloChaves=['seuNumero','dataEmissao','valorTitulo'];
const get=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
function validarPreAlteracao({original,proposto,consulta,confirmacaoEscala}={}){
 const erros=[];
 if(!original||!proposto||typeof original!=='object'||typeof proposto!=='object')return {apto:false,erros:['Payload original e proposto obrigatórios']};
 if(!consulta||consulta.http_status!==200||consulta.codStatus!==1||consulta.pago||consulta.baixado||consulta.descontado)erros.push('Consulta bancária atual não confirma título aberto elegível');
 for(const path of [...chaves,'cpfCnpj.cpfCnpj','cpfCnpj.filial','cpfCnpj.controle','dadosPagador.cpfCnpjSacado.cpfCnpj','dadosPagador.cpfCnpjSacado.filial','dadosPagador.cpfCnpjSacado.controle',...tituloChaves.map(x=>'dadosTitulo.'+x),'dadosTitulo.vencimento.dataVencimento']){
  const antes=get(original,path),depois=get(proposto,path);
  if(antes===undefined||antes===null||antes==='')erros.push('Campo original ausente: '+path);
  if(String(antes??'')!==String(depois??''))erros.push('Campo original divergente: '+path);
 }
 const t=proposto.dadosTitulo,enc=t?.comissaoPermanencia;
 if(!t||!enc||Number(enc.codigoComissaoPermanencia)!==2||!Number.isFinite(Number(enc.valorComissaoPermanencia))||Number(enc.valorComissaoPermanencia)<=0)erros.push('Juros percentuais inválidos');
 if(!t||Number(t.codigoMulta)!==2||!Number.isFinite(Number(t.valorMulta))||Number(t.valorMulta)<=0)erros.push('Multa percentual inválida');
 for(const [campo,valor] of [['diasComissaoPermanencia',enc?.diasComissaoPermanencia],['diasMulta',t?.diasMulta]]){
  if(valor===undefined||valor===null||valor===''||!Number.isInteger(Number(valor))||Number(valor)<0)erros.push('Dias inválidos: '+campo);
 }
 if(confirmacaoEscala!=='CONTRATO_PUT_VALIDADO')erros.push('Escala e dias do PUT não homologados');
 return {apto:erros.length===0,erros};
}
module.exports={validarPreAlteracao};
