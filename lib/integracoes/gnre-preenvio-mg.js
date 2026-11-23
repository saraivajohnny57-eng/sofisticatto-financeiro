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
 const conf=r?.inventario?.config;
 return !!(r&&r.status_http===200&&r.codigo_gnre==='450'&&conf?.ok===true&&
  conf?.receita_localizada===true&&conf.tipos_documento_origem?.some(x=>x.codigo==='10')&&
  conf.obrigatoriedade?.exigeDocumentoOrigem==='S'&&
  conf.obrigatoriedade?.exigeContribuinteEmitente==='S'&&
  conf.obrigatoriedade?.exigeDataVencimento==='S'&&
  conf.obrigatoriedade?.exigeDataPagamento==='S');
}
async function analisar(body){
 const n=body?.nfe||{},f=body?.fiscal||{};
 const c=await configurar();
 const pendencias=[],avisos=[];
 const chave=str(n.chave),cnpj=str(n.cnpjEmitente),nnf=str(n.numero);
 if(!/^\d{44}$/.test(chave)||!cnpjValido(cnpj)||!numero(nnf)||chave.slice(6,20)!==cnpj||
  chave.slice(20,22)!=='55'||Number(chave.slice(25,34))!==Number(nnf))
  pendencias.push('Chave da NF-e, emitente, modelo 55 ou numero inconsistentes.');
 if(n.chaveProtocolo!==chave||n.statusAutorizacao!=='100'||n.ambienteNfe!=='1')
  pendencias.push('Exige NF-e autorizada em producao, protocolo 100 e mesma chave.');
 if(n.ufOrigem!=='GO'||n.ufDestino!=='MG')pendencias.push('Esta preparacao exige NF-e de GO destinada a MG.');
 if(n.consumidorFinal!=='1'||n.indIeDest!=='9')
  pendencias.push('Revisar obrigacao DIFAL: operacao deve ser consumidor final nao contribuinte.');
 const difal=str(n.valorDifal),fcp=str(n.valorFcp);
 if(!valor(difal)||Number(difal)<=0)pendencias.push('NF-e sem DIFAL positivo para receita 100102; nao estimar tributo.');
 if(!valor(fcp))pendencias.push('Valor do FCP ausente ou invalido.');
 if(!/^\d{7}$/.test(str(n.municipioEmitente))||!/^\d{8}$/.test(str(n.cepEmitente))||
  !/^.{1,60}$/.test(str(n.enderecoEmitente)))
  pendencias.push('Endereco do emitente incompleto para a GNRE.');
 const venc=str(f.vencimento),pag=str(f.pagamento),hoje=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 if(!data(venc)||!data(pag))pendencias.push('Datas de vencimento e pagamento validas sao obrigatorias.');
 if(data(pag)&&pag<hoje)pendencias.push('Pagamento previsto para data ja passada.');
 if(data(venc)&&data(pag)&&pag<venc)pendencias.push('Pagamento nao pode ser anterior ao vencimento informado.');
 if(data(venc)&&venc<hoje&&f.atrasoCiente!==true)pendencias.push('Vencimento anterior a hoje: confirmar encargos antes de preparar.');
 const convenio=str(f.convenio);
 if(convenio.length>30||/[\x00-\x1f<>]/.test(convenio))
  pendencias.push('Convenio deve ter ate 30 caracteres validos.');
 if(f.vencimentoConfirmado!==true||f.obrigacaoConfirmada!==true)
  pendencias.push('Responsavel fiscal deve confirmar vencimento legal e obrigacao DIFAL/MG.');
 if(!certificada(c['100102'],'100102'))
  pendencias.push('ConfigUF MG/100102 nao possui confirmacao valida (450) e documento 10 nos arquivos.');
 else{
  const ob=c['100102'].inventario.config.obrigatoriedade||{};
  if(ob.exigeConvenio==='S'&&!convenio)
   avisos.push('Convenio S e opcional segundo manual; se nao aplicavel, elemento sera omitido.');
  if(ob.exigeContribuinteDestinatario==='N')
   avisos.push('Contribuinte destinatario nao exigido para esta receita; elemento omitido.');
  if(ob.exigeValorFecp==='N')
   avisos.push('FCP nao se agrega ao DIFAL 100102. Tratar receita 100129 em guia separada quando devido.');
 }
 if(valor(fcp)&&Number(fcp)>0){
  if(!certificada(c['100129'],'100129'))
   pendencias.push('FCP positivo: consultar ConfigUF MG/100129 e validar detalhamento/valor antes de segunda guia.');
  else{
   avisos.push('FCP positivo exige segunda guia com receita 100129; escolha do detalhamento deve ser confirmada pelo fiscal.');
   pendencias.push('FCP da NF-e ainda sem detalhamento de receita 100129 confirmado para emissao.');
  }
 }
 let sha=null,bytes=null;
 if(pendencias.length===0){
  try{
   const guia=guiaSimples({
    ufFavorecida:'MG',receita:'100102',
    documentoOrigem:nnf,tipoDocumentoOrigem:'10',
    valorPrincipal:difal,dataVencimento:venc,dataPagamento:pag,convenio:convenio||null,
    contribuinte:{cnpj,razaoSocial:str(n.razaoSocialEmitente),
     endereco:str(n.enderecoEmitente),municipio:str(n.municipioEmitente).slice(2),
     uf:'GO',cep:str(n.cepEmitente)}
   });
   const lote=montarLoteGnre([guia]);
   sha=crypto.createHash('sha256').update(lote,'utf8').digest('hex');
   bytes=Buffer.byteLength(lote,'utf8');
  }catch(e){pendencias.push('XML offline nao gerado: '+String(e.message||'Campo fora do contrato').slice(0,180));}
 }
 return {
  ok:true,uf:'MG',numero_nfe:numero(nnf)?nnf:null,receita:'100102',
  valor_difal:valor(difal)?difal:null,valor_fcp:valor(fcp)?fcp:null,
  configuracao_100102:c['100102']?{consulta_id:c['100102'].id,codigo:c['100102'].codigo_gnre,confirmada:certificada(c['100102'])}:null,
  configuracao_100129:c['100129']?{consulta_id:c['100129'].id,codigo:c['100129'].codigo_gnre,confirmada:certificada(c['100129'])}:null,
  convenio_preenchido:!!convenio,pendencias,avisos,
  lote_xml_offline_preparado:!!sha,hash_sha256:sha,bytes_lote:bytes,
  assinatura_nf_nao_verificada_criptograficamente:true,
  emissao_realizada:false,
  emissao_liberada:false,
  aviso:'Prevalidacao MG sem transmissao fiscal. Primeira emissao exige validacao de XSD, duplicidade, NF-e e regras da UF.'
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
