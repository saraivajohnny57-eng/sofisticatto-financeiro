/**
 * SEFAZ/NF-e V477 — Distribuição DF-e por NSU (somente leitura).
 * Sem jobs automáticos. Uma requisição = no máximo um lote oficial de 50 docs.
 * Destinatário usa resumo da NF-e até ocorrer manifestação fiscal válida.
 */
'use strict';
const https=require('https');
const tls=require('tls');
const crypto=require('crypto');
const zlib=require('zlib');
const {exigirAdmin,json,supabaseRest}=require('./_utils');
const gnre=require('./gnre-certificado');
const TABELA_DOC='sofisticatto_dfe_documentos';
const TABELA_NS='sofisticatto_dfe_cursor';
const URLS=Object.freeze({
 producao:'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
 homologacao:'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
});
const NS="http://www.portalfiscal.inf.br/nfe";
const WS="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
function cnpjValido(v){
 const d=String(v||'').replace(/\D/g,'');if(!/^\d{14}$/.test(d)||/^(\d)\1{13}$/.test(d))return false;
 for(let t=12;t<14;t++){const pesos=t===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const soma=pesos.reduce((s,p,i)=>s+Number(d[i])*p,0);const dv=(soma*10)%11;if(Number(d[t])!==(dv===10?0:dv))return false}
 return true;
}
function xmlCampo(xml,campo){
 const m=String(xml||'').match(new RegExp('<(?:[\\w-]+:)?'+campo+'(?:\\s[^>]*)?>([^<]*)<\\/(?:[\\w-]+:)?'+campo+'>','i'));
 return m?m[1].trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"):'';
}
function xmlBloco(xml,tag){
 const m=String(xml||'').match(new RegExp('<(?:[\\w-]+:)?'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+tag+'>','i'));
 return m?m[1]:'';
}
function xmlEnvelopar(cnpj,nsu,ambiente){
 if(!cnpjValido(cnpj)||!/^\d{15}$/.test(nsu)||!['producao','homologacao'].includes(ambiente))throw Error('Identificadores fiscais inválidos');
 const tp=ambiente==='producao'?'1':'2';
 const xml='<distDFeInt xmlns="'+NS+'" versao="1.01"><tpAmb>'+tp+'</tpAmb><cUFAutor>52</cUFAutor><CNPJ>'+cnpj+'</CNPJ><distNSU><ultNSU>'+nsu+'</ultNSU></distNSU></distDFeInt>';
 return '<?xml version="1.0" encoding="utf-8"?>'+
 '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'+
 '<nfeDistDFeInteresse xmlns="'+WS+'"><nfeDadosMsg>'+xml+'</nfeDadosMsg></nfeDistDFeInteresse>'+
 '</soap12:Body></soap12:Envelope>';
}
function parseDistDFe(texto){
 const t=String(texto||'');if(t.length>3*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(t))throw Error('Envelope XML excedeu o limite ou contém declaração não aceita');
 const bloco=xmlBloco(t,'retDistDFeInt');
 if(!bloco)throw Error('A resposta da SEFAZ não contém retDistDFeInt');
 const cStat=xmlCampo(bloco,'cStat'),motivo=xmlCampo(bloco,'xMotivo').slice(0,250);
 const ult=xmlCampo(bloco,'ultNSU'),max=xmlCampo(bloco,'maxNSU');
 const docs=[];
 const re=/<(?:[\w-]+:)?docZip\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?docZip>/gi;
 let m;
 while((m=re.exec(bloco))){
  if(docs.length>=50)throw Error('Lote excede o limite oficial de 50 documentos');
  const atr=m[1],nsu=(atr.match(/\bNSU="(\d{1,15})"/i)||[])[1],schema=(atr.match(/\bschema="([^"]{1,100})"/i)||[])[1];
  const b64=m[2].trim();
  if(!nsu||!schema||!/^[\w.-]+\.xsd$/i.test(schema)||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)||b64.length>900000)throw Error('Documento compactado possui formato inválido');
  const xml=zlib.gunzipSync(Buffer.from(b64,'base64'),{maxOutputLength:1024*1024}).toString('utf8');
  if(!/^<\?xml[\s\S]*?\?>\s*</.test(xml)&&!/^</.test(xml.trim()))throw Error('Documento XML compactado inválido');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD não permitida');
  const chave=xmlCampo(xml,'chNFe')||((xml.match(/\bId="NFe(\d{44})"/)||[])[1])||null;
  const emit=xmlBloco(xml,'emit'),dest=xmlBloco(xml,'dest');
  const resumo=/^resNFe/i.test(schema);
  docs.push({
   nsu:nsu.padStart(15,'0'),
   chave_acesso:chave&&/^\d{44}$/.test(chave)?chave:null,
   tipo_documento:String(schema).slice(0,100),
   emitente_cnpj:resumo?xmlCampo(xml,'CNPJ')||null:xmlCampo(emit,'CNPJ')||null,
   destinatario_cnpj:resumo?null:xmlCampo(dest,'CNPJ')||null,
   xml_armazenamento:b64
  });
 }
 if(!/^\d{3}$/.test(cStat)|| (ult&&!/^\d{1,15}$/.test(ult))||(max&&!/^\d{1,15}$/.test(max)))throw Error('Resposta fiscal fora do contrato de retorno');
 return {codigo:cStat,motivo,ultimo_nsu:ult?ult.padStart(15,'0'):null,max_nsu:max?max.padStart(15,'0'):null,documentos:docs};
}
async function restFiscal(tabela,{method='GET',query='',body,prefer='return=representation'}={}){
 const url=String(process.env.FINANCEIRO02_SUPABASE_URL||process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.FINANCEIRO02_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!url||!key)throw Error('Banco Financeiro02 não configurado no servidor');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(url+'/rest/v1/'+tabela+query,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
  const texto=await r.text();if(!r.ok)throw Error('Banco fiscal recusou operação HTTP '+r.status);
  return texto?JSON.parse(texto):[];
 }finally{clearTimeout(timeout)}
}
async function tlsDaEmpresa(){
 const cred=await gnre.credenciais();
 const op=cred.key&&cred.cert?{key:cred.key,cert:cred.cert}:cred.pfx?.length&&cred.passphrase?{pfx:cred.pfx,passphrase:cred.passphrase}:null;
 if(!op)throw Error('Certificado A1 não cadastrado no servidor');
 const ctx=tls.createSecureContext(op),der=ctx.context.getCertificate();
 if(!der)throw Error('Certificado A1 não possui certificado X.509 legível');
 const x=new crypto.X509Certificate(der),valido=Date.parse(x.validFrom)<=Date.now()&&Date.now()<=Date.parse(x.validTo);
 if(!valido)throw Error('Certificado A1 fora da validade');
 return {op,validade:x.validTo,origem:cred.origem||'servidor'};
}
function pedirSoap(ambiente,xml,cert){
 const u=new URL(URLS[ambiente]);
 return new Promise((resolve,reject)=>{
  const chunks=[];let count=0;
  const req=https.request(u,{method:'POST',...cert,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:22000,
   headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+WS+'/nfeDistDFeInteresse"','Accept':'application/xml,text/xml','Content-Length':Buffer.byteLength(xml)}},res=>{
   res.on('data',b=>{count+=b.length;if(count>3*1024*1024){req.destroy(new Error('Resposta acima de 3 MB'));return}chunks.push(b)});
   res.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');if(res.statusCode!==200)reject(new Error('Web Service SEFAZ HTTP '+res.statusCode));else resolve(body)});
   res.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(Object.assign(new Error('Tempo limite SEFAZ'),{code:'ETIMEDOUT'})));
  req.on('error',reject);req.end(xml);
 });
}
function caminho(cnpj,ambiente){
 return '?cnpj=eq.'+encodeURIComponent(cnpj)+'&modelo=eq.55&ambiente=eq.'+encodeURIComponent(ambiente);
}
function dataFutura(minutos){return new Date(Date.now()+minutos*60000).toISOString()}
async function cursorFiscal(cnpj,ambiente){
 const q=caminho(cnpj,ambiente);
 const rows=await restFiscal(TABELA_NS,{query:'?select=*&'+q.slice(1)+'&limit=1'});
 if(rows?.length)return rows[0];
 await restFiscal(TABELA_NS,{method:'POST',query:'?on_conflict=cnpj,modelo,ambiente',
  prefer:'resolution=ignore-duplicates,return=minimal',body:{cnpj,modelo:'55',ambiente,ultimo_nsu:'000000000000000'}});
 return (await restFiscal(TABELA_NS,{query:'?select=*&'+q.slice(1)+'&limit=1'}))[0];
}
async function gravarCheckpoint(cnpj,ambiente,campos){
 return restFiscal(TABELA_NS,{method:'PATCH',query:caminho(cnpj,ambiente),body:{...campos,atualizado_em:new Date().toISOString()}});
}
function codigoTransporte(e){
 const c=String(e?.code||'');
 if(c==='ETIMEDOUT'||c==='ECONNRESET'||c==='ENOTFOUND'||c==='EAI_AGAIN')return c;
 return 'FALHA_COMUNICACAO';
}
async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const action=String(req.query?.operacao||'status');
 const ambiente=String(req.query?.ambiente||req.body?.ambiente||'producao');
 const cnpj=String(process.env.SOFISTICATTO_CNPJ||'').replace(/\D/g,'');
 if(!['producao','homologacao'].includes(ambiente)||!cnpjValido(cnpj))
  return json(res,422,{ok:false,erro:'Ambiente ou CNPJ da indústria não configurado corretamente'});
 try{
  if(req.method==='GET'){
   if(action==='xml'){
    const nsu=String(req.query?.nsu||'');
    if(!/^\d{15}$/.test(nsu))return json(res,400,{ok:false,erro:'NSU inválido'});
    const items=await restFiscal(TABELA_DOC,{query:'?select=chave_acesso,tipo_documento,xml_armazenamento&cnpj_consultado=eq.'+cnpj+'&modelo=eq.55&ambiente=eq.'+ambiente+'&nsu=eq.'+nsu+'&limit=1'});
    if(!items?.length||!items[0].xml_armazenamento)return json(res,404,{ok:false,erro:'Documento XML não encontrado'});
    const xml=zlib.gunzipSync(Buffer.from(items[0].xml_armazenamento,'base64'),{maxOutputLength:1024*1024}).toString('utf8');
    if(!/^</.test(xml.trim())||/<!DOCTYPE|<!ENTITY/i.test(xml))return json(res,422,{ok:false,erro:'Documento armazenado não possui XML válido'});
    const nome=(items[0].chave_acesso&&/^\d{44}$/.test(items[0].chave_acesso)?'NFe_'+items[0].chave_acesso:'DFe_NSU_'+nsu)+'.xml';
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="'+nome+'"');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(xml);
   }
   if(action==='documentos'){
    const rows=await restFiscal(TABELA_DOC,{query:'?select=nsu,chave_acesso,tipo_documento,emitente_cnpj,destinatario_cnpj,recebido_em&cnpj_consultado=eq.'+cnpj+'&modelo=eq.55&ambiente=eq.'+ambiente+'&order=nsu.desc&limit=30'});
    return json(res,200,{ok:true,ambiente,documentos:rows,consultas_fiscais_executadas:0});
   }
   const rows=await restFiscal(TABELA_NS,{query:'?select=ultimo_nsu,max_nsu,proxima_consulta_em,atualizado_em&'+caminho(cnpj,ambiente).slice(1)+'&limit=1'});
   let certificado={valido:false,detalhe:'Certificado A1 indisponível ou fora da validade'};
   try{const t=await tlsDaEmpresa();certificado={valido:true,validade:t.validade,origem:t.origem}}catch{}
   return json(res,200,{ok:true,ambiente,cnpj_configurado:true,certificado,cursor:rows?.[0]||null,consulta_real_executada:false,transmissao_eventos_habilitada:false});
  }
  if(action!=='consultar')return json(res,400,{ok:false,erro:'Operação fiscal não permitida'});
  const c=await cursorFiscal(cnpj,ambiente);
  if(!c)return json(res,503,{ok:false,erro:'Cursor fiscal não disponível'});
  if(c.proxima_consulta_em&&Date.parse(c.proxima_consulta_em)>Date.now())return json(res,429,{
   ok:false,erro:'Nova consulta bloqueada para preservar o limite SEFAZ e reduzir tráfego',proxima_consulta_em:c.proxima_consulta_em
  });
  const bloqueio=dataFutura(15),agora=new Date().toISOString();
  // Bloqueio persistente entre instâncias/abas para evitar consulta simultânea.
  const filtro=caminho(cnpj,ambiente)+'&or=(proxima_consulta_em.is.null,proxima_consulta_em.lte.'+encodeURIComponent(agora)+')';
  const acquired=await restFiscal(TABELA_NS,{method:'PATCH',query:filtro,body:{proxima_consulta_em:bloqueio}});
  if(!Array.isArray(acquired)||acquired.length!==1)return json(res,429,{ok:false,erro:'Consulta fiscal já está em processamento ou dentro do intervalo de proteção'});
  const cursorAnterior=c.ultimo_nsu||'000000000000000';
  const cert=await tlsDaEmpresa();
  let resultado;
  try{
   const resp=await pedirSoap(ambiente,xmlEnvelopar(cnpj,cursorAnterior,ambiente),cert.op);
   resultado=parseDistDFe(resp);
  }catch(e){
   return json(res,502,{ok:false,erro:'Não foi possível concluir a comunicação segura com a SEFAZ',codigo:codigoTransporte(e),proxima_consulta_em:bloqueio});
  }
  const confirmados=['137','138'].includes(resultado.codigo);
  if(!confirmados){
   const proxima=resultado.codigo==='656'?dataFutura(70):dataFutura(20);
   await gravarCheckpoint(cnpj,ambiente,{proxima_consulta_em:proxima});
   return json(res,422,{ok:false,codigo_sefaz:resultado.codigo,motivo:resultado.motivo,
     proxima_consulta_em:proxima,registros_gravados:0,ultimo_nsu:cursorAnterior});
  }
  const docs=resultado.documentos.map(d=>({...d,cnpj_consultado:cnpj,modelo:'55',ambiente}));
  try{
   if(docs.length){
    await restFiscal(TABELA_DOC,{method:'POST',query:'?on_conflict=cnpj_consultado,modelo,ambiente,nsu',
     prefer:'resolution=merge-duplicates,return=minimal',body:docs});
   }
   const ult=resultado.ultimo_nsu||cursorAnterior;
   if(BigInt(ult)<BigInt(cursorAnterior))throw Error('SEFAZ retornou NSU inferior ao cursor');
   // Uma só página por solicitação; nunca executar varredura automática.
   const prox=dataFutura(60);
   await gravarCheckpoint(cnpj,ambiente,{ultimo_nsu:ult,max_nsu:resultado.max_nsu,proxima_consulta_em:prox});
   return json(res,200,{ok:true,consulta_real_executada:true,codigo_sefaz:resultado.codigo,motivo:resultado.motivo,
    documentos_recebidos:docs.length,ultimo_nsu:ult,max_nsu:resultado.max_nsu,
    proxima_consulta_em:prox,observacao:'Documentos compactados armazenados uma vez por NSU. Manifestação fiscal não transmitida.'});
  }catch(e){
   return json(res,503,{ok:false,erro:'Resposta SEFAZ recebida, mas a persistência fiscal não foi confirmada. O NSU anterior foi preservado.',proxima_consulta_em:bloqueio});
  }
 }catch(e){
  return json(res,503,{ok:false,erro:'Falha de preparação da consulta fiscal',codigo:codigoTransporte(e)});
 }
}
module.exports=handler;
module.exports._teste={cnpjValido,xmlCampo,xmlEnvelopar,parseDistDFe,evento:'somente-leitura',caminho};