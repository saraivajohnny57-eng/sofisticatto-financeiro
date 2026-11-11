'use strict';
// Tenta RECUPERAR PDF OFICIAL da GNRE já processada em HOMOLOGACAO.
// Consulta SOAP (GnreResultadoLote), nunca recepcao ou geracao de nova guia.
// Solicitacao opcional incluirPDFGuias=S conforme Manual GNRE v2.09.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterReciboParaConsulta}=require('./gnre-idempotencia-repo');
const {credenciais}=require('./gnre-certificado');
const {SERVICOS}=require('./gnre-contrato');
const {montarConsultaReciboComPdf}=require('./gnre-consulta-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno,textoTag}=require('./gnre-interpretar-resultado');
const {conferirResultadoIndividual}=require('./gnre-conferencia-individual');
const {pilotoHabilitado}=require('./gnre-exportar-retorno-51109');

function decodificarPdfOficial(b64){
 if(typeof b64!=='string')return null;
 const base64=b64.replace(/\s/g,'');
 if(base64.length<136||base64.length>3700000||base64.length%4!==0
   ||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return null;
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<100||bytes.length>2800000
   ||bytes.subarray(0,5).toString('ascii')!=='%PDF-'
   ||!bytes.subarray(Math.max(0,bytes.length-256)).toString('latin1').includes('%%EOF'))
  return null;
 return bytes;
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido.'});
 if(!exigirAdmin(req,res))return;
 if(req.body?.piloto_mg_51109!==true||!pilotoHabilitado())
  return json(res,403,{ok:false,erro:'Consulta de PDF permitida somente no piloto MG 51109 da Preview.'});
 const chave='gnre:recepcao:'+String(process.env.GNRE_PILOTO_51109_LOTE_SHA256).slice(0,32);
 try{
  const [recibo,refs]=await Promise.all([
   obterReciboParaConsulta(chave),
   supabaseRest('gnre_guias_arquivo',{
    query:'?chave_idempotencia=eq.'+encodeURIComponent(chave)
     +'&ambiente=eq.homologacao'
     +'&select=id,chave_nfe,numero_nfe,receita,uf_favorecida,valor_principal,ambiente,situacao,pdf_base64&limit=1'
   })
  ]);
  const ref=Array.isArray(refs)?refs[0]:null;
  if(!recibo||!ref||String(ref.numero_nfe)!=='51109'||String(ref.receita)!=='100102')
   return json(res,409,{ok:false,erro:'Recibo ou referencia do lote de homologacao nao localizados.'});
  const cred=await credenciais();
  const xml=montarEnvelopeSoap12({servico:'consulta',xmlDados:montarConsultaReciboComPdf(recibo)});
  const resposta=await enviarSoap({
   destino:SERVICOS.resultado,soapAction:SOAP_ACTIONS.consulta,
   xml,certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert},
   maxRespostaBytes:4*1024*1024,timeoutMs:30000
  });
  if(resposta.status!==200||!resposta.analise?.ok)
   return json(res,502,{ok:false,erro:'Consulta GNRE com incluirPDFGuias nao foi confirmada.',transmissao:false});
  const fiscal=interpretarRetorno(resposta.body,recibo);
  const conferencia=conferirResultadoIndividual(fiscal,ref);
  if(!conferencia.confirmado)
   return json(res,409,{ok:false,
    erro:'Retorno individual nao conciliado com a NF-e 51109; PDF bloqueado.',
    pendencias:conferencia.pendencias.slice(0,5),transmissao:false});
  const pdfTag=textoTag(resposta.body,'pdfGuias');
  if(!pdfTag)
   return json(res,200,{ok:true,pdf_disponivel:false,ambiente:'homologacao',
    codigo_gnre:'402',guia_confirmada:true,
    aviso:'O servico confirmou a guia mas nao forneceu PDF, mesmo com incluirPDFGuias=S. Documento nao arquivado.',
    transmissao:false});
  const bytes=decodificarPdfOficial(pdfTag);
  if(!bytes)return json(res,502,{ok:false,pdf_disponivel:false,
    erro:'Resposta GNRE contem pdfGuias, mas arquivo PDF nao passou na validacao. Nao disponibilizar.',
    transmissao:false});
  // Arquivar SOMENTE na referencia individual conciliada do piloto.
  // Nao altera o fluxo de recepcao, nao insere outro registro e nunca salva em producao.
  // Uma falha de persistencia nao deve impedir o download do PDF real recuperado.
  let arquivo='nao_arquivado';
  const guia=fiscal.guias?.[0];
  const controle=String(guia?.numero_controle||'').trim();
  if(ref.id!=null && /^[0-9]{1,20}$/.test(controle)
     && ['recebida','validada','emitida'].includes(ref.situacao)) {
   if(ref.pdf_base64){
    arquivo='ja_arquivado';
   } else {
    try {
     const alterados=await supabaseRest('gnre_guias_arquivo',{
      method:'PATCH',
      query:'?id=eq.'+encodeURIComponent(String(ref.id))
        +'&chave_idempotencia=eq.'+encodeURIComponent(chave)
        +'&ambiente=eq.homologacao&numero_nfe=eq.51109'
        +'&receita=eq.100102&pdf_base64=is.null&select=id',
      body:{
       pdf_base64:bytes.toString('base64'),
       numero_guia:controle,
       linha_digitavel:guia?.linha_digitavel||null,
       codigo_barras:guia?.codigo_barras||null,
       situacao:'emitida',
       atualizado_em:new Date().toISOString()
      }
     });
     arquivo=Array.isArray(alterados)&&alterados.length===1?'arquivado':'nao_confirmado';
    } catch(_erro){arquivo='falha_ao_arquivar';}
   }
  } else {
   arquivo='controle_nao_confirmado';
  }
  res.setHeader('X-GNRE-Arquivamento',arquivo);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','attachment; filename="GNRE-OFICIAL-HOMOLOGACAO-NFE-51109.pdf"');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).send(bytes);
 }catch(_erro){
  return json(res,502,{ok:false,erro:'Nao foi possivel consultar o PDF de homologacao. A guia NAO foi retransmitida.',
   transmissao:false});
 }
}
module.exports=handler;
module.exports.decodificarPdfOficial=decodificarPdfOficial;
