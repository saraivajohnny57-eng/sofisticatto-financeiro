'use strict';
// GNRE ConfigUF: consulta somente leitura. O WSDL descreve gnreDadosMsg
// como XML (s:any), não uma string escapada.
const NS_SERVICO = 'http://www.gnre.pe.gov.br/webservice/GnreConfigUF';
const NS_DADOS = 'http://www.gnre.pe.gov.br';
const SOAP_ACTION = NS_SERVICO + '/consultar';
const UF_TESTE = 'MG';
const RECEITA_TESTE = '100129';
const RECEITAS_PERMITIDAS=Object.freeze(['100129','100102']);
// Endereco divulgado em implementacoes amplamente usadas (ACBr), apenas para teste comparativo.
// Nao substitui a porta 444 automaticamente e nunca transmite guias.
const ENDPOINT_ALTERNATIVO_443='https://www.testegnre.pe.gov.br/gnreWS/services/GnreConfigUF';

function montarDadosConfigUf({uf=UF_TESTE,receita=RECEITA_TESTE}={}) {
  if(uf!==UF_TESTE)throw new TypeError('Esta rotina somente consulta MG em homologacao');
  if(receita!==null&&!RECEITAS_PERMITIDAS.includes(receita))
    throw new TypeError('Receita de teste deve ser 100129, 100102 ou omitida');
  const filtro=receita===null?'':'<receita>'+receita+'</receita>';
  return '<TConsultaConfigUf xmlns="'+NS_DADOS+'"><ambiente>2</ambiente><uf>'+uf+'</uf>'
    +filtro+'</TConsultaConfigUf>';
}
function montarEnvelopeConfigUf(opcoes={}) {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    +'<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    +'<soap12:Header><gnreCabecMsg xmlns="'+NS_SERVICO+'"><versaoDados>1.00</versaoDados></gnreCabecMsg></soap12:Header>'
    +'<soap12:Body><gnreDadosMsg xmlns="'+NS_SERVICO+'">'+montarDadosConfigUf(opcoes)
    +'</gnreDadosMsg></soap12:Body></soap12:Envelope>';
}
function extrairTag(xml,tag) {
  const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+tag
    +'(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*<\\/(?:[A-Za-z_][\\w.-]*:)?'
    +tag+'\\s*>','i');
  const match=String(xml||'').match(re);
  return match?match[1].trim():null;
}
function analisarConfigUf({http_status,xml,uf=UF_TESTE,receita=RECEITA_TESTE}={}) {
  const corpo=String(xml||'');
  const blocoFault=extrairTag(corpo,'Fault');
  const situacao=extrairTag(corpo,'situacaoConsulta');
  const codigo=situacao?extrairTag(situacao,'codigo'):null;
  const descricao=situacao?extrairTag(situacao,'descricao'):null;
  const erroXml=blocoFault
    ?(extrairTag(blocoFault,'Text')||extrairTag(blocoFault,'faultstring')||extrairTag(blocoFault,'Reason')||'Falha SOAP')
    :null;
  const falhaSoap=blocoFault!==null;
  const configuracao=/<(?:[A-Za-z_][\w.-]*:)?TConfigUf(?:\s|>)/i.test(corpo);
  const ok=Number(http_status)===200&&!falhaSoap&&codigo==='450'&&configuracao;
  const receitas=[...corpo.matchAll(/<(?:[\w.-]+:)?receita\b[^>]*\bcodigo=["'](\d{6})["']/gi)].map(x=>x[1]);
  const campos=[...new Set([...corpo.matchAll(/<(?:[\w.-]+:)?(exige[A-Za-z]+|detalhamentoReceita|detalhamentosReceita|camposAdicionais|tiposDocumentoOrigem|tipoDocumentoOrigem)\b/gi)].map(x=>x[1]))];
  return {ok,http_status:Number(http_status)||null,uf,receita,codigo_situacao:codigo,
    descricao_situacao:descricao?descricao.slice(0,300):null,
    fault:erroXml?erroXml.replace(/<[^>]*>/g,'').slice(0,300):null,
    falha_soap:falhaSoap,configuracao_presente:configuracao,
    receitas_encontradas:[...new Set(receitas)].slice(0,30),
    campos_identificados:campos.slice(0,60),
    tamanho_resposta:Buffer.byteLength(corpo),retorno_vazio:!corpo.trim()};
}
// HTTP 200 confirma o transporte, nao a aprovacao fiscal. O Portal GNRE pode
// devolver codigo 199 no corpo SOAP, sem HTTP 500 e sem elemento Fault.
function deveConsultarUfSemReceita(analise) {
  if (!analise || analise.ok) return false;
  return analise.codigo_situacao === '199' || analise.falha_soap === true
    || Number(analise.http_status) >= 500;
}
function classificarConfigUf(analise, referenciaUf) {
  if (analise?.ok) return 'receita_confirmada';
  if (analise?.codigo_situacao === '199') {
    if (referenciaUf?.ok) return 'codigo_199_apenas_com_filtro_de_receita';
    if (referenciaUf?.codigo_situacao === '199') return 'codigo_199_nas_duas_consultas';
    return 'codigo_199_validacao_de_comunicacao';
  }
  if (referenciaUf?.ok) return 'falha_especifica_da_receita_ou_configuracao';
  if (referenciaUf) return 'erro_na_receita_e_na_consulta_uf';
  return 'falha_da_consulta';
}

function validarWsdlConfigUf(xml,{permitir443=false}={}) {
  const texto=String(xml||'');
  if(!texto.includes('http://schemas.xmlsoap.org/wsdl/soap12/')
     ||!texto.includes(SOAP_ACTION)||!/name=["']consultar["']/.test(texto)){
    throw Object.assign(new Error('WSDL ConfigUF SOAP 1.2 inesperado'),{code:'GNRE_WSDL_DIVERGENTE'});
  }
  const address=texto.match(/<(?:[A-Za-z_][\w.-]*:)?address\b[^>]*\blocation=["']([^"']+)["']/i)?.[1];
  if(!address)throw Object.assign(new Error('Endpoint nao encontrado no WSDL'),{code:'GNRE_WSDL_SEM_ENDERECO'});
  const url=new URL(address);
  if(url.protocol!=='https:'||!['www.testegnre.pe.gov.br','testegnre.pe.gov.br'].includes(url.hostname)
    ||!(url.port==='444'||(permitir443&&url.port===''))||url.pathname!=='/gnreWS/services/GnreConfigUF'
    ||url.username||url.password||url.search||url.hash){
    throw Object.assign(new Error('Endpoint ConfigUF fora da lista segura'),{code:'GNRE_WSDL_ENDERECO_INVALIDO'});
  }
  return url;
}
module.exports={NS_SERVICO,NS_DADOS,SOAP_ACTION,UF_TESTE,RECEITA_TESTE,RECEITAS_PERMITIDAS,
 montarDadosConfigUf,montarEnvelopeConfigUf,extrairTag,analisarConfigUf,validarWsdlConfigUf,
 deveConsultarUfSemReceita,classificarConfigUf,ENDPOINT_ALTERNATIVO_443};
