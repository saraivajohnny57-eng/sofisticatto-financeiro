'use strict';
// Geração OFFLINE de TDadosGNRE 2.00. A aceitação pela SEFAZ exige
// validação XSD e regras tributárias estaduais adicionais.
const { cnpjValido, cpfValido } = require('./gnre-documento-fiscal');
function texto(v, nome, re) {
  const s = String(v == null ? '' : v);
  if (!re.test(s)) throw new TypeError('Campo GNRE inválido: ' + nome);
  return s;
}
function validarData(valor,nome) {
  const s=texto(valor,nome,/^\d{4}-\d{2}-\d{2}$/);
  const d=new Date(s+'T00:00:00Z');
  if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==s)throw new TypeError('Data GNRE invalida: '+nome);
  return s;
}
function xmlSeguro(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function cnpjDoContribuinte(valor) {
  const s = texto(valor, 'CNPJ', /^[0-9]{14}$/);
  if (!cnpjValido(s)) throw new TypeError('CNPJ do contribuinte com dígito verificador inválido');
  return s;
}

function cpfDoContribuinte(valor) {
  const s = texto(valor, 'CPF', /^[0-9]{11}$/);
  if (!cpfValido(s)) throw new TypeError('CPF do contribuinte com dígito verificador inválido');
  return s;
}

function guiaSimples({ ufFavorecida, receita, detalhamentoReceita = null, valorPrincipal, dataVencimento,
  dataPagamento = null, convenio = null, tipoValor = null, tipoGnre = '0',
  contribuinte, documentoOrigem, tipoDocumentoOrigem }) {
  const uf = texto(ufFavorecida, 'ufFavorecida', /^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/);
  const tipo = texto(tipoGnre, 'tipoGnre', /^0$/);
  const cod = texto(receita, 'receita', /^[0-9]{6}$/);
  // O detalhe e opcional no XSD, mas pode ser obrigatorio pela configuracao da receita/UF.
  // Nao inferir o codigo: deve vir da consulta ConfigUF fiscal validada.
  const detalheXml = detalhamentoReceita == null ? '' :
    '<detalhamentoReceita>' + texto(detalhamentoReceita, 'detalhamentoReceita', /^[0-9]{6}$/) + '</detalhamentoReceita>';
  const valor = texto(valorPrincipal, 'valorPrincipal', /^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/);
  const data = validarData(dataVencimento,'dataVencimento');
  const pagamento = dataPagamento==null?null:validarData(dataPagamento,'dataPagamento');
  const conv=convenio==null?null:texto(convenio,'convenio',/^[^\x00-\x1f]{1,30}$/u).trim();
  if(convenio!=null&&!conv)throw new TypeError('Campo GNRE invalido: convenio');
  // Codigo de valor do XSD v2.00: 11=principal ICMS; 12=principal FCP.
  const tipoPadrao=['100129','100137'].includes(cod)?'12':'11';
  const tipoValorFinal=tipoValor==null?tipoPadrao:texto(tipoValor,'tipoValor',/^(11|12)$/);
  if(uf==='MG'&&cod==='100129'){
    if(!['000051','000052'].includes(detalhamentoReceita))
      throw new TypeError('MG/100129 exige detalhamentoReceita 000051 ou 000052 confirmado no ConfigUF');
    if(!contribuinte||typeof contribuinte!=='object'||Array.isArray(contribuinte))
      throw new TypeError('MG/100129 exige contribuinteEmitente');
    if(tipoDocumentoOrigem!=='10'||!documentoOrigem)
      throw new TypeError('MG/100129 exige documentoOrigem tipo 10 (nota fiscal)');
    if(!pagamento)throw new TypeError('MG/100129 exige dataPagamento');
    if(!conv)throw new TypeError('MG/100129 exige convenio confirmado');
    if(tipoValorFinal!=='12')throw new TypeError('MG/100129 exige valor principal FCP tipo 12');
    for(const campo of ['endereco','municipio','uf','cep'])
      if(!contribuinte[campo])throw new TypeError('MG/100129 exige endereco do contribuinte: '+campo);
  }
  let xmlContribuinte = '';
  if (contribuinte != null) {
    if (typeof contribuinte !== 'object' || Array.isArray(contribuinte)) throw new TypeError('Contribuinte inválido');
    const temCnpj = contribuinte.cnpj != null;
    const temCpf = contribuinte.cpf != null;
    if (temCnpj === temCpf) throw new TypeError('Informe CPF ou CNPJ do contribuinte, não ambos');
    const id = temCnpj
      ? '<CNPJ>' + cnpjDoContribuinte(contribuinte.cnpj) + '</CNPJ>'
      : '<CPF>' + cpfDoContribuinte(contribuinte.cpf) + '</CPF>';
    let razao = '';
    if (contribuinte.razaoSocial != null) {
      const nome = texto(contribuinte.razaoSocial, 'razaoSocial', /^.{1,60}$/u);
      razao = '<razaoSocial>' + xmlSeguro(nome) + '</razaoSocial>';
    }
    const camposEndereco=[
      ['endereco', /^.{1,60}$/u, true],
      ['municipio', /^[0-9]{5}$/, false],
      ['uf', /^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/, false],
      ['cep', /^[0-9]{8}$/, false],
      ['telefone', /^[0-9]{6,11}$/, false]
    ];
    let enderecoXml='';
    for(const [campo, formato, escape] of camposEndereco){
      if(contribuinte[campo]!=null){
        const value=texto(contribuinte[campo],campo,formato);
        enderecoXml+='<'+campo+'>'+(escape?xmlSeguro(value):value)+'</'+campo+'>';
      }
    }
    xmlContribuinte = '<contribuinteEmitente><identificacao>' + id + '</identificacao>' + razao + enderecoXml + '</contribuinteEmitente>';
  }
  let xmlDocumento = '';
  if (documentoOrigem != null || tipoDocumentoOrigem != null) {
    const numero = texto(documentoOrigem, 'documentoOrigem', /^(?:[0-9]{1,18}|[0-9]{2}BR[0-9]{11}|[0-9]{6}[A-Z0-9]{12}[0-9]{26})$/);
    const tipoDoc = texto(tipoDocumentoOrigem, 'tipoDocumentoOrigem', /^[0-9]{2}$/);
    xmlDocumento = '<documentoOrigem tipo="' + tipoDoc + '">' + numero + '</documentoOrigem>';
  }
  return '<TDadosGNRE versao="2.00"><ufFavorecida>' + uf
    + '</ufFavorecida><tipoGnre>' + tipo
    + '</tipoGnre>' + xmlContribuinte + '<itensGNRE><item><receita>' + cod
    + '</receita>' + detalheXml + xmlDocumento + '<dataVencimento>' + data
    + '</dataVencimento><valor tipo="' + tipoValorFinal + '">' + valor
    + '</valor>' + (conv?'<convenio>'+xmlSeguro(conv)+'</convenio>':'')
    + '</item></itensGNRE><valorGNRE>' + valor + '</valorGNRE>'
    + (pagamento?'<dataPagamento>'+pagamento+'</dataPagamento>':'') + '</TDadosGNRE>';
}
module.exports = { guiaSimples };
