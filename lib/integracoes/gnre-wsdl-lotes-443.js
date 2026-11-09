'use strict';
// Consulta administrativa SOMENTE LEITURA dos contratos de lote em homologacao.
// Jamais transmite dados fiscais, guias ou lotes.
const https=require('node:https');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const BASE='https://www.testegnre.pe.gov.br/gnreWS/services/';
const SERVICOS=Object.freeze([
 {nome:'GnreLoteRecepcao',acao:SOAP_ACTIONS.recepcao},
 {nome:'GnreResultadoLote',acao:SOAP_ACTIONS.consulta}
]);
function analisarWsdl(nome,xml){
 const item=SERVICOS.find(s=>s.nome===nome);
 if(!item)throw new TypeError('Servico nao autorizado');
 const texto=String(xml||'');
 const ns=texto.match(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.xmlsoap\.org\/wsdl\/soap12\/["']/);
 const endereco=ns?texto.match(new RegExp('<'+ns[1]+':address\\b[^>]*\\blocation=["\\x27]([^"\\x27]+)["\\x27]','i'))?.[1]:null;
 const esperado=BASE+nome;
 const acao_valida=texto.includes(item.acao);
 const endereco_valido=endereco===esperado;
 const operacao_valida=nome==='GnreLoteRecepcao'?/name=["']processar["']/.test(texto):/name=["']consultar["']/.test(texto);
 return {servico:nome,wsdl_soap12:!!ns,acao_valida,endereco_valido,operacao_valida,
  endpoint_anunciado:typeof endereco==='string'&&endereco.startsWith('https://www.testegnre.pe.gov.br')?endereco:null,
  contrato_aprovado:!!ns&&acao_valida&&endereco_valido&&operacao_valida};
}
function lerWsdl(url,opcoes){
 return new Promise((resolve,reject)=>{
  const partes=[];let total=0,finalizou=false;
  const fim=(e,val)=>{if(finalizou)return;finalizou=true;e?reject(e):resolve(val);};
  const req=https.get(url,{...opcoes,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:12000,
   headers:{Accept:'application/wsdl+xml,application/xml,text/xml'}},res=>{
    res.on('data',chunk=>{total+=chunk.length;if(total>512000){req.destroy(Object.assign(new Error('WSDL grande'),{code:'WSDL_GRANDE'}));return;}partes.push(Buffer.from(chunk));});
    res.on('end',()=>fim(null,{http_status:res.statusCode,xml:Buffer.concat(partes).toString('utf8')}));
    res.on('error',fim);
   });
   req.on('timeout',()=>req.destroy(Object.assign(new Error('Tempo limite'),{code:'ETIMEDOUT'})));
   req.on('error',fim);
 });
}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')
  return json(res,403,{ok:false,erro:'Somente em homologacao',transmissao_fiscal:false});
 try{
  const cred=await credenciais();
  const opcoes=cred.key&&cred.cert?{key:cred.key,cert:cred.cert}
   :cred.pfx&&cred.passphrase?{pfx:cred.pfx,passphrase:cred.passphrase}:null;
  if(!opcoes)return json(res,503,{ok:false,erro:'Certificado A1 nao cadastrado',transmissao_fiscal:false});
  const resultados=[];
  for(const item of SERVICOS){
   const destino=BASE+item.nome+'?wsdl';
   try{
    const r=await lerWsdl(destino,opcoes);
    resultados.push({servico:item.nome,wsdl_http:r.http_status,
     ...(r.http_status===200?analisarWsdl(item.nome,r.xml):{contrato_aprovado:false}),
     endereco_testado:BASE+item.nome});
   }catch(e){
    const codigo=String(e?.code||'ERRO_TRANSPORTE');
    resultados.push({servico:item.nome,contrato_aprovado:false,
     codigo:/^[A-Z][A-Z0-9_]{1,70}$/.test(codigo)?codigo:'ERRO_TRANSPORTE'});
   }
  }
  return json(res,200,{ok:resultados.every(x=>x.contrato_aprovado),ambiente:'homologacao',
   descricao:'Verificacao WSDL autenticada sem qualquer transmissao fiscal',
   contratos:resultados,transmissao_fiscal:false});
 }catch(e){return json(res,502,{ok:false,erro:'Nao foi possivel carregar o certificado ou consultar os contratos GNRE.',transmissao_fiscal:false});}
};
module.exports.analisarWsdl=analisarWsdl;
