'use strict';
// GNRE MG: preparar XML de DIFAL em memoria e auditar requisitos.
// NAO transmite, NAO grava guias ou reservas; depende de NF-e autorizada.
const crypto=require('node:crypto');
const {exigirAdmin,json,supabaseRest}=require('./_utils');
const {guiaSimples}=require('./gnre-guia-simples-offline');
const {montarLoteGnre}=require('./gnre-lote-xml');
const {cnpjValido}=require('./gnre-documento-fiscal');
const UF='MG',RECEITA='100102';
function str(x){return String(x??'').trim();}
function data(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(str(s)))return false;const dt=new Date(s+'T00:00:00Z');return !Number.isNaN(dt.valueOf())&&dt.toISOString().slice(0,10)===s;}
function numero(s){return /^\d{1,9}$/.test(str(s));}
function valor(s){return /^(?:0|[1-9]\d{0,10})\.\d{2}$/.test(str(s));}
async function configurar(){
 const rows=await supabaseRest('gnre_config_uf_consultas',{
  query:'?uf=eq.MG&receita=in.(100102,100129)&ambiente=eq.producao&select=id,receita,codigo_gnre,status_http,inventario,criado_em&order=criado_em.desc&limit=20'
 });
 const map={};for(const row of rows||[])if(!map[row.receita])map[row.receita]=row;
 return map;
}
function certificada(r,codigo){
 const conf=r?.inventario?.config,ob=conf?.obrigatoriedade||{};
 if(!(r&&r.status_http===200&&r.codigo_gnre==='450'&&conf?.ok===true
 &&conf.receita_localizada===true&&ob.exigeContribuinteEmitente==='S'
 &&ob.exigeDataVencimento==='S'&&ob.exigeDataPagamento==='S'
 &&ob.exigeDetalhamentoReceita==='N'))return false;
 if(codigo==='100102')
  return ob.exigeDocumentoOrigem==='S'&&ob.exigePeriodoReferencia==='N'
   &&ob.exigeConvenio==='S'&&
    conf.tipos_documento_origem?.some(x=>x.codigo==='10');
 if(codigo==='100129')
  return ob.exigeDocumentoOrigem==='N'&&ob.exigePeriodoReferencia==='S'
   &&ob.exigeConvenio==='O'&&!conf.tipos_documento_origem?.length;
 return false;
}
function referencia(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const periodo=str(v.periodo),mes=str(v.mes),ano=str(v.ano);
 if(!/^[0-5]$/.test(periodo)||!/^(0[1-9]|1[0-2])$/.test(mes)||!/^20\d{2}$/.test(ano))return null;
 return {periodo,mes,ano};
}
async function analisar(body){
 const n=body?.nfe||{},f=body?.fiscal||{},c=await configurar();
 const pendencias=[],pendenciasFcp=[],avisos=[];
 const chave=str(n.chave),cnpj=str(n.cnpjEmitente),nnf=str(n.numero);
 const dataEmissao=str(n.dataEmissao).slice(0,10);
 if(!/^\d{44}$/.test(chave)||!cnpjValido(cnpj)||!numero(nnf)
 ||chave.slice(6,20)!==cnpj||chave.slice(20,22)!=='55'
 ||Number(chave.slice(25,34))!==Number(nnf))
  pendencias.push('Chave da NF-e, emitente, modelo 55 ou numero inconsistentes.');
 if(n.chaveProtocolo!==chave||n.statusAutorizacao!=='100'||n.ambienteNfe!=='1')
  pendencias.push('Exige NF-e autorizada em producao, protocolo 100 e mesma chave.');
 if(n.ufOrigem!=='GO'||n.ufDestino!=='MG')pendencias.push('Preparo exclusivo de NF-e GO destinada a MG.');
 if(n.consumidorFinal!=='1'||n.indIeDest!=='9')
  pendencias.push('Revisar obrigacao DIFAL: operacao deve ser consumidor final nao contribuinte.');
 const difal=str(n.valorDifal),fcp=str(n.valorFcp),fcpPositivo=valor(fcp)&&Number(fcp)>0;
 if(!valor(difal)||Number(difal)<=0)pendencias.push('DIFAL da NF-e ausente ou nao positivo; nao estimar tributo.');
 if(!valor(fcp))pendencias.push('FCP da NF-e ausente ou invalido.');
 if(!data(dataEmissao))pendencias.push('Emissao da NF-e sem data validada.');
 if(!/^\d{7}$/.test(str(n.municipioEmitente))||!/^\d{8}$/.test(str(n.cepEmitente))
 ||!/^.{1,60}$/.test(str(n.enderecoEmitente)))
  pendencias.push('Endereco do emitente incompleto para GNRE MG.');
 const hoje=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 const venc=str(f.vencimento),pag=str(f.pagamento);
 if(!data(venc)||!data(pag))pendencias.push('Datas de vencimento e pagamento DIFAL obrigatorias.');
 if(data(pag)&&pag<hoje)pendencias.push('Data de pagamento DIFAL ja passou.');
 if(data(venc)&&data(pag)&&pag<venc)pendencias.push('Pagamento DIFAL anterior ao vencimento.');
 if(data(venc)&&venc<hoje&&f.atrasoCiente!==true)
  pendencias.push('DIFAL vencido: conferir encargos e confirmar atraso.');
 const convenio=str(f.convenio);
 if(convenio.length>30||/[\x00-\x1f<>]/.test(convenio))
  pendencias.push('Convenio DIFAL com formato invalido.');
 if(f.vencimentoConfirmado!==true||f.obrigacaoConfirmada!==true)
  pendencias.push('Responsavel fiscal deve confirmar obrigacao DIFAL e vencimento MG.');
 if(!certificada(c['100102'],'100102'))
  pendencias.push('ConfigUF MG/100102 incompleta ou divergente do contrato de 24/11/2026.');
 else avisos.push('100102: documento origem nota fiscal tipo 10. Convenio S e opcional; sem campos adicionais, destinatario e referencia.');
 const vencFcp=str(f.vencimentoFcp),pagFcp=str(f.pagamentoFcp),
  convFcp=str(f.convenioFcp),refFcp=referencia(f.referenciaFcp);
 if(fcpPositivo){
  if(!certificada(c['100129'],'100129'))
   pendenciasFcp.push('ConfigUF MG/100129 nao confirmada: requer convenio O, referencia S e documento origem N.');
  if(!convFcp||convFcp.length>30||/[\x00-\x1f<>]/.test(convFcp)
   ||f.convenioFcpConfirmado!==true)
   pendenciasFcp.push('100129 exige convenio/protocolo fiscal confirmado (O=obrigatorio).');
  if(!refFcp||f.referenciaFcpConfirmada!==true)
   pendenciasFcp.push('100129 exige periodo/mes/ano de referencia confirmados pelo fiscal.');
  if(!data(vencFcp)||!data(pagFcp)||f.vencimentoFcpConfirmado!==true)
   pendenciasFcp.push('100129 exige vencimento e pagamento proprios confirmados.');
  if(data(pagFcp)&&pagFcp<hoje)pendenciasFcp.push('Pagamento FCP previsto para data passada.');
  if(data(vencFcp)&&data(pagFcp)&&pagFcp<vencFcp)
   pendenciasFcp.push('Pagamento FCP anterior ao vencimento.');
  if(data(vencFcp)&&vencFcp<hoje&&f.atrasoCiente!==true)
   pendenciasFcp.push('FCP vencido: confirmar juros/multa e encargos.');
  avisos.push('100129/FCP: receita confirmada; nao exige documento de origem nem detalhamento; exige referencia e convenio obrigatorio.');
 }
 let guiaDifal=null,guiaFcp=null,sha=null,hashDifal=null,bytes=null;
 const emitente={cnpj,razaoSocial:str(n.razaoSocialEmitente),
  endereco:str(n.enderecoEmitente),municipio:str(n.municipioEmitente).slice(2),
  uf:'GO',cep:str(n.cepEmitente)};
 if(pendencias.length===0){
  try{
   guiaDifal=guiaSimples({ufFavorecida:'MG',receita:'100102',
    documentoOrigem:nnf,tipoDocumentoOrigem:'10',valorPrincipal:difal,
    dataVencimento:venc,dataPagamento:pag,convenio:convenio||null,
    contribuinte:emitente});
   hashDifal=crypto.createHash('sha256').update(montarLoteGnre([guiaDifal]),'utf8').digest('hex');
  }catch(e){pendencias.push('XML offline DIFAL nao preparado: '+String(e.message||'XML invalido').slice(0,180));}
 }
 if(fcpPositivo&&pendencias.length===0&&pendenciasFcp.length===0){
  try{
   guiaFcp=guiaSimples({ufFavorecida:'MG',receita:'100129',valorPrincipal:fcp,
    dataVencimento:vencFcp,dataPagamento:pagFcp,convenio:convFcp,
    contribuinte:emitente,referencia:refFcp});
  }catch(e){pendenciasFcp.push('XML offline FCP nao preparado: '+String(e.message||'XML invalido').slice(0,180));}
 }
 if(guiaDifal&&(!fcpPositivo||guiaFcp)&&pendencias.length===0&&pendenciasFcp.length===0){
  const lote=montarLoteGnre(guiaFcp?[guiaDifal,guiaFcp]:[guiaDifal]);
  sha=crypto.createHash('sha256').update(lote,'utf8').digest('hex');
  bytes=Buffer.byteLength(lote,'utf8');
 }
 return {
  ok:true,uf:'MG',numero_nfe:numero(nnf)?nnf:null,receita:'100102',
  valor_difal:valor(difal)?difal:null,valor_fcp:valor(fcp)?fcp:null,
  cotacao_principal_somado:valor(difal)&&valor(fcp)?(Number(difal)+Number(fcp)).toFixed(2):null,
  configuracao_100102:c['100102']?{consulta_id:c['100102'].id,codigo:c['100102'].codigo_gnre,confirmada:certificada(c['100102'],'100102')}:null,
  configuracao_100129:c['100129']?{consulta_id:c['100129'].id,codigo:c['100129'].codigo_gnre,confirmada:certificada(c['100129'],'100129')}:null,
  periodo_nfe_emissao:dataEmissao||null,
  guias_requeridas:fcpPositivo?2:1,guias_preparadas:Number(!!guiaDifal)+Number(!!guiaFcp),
  pendencias:[...pendencias,...pendenciasFcp],pendencias_difal:pendencias,pendencias_fcp:pendenciasFcp,avisos,
  xml_difal_preparado:!!guiaDifal,xml_fcp_preparado:!!guiaFcp,
  lote_xml_offline_preparado:!!sha,hash_sha256:sha,hash_sha256_difal:hashDifal,
  bytes_lote:bytes,assinatura_nf_nao_verificada_criptograficamente:true,
  emissao_realizada:false,emissao_liberada:false,transmissao:false,
  aviso:'Conferencia fiscal MG offline. Nao envia guias. Verificar XSD, duplicidades, obrigacoes e dados fiscais antes de habilitar emissao real.'
 };
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao autorizado'});
 if(!exigirAdmin(req,res))return;
 if(JSON.stringify(req.body||{}).length>35000)return json(res,413,{ok:false,erro:'Dados de NF-e muito grandes'});
 try{return json(res,200,await analisar(req.body));}
 catch(e){return json(res,422,{ok:false,erro:'Conferencia de MG indisponivel: '+String(e.message||'erro').slice(0,120)});}
}
module.exports=handler;module.exports.analisar=analisar;
