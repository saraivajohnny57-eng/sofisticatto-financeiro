'use strict';
// Consulta SOAP de configuracao GNRE, somente leitura; jamais recepciona ou emite guia.
const https=require('https');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const URL='https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF';
function extrair(xml,tag){
 const t=String(xml||'');
 const pattern=new RegExp('<(?:[A-Za-z_][\\\\w.-]*:)?'+tag+'(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)<\\\\/(?:[A-Za-z_][\\\\w.-]*:)?'+tag+'>','i');
 const m=t.match(pattern);
 return m?m[1].replace(/<[^>]*>/g,'').trim():null;
}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(process.env.GNRE_AMBIENTE!=='homologacao')return json(res,400,{ok:false,erro:'Apenas homologacao'});
 const uf='MG',receita='100129';
 const ns='http://www.gnre.pe.gov.br/webservice/GnreConfigUF';
 const envelope='<?xml version="1.0" encoding="utf-8"?>'+'<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><gnreCabecMsg xmlns="'+ns+'"><versaoDados>1.00</versaoDados></gnreCabecMsg></soap12:Header><soap12:Body><gnreDadosMsg xmlns="'+ns+'"><TConsultaConfigUf xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><uf>'+uf+'</uf><receita>'+receita+'</receita></TConsultaConfigUf></gnreDadosMsg></soap12:Body></soap12:Envelope>';
 try{
  const {pfx,passphrase,key,cert}=await credenciais();
  if(!(key&&cert)&&!(pfx&&passphrase))return json(res,503,{ok:false,erro:'Certificado A1 indisponivel'});
  const tlsOptions=key&&cert?{key,cert}:{pfx,passphrase};
  const resposta=await new Promise((resolve,reject)=>{
   let chunks=[],size=0;
   const reqWs=https.request(URL,{...tlsOptions,method:'POST',rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:15000,headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+ns+'/consultar"','SOAPAction':ns+'/consultar','Accept':'application/soap+xml,text/xml','Content-Length':Buffer.byteLength(envelope)}},resp=>{
    resp.on('data',chunk=>{size+=chunk.length;if(size>600000){reqWs.destroy(new Error('Resposta acima do limite'));return;}chunks.push(chunk);});
    resp.on('end',()=>resolve({http_status:resp.statusCode,xml:Buffer.concat(chunks).toString('utf8')}));
    resp.on('error',reject);
   });
   reqWs.on('timeout',()=>reqWs.destroy(new Error('Tempo limite GNRE')));
   reqWs.on('error',reject);
   reqWs.end(envelope);
  });
  const xml=resposta.xml;
  const situacao=xml.match(/<(?:[\w.-]+:)?situacaoConsulta\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?situacaoConsulta>/i)?.[1]||'';
  const codigo=extrair(situacao,'codigo')||extrair(xml,'codigo');
  const descricao=extrair(situacao,'descricao')||extrair(xml,'descricao');
  const fault=extrair(xml,'faultstring')||extrair(xml,'Text')||extrair(xml,'Reason');
  const raiz=(xml.replace(/<\?xml[^>]*\?>/i,'').match(/<([A-Za-z_][\w.:-]*)[\s>]/)||[])[1]||null;
  const body=(xml.match(/<(?:[\w.-]+:)?Body\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Body>/i)||[])[1]||'';
  const elementos=[...new Set([...body.matchAll(/<([A-Za-z_][\w.:-]*)[\s/>]/g)].map(m=>m[1]))].slice(0,35);
  const receitas=[...xml.matchAll(/<(?:[\w.-]+:)?receita\b[^>]*\bcodigo=["'](\d{6})["']/gi)].map(m=>m[1]);
  const campos=[...new Set([...xml.matchAll(/<(?:[\w.-]+:)?(exige[A-Za-z]+|detalhamentoReceita|detalhamentosReceita|camposAdicionais|tiposDocumentoOrigem|tipoDocumentoOrigem)\b/gi)].map(m=>m[1]))];
  return json(res,200,{ok:resposta.http_status===200&&codigo==='450',http_status:resposta.http_status,uf,receita,ambiente:'homologacao',codigo_situacao:codigo,descricao_situacao:descricao,fault:fault?.slice(0,350)||null,receitas_encontradas:[...new Set(receitas)].slice(0,30),campos_identificados:campos.slice(0,60),tamanho_resposta:Buffer.byteLength(xml),elemento_raiz:raiz,elementos_body:elementos,retorno_vazio:!xml.trim(),xml_configuracao:codigo==='450'?xml.slice(0,100000):null,observacao:'Consulta de configuracao somente leitura. Nenhuma guia transmitida.'});
 }catch(e){return json(res,502,{ok:false,erro:'Falha na consulta SOAP ConfigUF',codigo:String(e.code||'SEM_CODIGO').slice(0,70),detalhe:String(e.message||'').slice(0,160)});}
};
