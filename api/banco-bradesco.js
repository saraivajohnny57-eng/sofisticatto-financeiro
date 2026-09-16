const crypto=require('crypto');
const https=require('https');
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
function solicitarTokenMtls(url,cred,mtls){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const form=new URLSearchParams({grant_type:'client_credentials',client_id:cred.client_id,client_secret:cred.client_secret}).toString();
    const basic=Buffer.from(`${cred.client_id}:${cred.client_secret}`,'utf8').toString('base64');
    const req=https.request({
      protocol:u.protocol,hostname:u.hostname,port:u.port||443,path:u.pathname+u.search,method:'POST',
      cert:mtls.cert_pem,key:mtls.key_pem,minVersion:'TLSv1.2',rejectUnauthorized:true,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Authorization':`Basic ${basic}`,'Content-Length':Buffer.byteLength(form)},
      timeout:20000
    },r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<200000)raw+=d});
      r.on('end',()=>{
        let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,1500)}}
        if(r.statusCode>=200&&r.statusCode<300&&data.access_token){
          return resolve({http_status:r.statusCode,token_type:data.token_type||'Bearer',expires_in:data.expires_in||null,scope:data.scope||null});
        }
        const detalhe=data.error_description||data.descricaoErro||data.message||data.error||`HTTP ${r.statusCode}`;
        const e=new Error(`Bradesco recusou a autenticação: ${detalhe}`);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao conectar ao Bradesco Sandbox.')));
    req.on('error',reject);req.write(form);req.end();
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
    if(action==='testar-autenticacao'){
      if(amb!=='sandbox')throw new Error('O teste externo está liberado somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes do teste externo.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const teste=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      return json(res,200,{ok:true,teste:{autenticacao:true,ambiente:'sandbox',endpoint:'openapisandbox.prebanco.com.br',http_status:teste.http_status,token_type:teste.token_type,expires_in:teste.expires_in,scope:teste.scope},mensagem:'Autenticação mTLS/OAuth do Bradesco Sandbox concluída com sucesso. Nenhum boleto foi consultado, alterado ou emitido.'});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){console.error('[BANCO-BRADESCO]',action,e);return json(res,500,{ok:false,erro:e.message||'Falha na integração Bradesco.'});}
};
