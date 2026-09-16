const crypto=require('crypto');
const https=require('https');
const forge=require('node-forge');
const {exigirAdmin,supabaseRest,criptografar,descriptografar}=require('../lib/integracoes/_utils');

const TABELA='integracoes_bradesco_segredos';
const CNPJ_PADRAO='05451985000195';
const AMBIENTE_PADRAO='sandbox';
function json(res,status,data){res.status(status).json(data)}
function ambiente(v){return String(v||AMBIENTE_PADRAO).toLowerCase()==='producao'?'producao':'sandbox'}
function idRegistro(amb,tipo){return `bradesco:${ambiente(amb)}:${tipo}`}
async function obter(id){const r=await supabaseRest(TABELA,{query:`?id=eq.${encodeURIComponent(id)}&select=*`});return Array.isArray(r)?(r[0]||null):null}
async function salvar(id,amb,tipo,obj,metadata={}){
  const c=criptografar(obj), atual=await obter(id);
  const body={id,ambiente:ambiente(amb),tipo,payload_criptografado:c.payload,iv:c.iv,auth_tag:c.tag,metadata,atualizado_em:new Date().toISOString()};
  if(atual)return supabaseRest(TABELA,{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}`,body});
  return supabaseRest(TABELA,{method:'POST',body});
}
function pemValido(v,tipo){const s=String(v||'').trim();const marcador=tipo==='cert'?'CERTIFICATE':'PRIVATE KEY';if(!s.includes(`BEGIN ${marcador}`)||!s.includes(`END ${marcador}`))throw new Error(tipo==='cert'?'Certificado público PEM inválido.':'Chave privada PEM inválida.');return s+'\n'}
function validarParMtls(certPem,keyPem){
  const cert=new crypto.X509Certificate(pemValido(certPem,'cert'));
  const key=crypto.createPrivateKey(pemValido(keyPem,'key'));
  const pubCert=cert.publicKey.export({type:'spki',format:'der'});
  const pubKey=crypto.createPublicKey(key).export({type:'spki',format:'der'});
  if(!crypto.timingSafeEqual(Buffer.from(pubCert),Buffer.from(pubKey)))throw new Error('A chave privada não corresponde ao certificado público cadastrado no Bradesco.');
  const ate=new Date(cert.validTo), de=new Date(cert.validFrom), agora=new Date();
  if(agora<de)throw new Error('O certificado ainda não está válido.');
  if(agora>ate)throw new Error('O certificado está vencido.');
  return {subject:cert.subject,issuer:cert.issuer,valido_de:de.toISOString(),valido_ate:ate.toISOString(),dias_restantes:Math.ceil((ate-agora)/86400000),fingerprint256:cert.fingerprint256};
}
async function status(amb){
  const cred=await obter(idRegistro(amb,'credenciais')), mtls=await obter(idRegistro(amb,'mtls'));
  return {ambiente:ambiente(amb),credenciais:{configuradas:!!cred,client_id:!!cred,client_secret:!!cred},mtls:{configurado:!!mtls,...(mtls?.metadata||{})},cnpj:CNPJ_PADRAO};
}

function endpointToken(amb){
  return ambiente(amb)==='sandbox'
    ? 'https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token'
    : 'https://openapi.bradesco.com.br/auth/server-mtls/v2/token';
}
function criarPfxTemporario(certPem,keyPem){
  // Empacota em PKCS#12 somente em memória. Isso força o runtime TLS a apresentar
  // o certificado cliente no handshake mTLS, sem gravar chave privada em disco.
  const cert=forge.pki.certificateFromPem(pemValido(certPem,'cert'));
  const key=forge.pki.privateKeyFromPem(pemValido(keyPem,'key'));
  const senha=crypto.randomBytes(24).toString('hex');
  const asn1=forge.pkcs12.toPkcs12Asn1(key,[cert],senha,{algorithm:'3des'});
  const der=forge.asn1.toDer(asn1).getBytes();
  return {pfx:Buffer.from(der,'binary'),passphrase:senha};
}
function solicitarTokenMtls(url,cred,mtls){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const form=new URLSearchParams({grant_type:'client_credentials',client_id:cred.client_id,client_secret:cred.client_secret}).toString();
    let pacote;
    try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(new Error('Não foi possível preparar o certificado mTLS para o transporte HTTPS: '+e.message));}
    const agent=new https.Agent({
      pfx:pacote.pfx,passphrase:pacote.passphrase,
      minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false
    });
    const req=https.request({
      protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname+u.search,method:'POST',
      agent,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Content-Length':Buffer.byteLength(form)},
      timeout:20000
    },r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<200000)raw+=d});
      r.on('end',()=>{
        agent.destroy();
        let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,1500)}}
        if(r.statusCode>=200&&r.statusCode<300&&data.access_token){
          return resolve({http_status:r.statusCode,access_token:data.access_token,token_type:data.token_type||'Bearer',expires_in:data.expires_in||null,scope:data.scope||null,transporte_mtls:'pkcs12-memory'});
        }
        const detalhe=data.error_description||data.descricaoErro||data.message||data.error||`HTTP ${r.statusCode}`;
        const sslMsg=/SSL with client authentication is required/i.test(String(detalhe))
          ? 'O Bradesco não reconheceu o certificado cliente no handshake mTLS. Confirme se o Client ID/Secret pertencem à mesma credencial para a qual este certificado público foi provisionado no Portal Bradesco.'
          : `Bradesco recusou a autenticação: ${detalhe}`;
        const e=new Error(sslMsg);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('socket',socket=>{
      socket.once('secureConnect',()=>{
        try{
          const local=typeof socket.getCertificate==='function'?socket.getCertificate():null;
          if(!local||!Object.keys(local).length)console.warn('[BANCO-BRADESCO] TLS conectado sem certificado cliente local visível no socket.');
        }catch(_){}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao conectar ao Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(form);req.end();
  });
}

function consultarPendentesSandbox(token,mtls){
  return new Promise((resolve,reject)=>{
    const url='https://openapisandbox.prebanco.com.br:443/boleto/cobranca-pendente/v1/listar';
    const u=new URL(url);
    // Payload demonstrativo publicado pelo próprio Swagger do recurso Sandbox.
    // Ele serve apenas para validar o consumo do recurso; não representa dados da Sofisticatto.
    const payload={
      cpfCnpj:{cpfCnpj:'31759488',filial:'0',controle:'55'},
      produto:'05',negociacao:'38610041000',nossoNumero:'4197000001',
      cpfCnpjPagador:{cpfCnpj:'31759488',filial:'0',controle:'55'},
      dataVencimentoDe:'01012022',dataVencimentoAte:'01012022',
      dataRegistroDe:'1012020',dataRegistroAte:'24052020',
      valorTituloDe:'0',faixaVencto:'7',paginaAnterior:'0'
    };
    const body=JSON.stringify(payload);
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:20000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<500000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,4000)}}
        const result={http_status:r.statusCode,data};
        if(r.statusCode>=200&&r.statusCode<300)return resolve(result);
        const detalhe=data?.mensagem||data?.message||data?.erro||data?.descricao||data?.causa||`Bradesco respondeu HTTP ${r.statusCode}`;
        const e=new Error(`HTTP ${r.statusCode} — ${typeof detalhe==='string'?detalhe:JSON.stringify(detalhe).slice(0,800)}`);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao consultar títulos pendentes no Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}

module.exports=async function(req,res){
  if(!exigirAdmin(req,res))return;
  const action=String(req.query?.action||'status'), amb=ambiente(req.query?.ambiente||req.body?.ambiente);
  try{
    if(action==='status')return json(res,200,{ok:true,...await status(amb)});
    if(action==='salvar-credenciais'){
      const atual=await obter(idRegistro(amb,'credenciais'));let anterior={};if(atual)anterior=descriptografar(atual);
      const client_id=String(req.body?.client_id||anterior.client_id||'').trim();
      const client_secret=String(req.body?.client_secret||anterior.client_secret||'').trim();
      if(!client_id||!client_secret)throw new Error('Informe Client ID e Client Secret na primeira configuração.');
      await salvar(idRegistro(amb,'credenciais'),amb,'credenciais',{client_id,client_secret},{client_id_configurado:true});
      return json(res,200,{ok:true,mensagem:'Credenciais Bradesco salvas com criptografia no backend.'});
    }
    if(action==='salvar-mtls'){
      const certPem=pemValido(req.body?.cert_pem,'cert'), keyPem=pemValido(req.body?.key_pem,'key');
      const meta=validarParMtls(certPem,keyPem);
      await salvar(idRegistro(amb,'mtls'),amb,'mtls',{cert_pem:certPem,key_pem:keyPem},{...meta,cnpj:CNPJ_PADRAO});
      return json(res,200,{ok:true,mensagem:'Par mTLS validado e armazenado com criptografia no backend.',certificado:meta});
    }
    if(action==='validar-configuracao'){
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg)throw new Error('Client ID e Client Secret ainda não foram cadastrados.');
      if(!mtlsReg)throw new Error('Certificado público e chave privada mTLS ainda não foram cadastrados.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);const meta=validarParMtls(mtls.cert_pem,mtls.key_pem);
      if(!cred.client_id||!cred.client_secret)throw new Error('Credenciais incompletas.');
      return json(res,200,{ok:true,teste:{configuracao_valida:true,mtls_valido:true,credenciais_validas:true,certificado:meta},mensagem:'Configuração local do Bradesco Sandbox validada. Nenhum boleto foi emitido.'});
    }
    if(action==='consultar-pendentes'){
      if(amb!=='sandbox')throw new Error('A consulta de homologação está liberada somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes da consulta.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      const consulta=await consultarPendentesSandbox(auth.access_token,mtls);
      const d=consulta.data||{};
      return json(res,200,{ok:true,consulta:{http_status:consulta.http_status,status:d.status??consulta.http_status,mensagem:d.mensagem||'Operação realizada com sucesso.',causa:d.causa||null,pagina:d.pagina??null,indMaisPagina:d.indMaisPagina??null,qtdeTitulos:d.qtdeTitulos??(Array.isArray(d.titulos)?d.titulos.length:null),vtotTitulos:d.vtotTitulos??null,qtdeOcorr:d.qtdeOcorr??null,titulos:Array.isArray(d.titulos)?d.titulos.slice(0,20):[]},mensagem:'Consulta segura ao recurso de títulos pendentes do Bradesco Sandbox concluída. Nenhum boleto foi registrado, alterado ou baixado.'});
    }
    if(action==='testar-autenticacao'){
      if(amb!=='sandbox')throw new Error('O teste externo está liberado somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes do teste externo.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const teste=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      return json(res,200,{ok:true,teste:{autenticacao:true,ambiente:'sandbox',endpoint:'openapisandbox.prebanco.com.br',http_status:teste.http_status,token_type:teste.token_type,expires_in:teste.expires_in,scope:teste.scope},mensagem:'Autenticação mTLS/OAuth do Bradesco Sandbox concluída com sucesso. Nenhum boleto foi consultado, alterado ou emitido.'});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){
    console.error('[BANCO-BRADESCO]',action,e);
    const upstream=Number(e?.http_status)||0;
    const statusHttp=(upstream>=400&&upstream<=599)?upstream:500;
    const resposta=e?.resposta&&typeof e.resposta==='object'?e.resposta:null;
    return json(res,statusHttp,{ok:false,erro:e.message||'Falha na integração Bradesco.',bradesco_http:upstream||null,detalhe:resposta});
  }
};
