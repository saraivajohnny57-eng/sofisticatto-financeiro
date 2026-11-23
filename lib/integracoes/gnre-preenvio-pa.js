'use strict';
// Pre-envio PA/100102: construcao OFFLINE de uma guia GNRE de homologacao.
// O lote recebido em 19/11/2026 foi invalidado (403): 217,253,230,235,236.
// Tipo 24 nao e considerado validado para PA/100102: revisar ConfigUF oficial
// antes de autorizar qualquer novo envio. Nao existe reenvio automatico.
// Esta rotina NUNCA faz POST de recepcao, nao cria guia fiscal e nao paga tributos.
const crypto=require('node:crypto');
const {guiaSimples}=require('./gnre-guia-simples-offline');
const {montarLoteGnre}=require('./gnre-lote-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');

function texto(x){return typeof x==='string'?x.trim():'';}
function dataValida(x){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
}
function dinheiro(x){return /^(?:0|[1-9]\d{0,10})\.\d{2}$/.test(x);}
function sha(x){return crypto.createHash('sha256').update(x,'utf8').digest('hex');}
const TIPO_DOC='10';
const RECEITA='100102';
const UF='PA';
function montarGuiaPa(n,f){
 return guiaSimples({
  ufFavorecida:UF,receita:RECEITA,valorPrincipal:texto(n.valorDifal),
  dataVencimento:texto(f.vencimento),dataPagamento:texto(f.pagamento),
  documentoOrigem:texto(n.numero),tipoDocumentoOrigem:TIPO_DOC,
  camposExtras:[{codigo:'101',valor:texto(n.chave)}],
  referencia:{periodo:'0',mes:texto(n.dataEmissao).slice(5,7),ano:texto(n.dataEmissao).slice(0,4)},
  contribuinteDestinatario:{
   ...(texto(n.cpfDestinatario)?{cpf:texto(n.cpfDestinatario)}:{cnpj:texto(n.cnpjDestinatario)}),
   razaoSocial:texto(n.razaoSocialDestinatario),
   municipio:texto(n.municipioDestinatario).slice(2)
  },
  convenio:texto(f.convenio)||null,
  contribuinte:{
   cnpj:texto(n.cnpjEmitente),
   razaoSocial:texto(n.razaoSocialEmitente)||undefined,
   endereco:texto(n.enderecoEmitente),
   municipio:texto(n.municipioEmitente).slice(2),
   uf:texto(n.ufOrigem),cep:texto(n.cepEmitente)
  }
 });
}
function prepararPreEnvioPa(dados){
 if(!dados||typeof dados!=='object'||Array.isArray(dados))throw new TypeError('Dados GNRE invalidos.');
 const n=dados.nfe||{},f=dados.fiscal||{};
 const chave=texto(n.chave),num=texto(n.numero),cnpj=texto(n.cnpjEmitente);
 const mun=texto(n.municipioEmitente),cep=texto(n.cepEmitente);
 const valor=texto(n.valorDifal),fcp=texto(n.valorFcp);
 const ufOrigem=texto(n.ufOrigem),ufDestino=texto(n.ufDestino);
 if(!/^\d{44}$/.test(chave)||!/^[0-9]{14}$/.test(cnpj)||!/^\d{1,9}$/.test(num))
  throw new TypeError('Chave, CNPJ ou numero da NF-e invalidos.');
 if(chave.slice(6,20)!==cnpj||chave.slice(20,22)!=='55'||Number(chave.slice(25,34))!==Number(num))
  throw new TypeError('Chave NF-e nao corresponde ao CNPJ, numero ou modelo 55.');
 if(texto(n.chaveProtocolo)!==chave||texto(n.statusAutorizacao)!=='100'||texto(n.ambienteNfe)!=='1')
  throw new TypeError('NF-e deve ser autorizada em producao, status 100 e protocolo correspondente.');
 if(ufOrigem!=='GO'||ufDestino!=='PA'||texto(n.consumidorFinal)!=='1'||texto(n.indIeDest)!=='9')
  throw new TypeError('Este pre-envio se limita a GO -> PA, consumidor final nao contribuinte.');
 if(!/^\d{7}$/.test(mun)||!/^\d{8}$/.test(cep)
   ||!/^[^\x00-\x1f<>]{1,60}$/.test(texto(n.enderecoEmitente)))
  throw new TypeError('Endereco/Codigo IBGE do emitente incompleto para o XML GNRE.');
 if(!dinheiro(valor)||Number(valor)<=0||!dinheiro(fcp))
  throw new TypeError('Valores DIFAL/FCP invalidos.');
 const pendencias=[];
 if(!/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-[0-3][0-9]$/.test(texto(n.dataEmissao)))
  pendencias.push('Data de emissao da NF-e ausente/invalidada para referencia GNRE.');
 if(!((/^[0-9]{11}$/.test(texto(n.cpfDestinatario))&&!texto(n.cnpjDestinatario)) ||
      (/^[0-9]{14}$/.test(texto(n.cnpjDestinatario))&&!texto(n.cpfDestinatario))) ||
    !/^[^<>\x00-\x1f]{1,60}$/.test(texto(n.razaoSocialDestinatario)) ||
    !/^15[0-9]{5}$/.test(texto(n.municipioDestinatario)))
  pendencias.push('Identificacao, razao social ou codigo IBGE do destinatario PA incompletos.');
 // Tipo 10/Nota Fiscal validado na ConfigUF oficial PA/100102 em producao.

 if(fcp!=='0.00')
  pendencias.push('FCP diferente de zero: exige tratamento fiscal separado; nao agregar ao DIFAL 100102.');
 const vencimento=texto(f.vencimento),pagamento=texto(f.pagamento),convenio=texto(f.convenio);
 if(!dataValida(vencimento))pendencias.push('Informar vencimento legal da receita PA/100102.');
 if(!dataValida(pagamento))pendencias.push('Informar data prevista de pagamento.');
 if(dataValida(vencimento)&&vencimento<new Date().toISOString().slice(0,10)&&
    !(f.vencimentoAtrasadoConfirmado===true&&f.encargosAtrasoCientes===true&&dataValida(pagamento)&&pagamento>=new Date().toISOString().slice(0,10)&&pagamento>=vencimento))
  pendencias.push('Vencimento anterior a hoje: conferir encargos e data legal antes de emitir.');
 if(dataValida(pagamento)&&pagamento<new Date().toISOString().slice(0,10))
  pendencias.push('Data prevista de pagamento ja passou.');
 if(convenio&&(convenio.length>30||/[\x00-\x1f<>]/.test(convenio)))
  pendencias.push('Convenio opcional invalido.');
 if(f.vencimentoConfirmado!==true)
  pendencias.push('Responsavel fiscal precisa confirmar vencimento PA.');
 if(f.obrigacaoConfirmada!==true)
  pendencias.push('Responsavel fiscal precisa confirmar obrigacao de DIFAL por operacao.');
 if(convenio&&f.convenioConfirmado!==true)
  pendencias.push('Convenio informado precisa ser confirmado pelo fiscal.');
 const resumo={numero_nfe:num,uf_origem:ufOrigem,uf_favorecida:UF,
  receita:RECEITA,valor_difal:valor,valor_fcp_nfe:fcp,
  tipo_documento:TIPO_DOC,origem_documento:'numero da NF-e 51185',campo_adicional_nfe:'101 - chave NF-e (44 digitos)',
  detalhamento_receita:'nao_aplicavel',campos_adicionais:'101_chave_nfe',
  emissao_liberada:false};
 if(pendencias.length)return {ok:true,apto_para_revisao:false,resumo,pendencias,transmissao:false};
 // Tipo 10: documento origem e numero da NF; chave fica no campo adicional 101.
 const guia=montarGuiaPa(n,f);
 // Nao acrescentar 0303: nao aparece nos detalhamentos/campos adicionais do PA.
 const lote=montarLoteGnre([guia]);
 const envelope=montarEnvelopeSoap12({servico:'recepcao',xmlDados:lote});
 return {ok:true,apto_para_revisao:true,resumo,pendencias:[],
  plano:{guia_quantidade:1,ambiente:'preparacao_offline',
   lote_sha256:sha(lote),envelope_sha256:sha(envelope),xml_bytes:Buffer.byteLength(envelope),
   tipo_documento:TIPO_DOC,transmissao_habilitada:false},
  transmissao:false};
}
module.exports={prepararPreEnvioPa,montarGuiaPa,TIPO_DOC,RECEITA,UF};
