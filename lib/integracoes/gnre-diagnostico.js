// GNRE V425: diagnóstico por etapas, sem transmissão fiscal nem exposição de credenciais.
const https=require('https');
const tls=require('tls');
const crypto=require('crypto');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
function codigoSeguro(e){const c=String(e?.code||'');return /^[A-Z][A-Z0-9_]{1,90}$/.test(c)?c:'SEM_CODIGO';}
function explicar(c,etapa){
 if(/CERT_HAS_EXPIRED/.test(c))return 'O certificado usado na conexão está vencido.';
 if(/UNABLE_TO_VERIFY|SELF_SIGNED|CERTIFICATE_VERIFY_FAILED/.test(c))return 'Falha na verificação da cadeia de confiança do servidor.';
 if(/ERR_OSSL_EVP_UNSUPPORTED|ERR_OSSL_PEM|ERR_OSSL_PKCS12/.test(c))return 'O formato criptográfico do certificado não é compatível com a biblioteca TLS.';
 if(/ERR_TLS_CERT_ALTNAME_INVALID/.test(c))return 'O nome do servidor não corresponde ao certificado apresentado.';
 if(/ECONNRESET|EPIPE/.test(c))return 'A conexão foi encerrada durante a negociação TLS.';
 if(/ETIMEDOUT|ESOCKETTIMEDOUT/.test(c))return 'Tempo limite de comunicação com o serviço GNRE.';
 if(/ENOTFOUND|EAI_AGAIN/.test(c))return 'Falha na resolução do endereço do serviço GNRE.';
 if(/ERR_SSL|SSL|TLS|HANDSHAKE|ALERT/.test(c))return 'Falha de negociação TLS. Confira o código técnico e o endpoint.';
 return etapa==='certificado'?'Não foi possível preparar o certificado para TLS.':'Falha na conexão com o serviço GNRE. Consulte o código técnico.';
}
function infoCertificado(opcoes){
 const contexto=tls.createSecureContext(opcoes);
 const certificado=new crypto.X509Certificate(contexto.context.getCertificate());
 const validade=Date.parse(certificado.validTo);
 return {contexto,certificado:{valido_ate:certificado.validTo,expirado:Number.isFinite(validade)?validade<Date.now():null,chave_privada:'carregada',formato:'X.509'}};
}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const etapas=[];let etapa='configuracao';let inicio=Date.now();
 try{
  if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')return json(res,400,{ok:false,etapa,erro:'Configure GNRE_AMBIENTE=homologacao para o diagnóstico.'});
  const base=String(process.env.GNRE_BASE_URL||'https://www.testegnre.pe.gov.br/gnreWS/services').replace(/\/$/,'');
  const parsed=new URL(base);
  if(parsed.protocol!=='https:'||!['www.testegnre.pe.gov.br','testegnre.pe.gov.br'].includes(parsed.hostname)||parsed.pathname!=='/gnreWS/services')return json(res,400,{ok:false,etapa,erro:'GNRE_BASE_URL deve apontar para o serviço oficial de homologação.'});
  etapas.push({etapa:'configuracao',ok:true});
  etapa='certificado';
  const {pfx,passphrase,key,cert,origem,modo}=await credenciais();
  if(!(key&&cert)&&(!pfx?.length||!passphrase))return json(res,503,{ok:false,etapa,erro:'Certificado A1 não cadastrado.'});
  const opcoes=key&&cert?{key,cert}:{pfx,passphrase};
  // Criação do contexto detecta senha incorreta, chave ausente e problemas de formato antes da rede.
  const contexto=tls.createSecureContext(opcoes);
  let validade=null;let expirado=null;
  try{const der=contexto.context.getCertificate();if(der){const x=new crypto.X509Certificate(der);validade=x.validTo;expirado=Date.parse(validade)<Date.now();}}catch(_e){}
  etapas.push({etapa:'certificado',ok:true,origem,modo:modo||'nativo',chave_privada:'carregada',valido_ate:validade,expirado});
  if(expirado)return json(res,422,{ok:false,etapa,erro:'O certificado A1 está vencido.',etapas});
  etapa='conexao_tls';
  // V426: testa somente os dois nomes conhecidos de homologação, mantendo TLS rigoroso.
  // Um certificado HTTPS de outro host jamais é aceito automaticamente.
  const hostPrimario=parsed.hostname;
  const hostAlternativo=hostPrimario==='www.testegnre.pe.gov.br'?'testegnre.pe.gov.br':'www.testegnre.pe.gov.br';
  async function consultarWsdl(host){
   const url=new URL(base+'/GnreConfigUF?wsdl');url.hostname=host;
   return await new Promise((resolve,reject)=>{
    const request=https.get(url,{...opcoes,rejectUnauthorized:true,servername:host,timeout:12000,headers:{Accept:'application/xml,text/xml'}},response=>{
     etapas.push({etapa:'conexao_tls',ok:true,host,protocolo:response.socket?.getProtocol?.()||null,autorizado:response.socket?.authorized===true});
     etapa='servico_wsdl';let tamanho=0;let trecho='';
     response.on('data',chunk=>{tamanho+=chunk.length;if(tamanho>512000){request.destroy(Object.assign(new Error('Resposta GNRE acima do limite'),{code:'RESPOSTA_GRANDE'}));return;}if(trecho.length<1200)trecho+=chunk.toString('utf8').slice(0,1200-trecho.length)});
     response.on('end',()=>resolve({status:response.statusCode,xml:/<(?:\w+:)?definitions\b|<(?:\w+:)?description\b|<\?xml/i.test(trecho),tipo:response.headers['content-type']||'',host}));
     response.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(Object.assign(new Error('Tempo limite'),{code:'ETIMEDOUT'})));
    request.on('error',reject);
   });
  }
  let resposta;
  try{resposta=await consultarWsdl(hostPrimario)}catch(erroPrimario){
   if(erroPrimario?.code!=='ERR_TLS_CERT_ALTNAME_INVALID')throw erroPrimario;
   etapas.push({etapa:'conexao_tls',ok:false,host:hostPrimario,codigo:'ERR_TLS_CERT_ALTNAME_INVALID',descricao:'Nome do servidor incompatível com certificado HTTPS; testando outro domínio oficial de homologação.'});
   etapa='conexao_tls';
   try{resposta=await consultarWsdl(hostAlternativo)}catch(erroAlternativo){
    erroAlternativo.primeiro_host=hostPrimario;
    erroAlternativo.primeiro_codigo='ERR_TLS_CERT_ALTNAME_INVALID';
    throw erroAlternativo;
   }
  }
  const ok=resposta.status===200&&resposta.xml;
  etapas.push({etapa:'servico_wsdl',ok,http_status:resposta.status,wsdl_reconhecido:resposta.xml});
  return json(res,ok?200:502,{ok,etapa:ok?'concluido':'servico_wsdl',ambiente:'homologacao',certificado:'A1 carregado ('+origem+')',servico:'GnreConfigUF (WSDL)',host_validado:resposta.host,ajuste_sugerido:resposta.host!==hostPrimario?'GNRE_BASE_URL=https://'+resposta.host+'/gnreWS/services':null,http_status:resposta.status,tempo_ms:Date.now()-inicio,etapas,erro:ok?undefined:'O serviço respondeu, mas não retornou um WSDL reconhecido. Nenhuma guia foi emitida.'});
 }catch(e){const code=codigoSeguro(e);const descricao=explicar(code,etapa);etapas.push({etapa,ok:false,codigo:code,descricao});
  // Não incluir e.message ou stack: podem conter detalhes internos do certificado/servidor.
  return json(res,502,{ok:false,etapa,codigo:code,erro:descricao,etapas,tempo_ms:Date.now()-inicio,primeiro_host:e.primeiro_host||undefined,primeiro_codigo:e.primeiro_codigo||undefined});}
};
