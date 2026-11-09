'use strict';
// Pre-envio GNRE MG/100102: conferencia somente leitura, SEM qualquer chamada a recepcao.
// Nao substitui autorizacao fiscal, consulta SEFAZ, XSD completo nem recibo oficial.
const {json, exigirAdmin}=require('./_utils');
const {guiaSimples}=require('./gnre-guia-simples-offline');
const {montarPlanoRecepcao}=require('./gnre-recepcao-executor');
const {credenciais}=require('./gnre-certificado');
const repositorio=require('./gnre-idempotencia-repo');

function texto(v){return typeof v==='string'?v.trim():'';}
function dataValida(s){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T00:00:00Z');
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s;
}
function decimal(s){return /^(?:0|[1-9]\d{0,10})\.\d{2}$/.test(s);}
function prepararPreEnvio(dados){
 if(!dados||typeof dados!=='object'||Array.isArray(dados))throw new TypeError('Dados de pre-envio invalidos.');
 const nfe=dados.nfe||{},fiscal=dados.fiscal||{};
 const chave=texto(nfe.chave),numero=texto(nfe.numero),cnpj=texto(nfe.cnpjEmitente);
 const municipioIBGE=texto(nfe.municipioEmitente);
 const valor=texto(nfe.valorDifal),fcp=texto(nfe.valorFcp);
 const ufOrigem=texto(nfe.ufOrigem),ufDestino=texto(nfe.ufDestino);
 const endereco=texto(nfe.enderecoEmitente),cep=texto(nfe.cepEmitente);
 if(!/^\d{44}$/.test(chave)||!/^\d{1,9}$/.test(numero)||!/^\d{14}$/.test(cnpj))
   throw new TypeError('Chave, numero ou CNPJ da NF-e invalidos.');
 if(chave.slice(6,20)!==cnpj||Number(chave.slice(25,34))!==Number(numero)||chave.slice(20,22)!=='55')
   throw new TypeError('A chave da NF-e nao corresponde ao emitente, modelo 55 ou numero informado.');
 if(texto(nfe.chaveProtocolo)!==chave||texto(nfe.statusAutorizacao)!=='100'||texto(nfe.ambienteNfe)!=='1')
   throw new TypeError('A NF-e deve conter protocolo de autorizacao 100 em producao e chave coincidente.');
 if(ufDestino!=='MG'||ufOrigem!=='GO'||texto(nfe.consumidorFinal)!=='1'||texto(nfe.indIeDest)!=='9')
   throw new TypeError('Pre-envio disponivel apenas para venda GO -> MG a consumidor final nao contribuinte.');
 if(!/^\d{7}$/.test(municipioIBGE)||!/^.{1,60}$/.test(endereco)||!/^\d{8}$/.test(cep))
   throw new TypeError('Endereco do emitente incompleto ou fora do formato do XSD GNRE.');
 if(!decimal(valor)||Number(valor)<=0||!decimal(fcp))
   throw new TypeError('Valores DIFAL/FCP invalidos ou ausentes no total autorizado da NF-e.');
 const pendencias=[];
 const vencimento=texto(fiscal.vencimento),pagamento=texto(fiscal.pagamento),convenio=texto(fiscal.convenio);
 if(!dataValida(vencimento))pendencias.push('Informar vencimento legal confirmado para MG.');
 if(!dataValida(pagamento))pendencias.push('Informar data prevista de pagamento.');
 if(!convenio||convenio.length>30||/[\x00-\x1f<>]/.test(convenio))
   pendencias.push('Informar convenio/protocolo fiscal confirmado (ate 30 caracteres).');
 if(fiscal.vencimentoConfirmado!==true)pendencias.push('Confirmar vencimento com a regra fiscal aplicavel.');
 if(fiscal.convenioConfirmado!==true)pendencias.push('Confirmar numero do convenio/protocolo com o setor fiscal.');
 if(fiscal.obrigacaoConfirmada!==true)pendencias.push('Confirmar a obrigacao DIFAL desta operacao com o setor fiscal.');
 const resumo={numero_nfe:numero,uf_favorecida:'MG',receita:'100102',
   valor_difal:valor,valor_fcp_nfe:fcp,tipo_documento:'10',tipo_valor:'11',
   tipo_gnre:'0',possui_protocolo_nfe:true};
 if(pendencias.length)return {ok:true,apto_para_revisao:false,pendencias,resumo,transmissao:false};
 const guia=guiaSimples({
  ufFavorecida:'MG',receita:'100102',valorPrincipal:valor,
  dataVencimento:vencimento,dataPagamento:pagamento,convenio,
  documentoOrigem:numero,tipoDocumentoOrigem:'10',
  contribuinte:{cnpj,razaoSocial:texto(nfe.razaoSocialEmitente)||undefined,
   endereco,municipio:municipioIBGE.slice(2),uf:ufOrigem,cep}
 });
 const plano=montarPlanoRecepcao([guia]);
 return {ok:true,apto_para_revisao:true,pendencias:[],resumo,plano:{
  destino:plano.destino,servico:plano.servico,guia_quantidade:plano.guias,
  xml_bytes:plano.xml_bytes,lote_sha256:plano.lote_sha256,
  idempotency_key:plano.idempotency_key
 },transmissao:false};
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido.'});
 if(!exigirAdmin(req,res))return;
 if(process.env.GNRE_AMBIENTE!=='homologacao'||!['preview','development'].includes(String(process.env.VERCEL_ENV||'development')))
   return json(res,403,{ok:false,erro:'Pre-envio restrito a Preview em homologacao.',transmissao:false});
 let pre;
 try{pre=prepararPreEnvio(req.body);}
 catch(e){return json(res,400,{ok:false,erro:String(e.message||'Dados invalidos').slice(0,220),transmissao:false});}
 if(!pre.apto_para_revisao)return json(res,200,{...pre,certificado_verificado:false});
 try{
  const [existente,cred]=await Promise.all([repositorio.buscar(pre.plano.idempotency_key),credenciais()]);
  const meta=cred?.meta;
  const cnpjCert=texto(meta?.cnpj);
  const validade=meta?.expirado===false;
  const mesmoCnpj=cnpjCert&&cnpjCert===texto(req.body.nfe.cnpjEmitente);
  const pronto=Boolean(!existente&&validade&&mesmoCnpj
   &&process.env.GNRE_HOMOLOGACAO_EXECUTOR==='1');
  const p=[];
  if(existente)p.push('Lote identico ja registrado na idempotencia; nao repetir envio.');
  if(!validade)p.push('Certificado A1 ainda nao teve validade confirmada neste pre-envio.');
  if(!mesmoCnpj)p.push('CNPJ do certificado A1 nao foi confirmado como igual ao da NF-e.');
  if(process.env.GNRE_HOMOLOGACAO_EXECUTOR!=='1')p.push('Executor de homologacao nao habilitado na Preview.');
  return json(res,200,{...pre,apto_para_revisao:pronto,pendencias:p,
   certificado_verificado:validade&&mesmoCnpj,
   reserva_existente:existente?{estado:existente.estado||'registrado'}:null,
   proximo_passo:pronto?'Revisar dados com responsavel fiscal antes de qualquer transmissao.':'Corrigir pendencias antes de prosseguir.',
   transmissao:false});
 }catch(_erro){
  return json(res,503,{ok:false,apto_para_revisao:false,
   erro:'Nao foi possivel validar certificado e idempotencia no servidor. Nenhum lote foi transmitido.',
   transmissao:false});
 }
}
module.exports=handler;
module.exports.prepararPreEnvio=prepararPreEnvio;
