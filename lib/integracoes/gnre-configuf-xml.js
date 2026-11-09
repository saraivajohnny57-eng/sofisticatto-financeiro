'use strict';
// GNRE ConfigUF: contrato de consulta somente leitura (SOAP 1.2).
// O WSDL define gnreDadosMsg com s:any: TConsultaConfigUf e elemento XML,
// NÃO texto escapado (&lt;TConsultaConfigUf...).
const NS_SERVICO = 'http://www.gnre.pe.gov.br/webservice/GnreConfigUF';
const NS_DADOS = 'http://www.gnre.pe.gov.br';
const SOAP_ACTION = NS_SERVICO + '/consultar';
const UF_TESTE = 'MG';
const RECEITA_TESTE = '100129';

function montarDadosConfigUf({uf=UF_TESTE, receita=RECEITA_TESTE}={}) {
  if (uf !== UF_TESTE) throw new TypeError('Esta rotina somente consulta a UF MG em homologacao');
  if (receita !== null && receita !== RECEITA_TESTE)
    throw new TypeError('A receita de teste deve ser 100129 ou omitida');
  const filtro = receita === null ? '' : '<receita>' + receita + '</receita>';
  return '<TConsultaConfigUf xmlns="' + NS_DADOS + '">'
    + '<ambiente>2</ambiente><uf>' + uf + '</uf>' + filtro
    + '</TConsultaConfigUf>';
}

function montarEnvelopeConfigUf(opcoes={}) {
  const dados = montarDadosConfigUf(opcoes);
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + '<soap12:Header><gnreCabecMsg xmlns="' + NS_SERVICO + '"><versaoDados>1.00</versaoDados></gnreCabecMsg></soap12:Header>'
    + '<soap12:Body><gnreDadosMsg xmlns="' + NS_SERVICO + '">' + dados
    + '</gnreDadosMsg></soap12:Body></soap12:Envelope>';
}

function extrairTag(xml, tag) {
  const re = new RegExp('<(?:[A-Za-z_][\\w.-]*:)?' + tag
    + '(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*<\\/(?:[A-Za-z_][\\w.-]*:)?'
    + tag + '\\s*>','i');
  const match = String(xml || '').match(re);
  return match ? match[1].trim() : null;
}

function analisarConfigUf({http_status, xml, uf=UF_TESTE, receita=RECEITA_TESTE}={}) {
  const corpo = String(xml || '');
  const blocoFault = extrairTag(corpo,'Fault');
  const situacao = extrairTag(corpo,'situacaoConsulta');
  const codigo = situacao ? extrairTag(situacao,'codigo') : null;
  const descricao = situacao ? extrairTag(situacao,'descricao') : null;
  const erroXml = blocoFault
    ? (extrairTag(blocoFault,'Text') || extrairTag(blocoFault,'faultstring') || extrairTag(blocoFault,'Reason') || 'Falha SOAP')
    : null;
  const falhaSoap = blocoFault !== null;
  const configuracao = /<(?:[A-Za-z_][\\w.-]*:)?TConfigUf(?:\\s|>)/i.test(corpo);
  const ok = Number(http_status) === 200 && !falhaSoap && codigo === '450' && configuracao;
  const receitas = [...corpo.matchAll(/<(?:[\\w.-]+:)?receita\\b[^>]*\\bcodigo=["'](\\d{6})["']/gi)].map(x=>x[1]);
  const campos = [...new Set([...corpo.matchAll(/<(?:[\\w.-]+:)?(exige[A-Za-z]+|detalhamentoReceita|detalhamentosReceita|camposAdicionais|tiposDocumentoOrigem|tipoDocumentoOrigem)\\b/gi)].map(x=>x[1]))];
  return {
    ok, http_status:Number(http_status)||null, uf, receita, codigo_situacao:codigo,
    descricao_situacao:descricao ? descricao.slice(0,300) : null,
    fault:erroXml ? erroXml.replace(/<[^>]*>/g,'').slice(0,300) : null,
    falha_soap:falhaSoap, configuracao_presente:configuracao,
    receitas_encontradas:[...new Set(receitas)].slice(0,30),
    campos_identificados:campos.slice(0,60),
    tamanho_resposta:Buffer.byteLength(corpo),
    retorno_vazio:!corpo.trim()
  };
}

function validarWsdlConfigUf(xml) {
  const texto=String(xml||'');
  if (!/http:\/\/schemas\.xmlsoap\.org\/wsdl\/soap12\//.test(texto)
      || !texto.includes(SOAP_ACTION)
      || !/name=["']consultar["']/.test(texto)) {
    throw Object.assign(new Error('WSDL ConfigUF SOAP 1.2 inesperado; consulta nao efetuada'),{code:'GNRE_WSDL_DIVERGENTE'});
  }
  const address = texto.match(/<(?:[A-Za-z_][\\w.-]*:)?address\\b[^>]*\\blocation=["']([^"']+)["']/i)?.[1];
  if (!address) throw Object.assign(new Error('Endpoint nao encontrado no WSDL'),{code:'GNRE_WSDL_SEM_ENDERECO'});
  const url=new URL(address);
  if (url.protocol!=='https:' || url.hostname!=='www.testegnre.pe.gov.br'
      || url.port!=='444' || url.pathname!=='/gnreWS/services/GnreConfigUF'
      || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('Endereco ConfigUF nao permitido pelo projeto'),{code:'GNRE_WSDL_ENDERECO_INVALIDO'});
  }
  return url;
}
module.exports={NS_SERVICO,NS_DADOS,SOAP_ACTION,UF_TESTE,RECEITA_TESTE,
  montarDadosConfigUf,montarEnvelopeConfigUf,extrairTag,analisarConfigUf,validarWsdlConfigUf};
