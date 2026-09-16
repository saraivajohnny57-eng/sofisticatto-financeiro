const crypto=require('crypto');
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
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){console.error('[BANCO-BRADESCO]',action,e);return json(res,500,{ok:false,erro:e.message||'Falha na integração Bradesco.'});}
};
