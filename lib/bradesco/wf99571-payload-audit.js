'use strict';
// Auditoria exclusivamente leitura do contrato de alteração Bradesco.
// O retorno é diagnóstico sem CPF/CNPJ, nome, endereço, token ou payload de envio.
const {parse:parseUrl}=require('url');
const texto=x=>String(x??'').trim();
const numerico=x=>x!==undefined&&x!==null&&texto(x)!==''&&!Number.isNaN(Number(x));
const vazio=x=>x===null||x===undefined||texto(x)==='';
const CAMPOS={
 dadosTitulo:{
  seuNumero:'snumero',dataEmissao:'dataEmis',especie:'especDocto',
  vencimento:'dataVencto',
  codigoControleParticipante:'ctrlPartic',
  pagamentoParcial:'permitePgtoParcial',qtdePagamentoParcial:'qtdePgtoParcial'
 },
 desconto1:{data:'dataDesc1',valor:'valDesc1',codigo:'codValDe1'},
 desconto2:{data:'dataDesc2',valor:'valDesc2',codigo:'codValDe2'},
 desconto3:{data:'dataDesc3',valor:'valDesc3',codigo:'codValDe3'},
 protesto:{codigo:'codInscrProt',dias:'diasProt'},
 decurso:{dias:'qtdDiasDecurPrz'},
 abatimento:{valor:'valAbat'}
};
function auditoria(titulo,registro){
 if(!titulo||typeof titulo!=='object')throw new TypeError('Consulta bancária sem título.');
 const vistos={},faltantes=[];
 for(const [sec,campos] of Object.entries(CAMPOS)){
  vistos[sec]={};
  for(const [contrato,origem] of Object.entries(campos)){
   const tem=Object.prototype.hasOwnProperty.call(titulo,origem);
   vistos[sec][contrato]={campo_banco:origem,presente:tem,preenchido:tem&&!vazio(titulo[origem])};
   if(!tem)faltantes.push(sec+'.'+contrato);
  }
 }
 const ancoras={
  seu_numero:texto(titulo.snumero)==='56078-02',
  emissao:texto(titulo.dataEmis)==='28092026',
  especie:texto(titulo.especDocto)==='DM',
  vencimento_original:/^08\/11\/2026$/.test(texto(titulo.dataVencto)),
  valor_local:Math.abs(Number(registro?.valor)-527.96)<0.001,
  sem_encargos:Number(titulo.codValMul||0)===0&&Number(titulo.codComisPerm||0)===0,
  status_aberto:Number(titulo.codStatus)===1
 };
 const pendencias=[];
 if(Object.values(ancoras).some(v=>!v))pendencias.push('Uma ou mais âncoras fiscais/bancárias divergentes.');
 if(faltantes.length)pendencias.push('Campos de consulta ausentes: '+faltantes.join(', '));
 // Origem do "tipo" de descontos não é inequívoca na consulta: não inferir 0
 // para campos obrigatórios a partir de codValDe1=0.
 pendencias.push('Confirmar valores obrigatórios codValDe1/tipoDesc1, tipoDesc2/3, tipoAbatimento, codDecursoPrazo e codigoNegativacao.');
 pendencias.push('Confirmar estruturas completas do pagador, contrato e campos imutáveis por consulta autenticada.');
 pendencias.push('Confirmar tratamento dos zeros exigidos pelo manual para cada campo, sem alterar descontos/protestos preexistentes.');
 return {titulo:'56078-02',campos_mapeados:vistos,ancoras_confirmadas:ancoras,
  total_campos_mapeados:Object.values(CAMPOS).reduce((n,o)=>n+Object.keys(o).length,0),
  campos_ausentes:faltantes,pendencias,contrato_integral_validado:false,
  put_liberado:false,transmissao_executada:false};
}
module.exports={auditoria,CAMPOS};
