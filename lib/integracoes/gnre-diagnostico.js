// GNRE V427: diagnóstico por etapas, sem transmissão fiscal nem exposição de credenciais.
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
  // V427: endereço único publicado no WSDL oficial. Nunca fazer fallback de host.
  // checkServerIdentity observa o certificado, mas mantém a verificação original do Node.
  const host=parsed.hostname;
  const alvo=new URL(base+'/GnreConfigUF?wsdl');
  let certServidor=null;
  function identidadeServidor(nome,cert){
   certServidor={host:nome,subject_cn:String(cert?.subject?.CN||'').slice(0,180),issuer_cn:String(cert?.issuer?.CN||'').slice(0,180),subject_alt_name:String(cert?.subjectaltname||'').slice(0,700),valido_ate:String(cert?.valid_to||'').slice(0,100)};
   return tls.checkServerIdentity(nome,cert); // NÃO ignorar incompatibilidade
  }
  let resposta;
  try{
   resposta=await new Promise((resolve,reject)=>{
    let total=0,trecho='';
    const request=https.get(alvo,{...opcoes,rejectUnauthorized:true,servername:host,checkServerIdentity:identidadeServidor,minVersion:'TLSv1.2',timeout:12000,headers:{Accept:'application/wsdl+xml,application/xml,text/xml'}},response=>{
     const tlsInfo={etapa:'conexao_tls',ok:true,host,protocolo:response.socket?.getProtocol?.()||null,autorizado:response.socket?.authorized===true};
     etapas.push(tlsInfo);
     etapa='servico_wsdl';
     response.on('data',chunk=>{total+=chunk.length;if(total>512000){request.destroy(Object.assign(new Error('Resposta acima do limite'),{code:'RESPOSTA_GRANDE'}));return;}if(trecho.length<3000)trecho+=chunk.toString('utf8').slice(0,3000-trecho.length);});
     response.on('end',()=>resolve({status:response.statusCode,xml:/<(?:[\w-]+:)?definitions\b|<(?:[\w-]+:)?description\b|<\?xml/i.test(trecho),tipo:String(response.headers['content-type']||'').slice(0,120),host}));
     response.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(Object.assign(new Error('Tempo limite'),{code:'ETIMEDOUT'})));
    request.on('error',reject);
   });
  }catch(err){if(certServidor)err.cert_servidor=certServidor;throw err;}
  const ok=resposta.status===200&&resposta.xml;
  etapas.push({etapa:'servico_wsdl',ok,http_status:resposta.status,wsdl_reconhecido:resposta.xml});
  return json(res,ok?200:502,{ok,etapa:ok?'concluido':'servico_wsdl',ambiente:'homologacao',certificado:'A1 carregado ('+origem+')',servico:'GnreConfigUF (WSDL)',host_validado:resposta.host,ajuste_sugerido:null,http_status:resposta.status,tempo_ms:Date.now()-inicio,etapas,erro:ok?undefined:'O serviço respondeu, mas não retornou um WSDL reconhecido. Nenhuma guia foi emitida.'});
 }catch(e){const code=codigoSeguro(e);const descricao=explicar(code,etapa);etapas.push({etapa,ok:false,codigo:code,descricao});
  // Não incluir e.message ou stack: podem conter detalhes internos do certificado/servidor.
  return json(res,502,{ok:false,etapa,codigo:code,erro:descricao,etapas,tempo_ms:Date.now()-inicio,cert_servidor:e.cert_servidor||undefined,host_oficial:'www.testegnre.pe.gov.br',observacao:'A leitura do WSDL não envia guias nem comprova autenticação SOAP.'});}
};
