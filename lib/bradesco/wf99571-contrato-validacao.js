'use strict';
// Validação sintática rigorosa, sem transmissão, do objeto de manutenção da API
// Bradesco Cobrança 1.6.3. Não substitui aceitação bancária de códigos.
const isNum=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const isTxt=x=>typeof x==='string';
const whitelist={
 'cpfCnpj':['cpfCnpj','filial','controle'],
 'dadosPagador':['sacado','cpfCnpjSacado','endereco','cep','sufixo','nomeSacador','aceite','cpfCnpjSacador','emailSacado'],
 'dadosTitulo':['seuNumero','dataEmissao','especie','vencimento','protesto','decurso','abatimento','dataDesc1','valDesc1','codValDe1','tipoDesc1','dataDesc2','valDesc2','codValDe2','tipoDesc2','dataDesc3','valDesc3','codValDe3','tipoDesc3','codigoControleParticipante','indicadorAvisoSacado','comissaoPermanencia','codigoMulta','diasMulta','valorMulta','codigoNegativacao','diasNegativacao','pagamentoParcial','qtdePagamentoParcial'],
 'vencimento':['dataVencimento','tipoVencimento'],
 'protesto':['codInstrucaoProtesto','qtdeDiasProtesto'],
 'decurso':['codDecursoPrazo','diasDecursoPrazo'],
 'abatimento':['tipoAbatimento','valorAbatimento'],
 'comissaoPermanencia':['diasComissaoPermanencia','valorComissaoPermanencia','codigoComissaoPermanencia']
};
function checar(obj){
 const erros=[];
 function assert(ok,msg){if(!ok)erros.push(msg)}
 function estrutura(o,nome){
  assert(!!o&&typeof o==='object'&&!Array.isArray(o),'Objeto '+nome+' ausente');
  if(!o||typeof o!=='object'||Array.isArray(o))return;
  const expected=whitelist[nome]||[];
  for(const k of Object.keys(o))assert(expected.includes(k),'Campo não reconhecido em '+nome+': '+k);
  for(const k of expected)assert(Object.hasOwn(o,k),'Campo ausente em '+nome+': '+k);
 }
 estrutura(obj?.cpfCnpj,'cpfCnpj');
 estrutura(obj?.dadosPagador,'dadosPagador');
 estrutura(obj?.dadosTitulo,'dadosTitulo');
 for(const c of ['cpfCnpj','filial','controle'])assert(isNum(obj?.cpfCnpj?.[c]),'Beneficiário inválido: '+c);
 for(const c of ['cpfCnpjSacado','cpfCnpjSacador']){
  const v=obj?.dadosPagador?.[c];
  if(!v||typeof v!=='object'){assert(false,c+' ausente');continue}
  for(const k of ['cpfCnpj','filial','controle'])assert(isNum(v[k]),c+'.'+k+' inválido');
 }
 for(const c of ['produto','negociacao','nossoNumero'])assert(isNum(obj?.[c]),'Identificador '+c+' inválido');
 for(const c of ['sacado','endereco','nomeSacador','aceite','emailSacado'])assert(isTxt(obj?.dadosPagador?.[c]),'Texto inválido: '+c);
 for(const c of ['cep','sufixo'])assert(isNum(obj?.dadosPagador?.[c]),'CEP inválido: '+c);
 for(const c of ['vencimento','protesto','decurso','abatimento','comissaoPermanencia'])
  estrutura(obj?.dadosTitulo?.[c],c);
 const t=obj?.dadosTitulo||{};
 const numeric=['dataEmissao','dataDesc1','valDesc1','codValDe1','tipoDesc1','dataDesc2','valDesc2','codValDe2','tipoDesc2','dataDesc3','valDesc3','codValDe3','tipoDesc3','codigoMulta','diasMulta','valorMulta','codigoNegativacao','diasNegativacao','qtdePagamentoParcial'];
 for(const k of numeric)assert(isNum(t[k]),'Número do título inválido: '+k);
 for(const k of ['seuNumero','especie','codigoControleParticipante','indicadorAvisoSacado','pagamentoParcial'])
  assert(isTxt(t[k]),'Texto do título inválido: '+k);
 for(const [section,keys] of Object.entries({vencimento:['dataVencimento','tipoVencimento'],protesto:['codInstrucaoProtesto','qtdeDiasProtesto'],decurso:['codDecursoPrazo','diasDecursoPrazo'],abatimento:['tipoAbatimento','valorAbatimento'],comissaoPermanencia:['diasComissaoPermanencia','valorComissaoPermanencia','codigoComissaoPermanencia']})){
  for(const k of keys)assert(isNum(t[section]?.[k]),'Número inválido: '+section+'.'+k);
 }
 assert(t.dataEmissao===0&&t.vencimento?.dataVencimento===0,'Campos de data originais não podem ser alterados');
 assert(t.seuNumero===''&&t.especie==='','Identificação original não pode ser alterada');
 assert(t.protesto?.codInstrucaoProtesto===0&&t.protesto?.qtdeDiasProtesto===0,'Protesto não pode ser alterado');
 assert(t.decurso?.codDecursoPrazo===0&&t.decurso?.diasDecursoPrazo===0,'Decurso não pode ser alterado');
 assert(t.abatimento?.valorAbatimento===0,'Abatimento não pode ser alterado');
 assert([1,2,3].every(i=>t['dataDesc'+i]===0&&t['valDesc'+i]===0),'Descontos não podem ser alterados');
 assert(t.comissaoPermanencia?.codigoComissaoPermanencia===2&&t.comissaoPermanencia?.diasComissaoPermanencia===1&&t.comissaoPermanencia?.valorComissaoPermanencia===50000,'Juros fora da configuração WF-99571');
 assert(t.codigoMulta===2&&t.diasMulta===1&&t.valorMulta===20000,'Multa fora da configuração WF-99571');
 assert(t.pagamentoParcial==='N'&&t.qtdePagamentoParcial===0,'Pagamento parcial alterado');
 return {ok:erros.length===0,erros};
}
module.exports={checar};
