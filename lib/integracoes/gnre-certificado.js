// V423 — certificado A1 GNRE, armazenado somente cifrado no Supabase via service role.
const crypto=require('crypto');
const tls=require('tls');
const forge=require('node-forge');
function extrairCnpj(texto){
 const m=String(texto||'').match(/\b\d{14}\b/);
 return m?m[0]:null;
}
// Inspeciona o PFX sem devolver chave, senha ou conteúdo binário.
// Retorna apenas metadados públicos para auditoria/homologação.
function inspecionarPfx(pfx,senha){
 if(!Buffer.isBuffer(pfx)||pfx.length<100)throw new TypeError('PFX vazio ou inválido.');
 let contexto;
 try{contexto=tls.createSecureContext({pfx,passphrase:String(senha||'')});}
 catch{throw new Error('Senha incorreta ou arquivo PFX/P12 inválido.');}
 const der=contexto.context.getCertificate();
 if(!der)throw new Error('Certificado não encontrado no PFX.');
 const cert=new crypto.X509Certificate(der);
 const validoAte=Date.parse(cert.validTo);
 return {
  ok:true,
  formato:'PKCS#12',
  titular:String(cert.subject||''),
  emissor:String(cert.issuer||''),
  valido_de:new Date(cert.validFrom).toISOString(),
  valido_ate:new Date(cert.validTo).toISOString(),
  expirado:Number.isFinite(validoAte)?validoAte<Date.now():null,
  cnpj:extrairCnpj(cert.subject),
  fingerprint256:cert.fingerprint256,
  chave_publica:cert.publicKey?.asymmetricKeyType||null
 };
}
// Alguns PFX antigos usam cifras PKCS#12 que o OpenSSL 3 não abre diretamente.
function abrirCertificado(pfx,senha){
 try{tls.createSecureContext({pfx,passphrase:senha});return {pfx,passphrase:senha,modo:'nativo',meta:inspecionarPfx(pfx,senha)};}catch(erroNativo){
  try{
   const asn1=forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
   const pkcs12=forge.pkcs12.pkcs12FromAsn1(asn1,false,senha);
   const keys=pkcs12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||[];
   const plain=pkcs12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag]||[];
   const certs=pkcs12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[];
   const key=(keys.find(b=>b.key)||plain.find(b=>b.key))?.key;
   if(!key||!certs.length)throw Error('PFX sem chave privada ou certificado.');
   const cert=certs.map(b=>forge.pki.certificateToPem(b.cert)).join('\n');
   const privateKey=forge.pki.privateKeyToPem(key);
   tls.createSecureContext({key:privateKey,cert});
   return {key:privateKey,cert,modo:'compatibilidade'};
  }catch(erroForge){
   const m=String(erroForge.message||'').toLowerCase();
   if(/password|senha|mac|decrypt|invalid key|pkcs12/i.test(m))throw Error('Senha incorreta ou arquivo PFX/P12 inválido. Confira a senha exatamente como foi criada (maiúsculas, minúsculas e símbolos).');
   throw Error('Não foi possível ler o certificado PFX/P12. Confirme que o arquivo contém certificado e chave privada.');
  }
 }
}

const {exigirAdmin,json,supabaseRest,criptografar,descriptografar}=require('./_utils');
const TABLE='gnre_certificados';
async function buscar(){const rows=await supabaseRest(TABLE,{query:'?select=payload_criptografado,iv,auth_tag,atualizado_em&id=eq.principal&limit=1'});return rows?.[0]||null}
async function credenciais(){const reg=await buscar();if(reg){const obj=descriptografar(reg);return {...abrirCertificado(Buffer.from(obj.pfx,'base64'),obj.senha),origem:'portal'}}const raw=String(process.env.GNRE_CERT_PFX_BASE64||'').trim().replace(/\s/g,'').replace(/^['"]|['"]$/g,'');const pfx=Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64');return pfx.length&&process.env.GNRE_CERT_PASSWORD?{...abrirCertificado(pfx,process.env.GNRE_CERT_PASSWORD),origem:'vercel'}:{pfx,passphrase:process.env.GNRE_CERT_PASSWORD,origem:'vercel'}}
async function handler(req,res){if(!['POST','GET','DELETE'].includes(req.method))return json(res,405,{ok:false,erro:'Método não permitido'});if(!exigirAdmin(req,res))return;
 try{
 if(req.method==='GET'){const reg=await buscar();return json(res,200,{ok:true,cadastrado:!!reg,atualizado_em:reg?.atualizado_em||null,origem:reg?'portal':'variaveis_vercel'});}
 if(req.method==='DELETE'){await supabaseRest(TABLE,{method:'DELETE',query:'?id=eq.principal'});return json(res,200,{ok:true,removido:true});}
 const {arquivoBase64,senha}=req.body||{};if(typeof arquivoBase64!=='string'||typeof senha!=='string'||!senha||senha.length>512)return json(res,400,{ok:false,erro:'Selecione o arquivo A1 e informe a senha.'});
 const b64=arquivoBase64.replace(/\s/g,'');if(b64.length>350000||b64.length<100||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return json(res,400,{ok:false,erro:'Arquivo A1 inválido ou acima de 250 KB.'});
 const pfx=Buffer.from(b64,'base64');if(pfx.length<100||pfx.length>250000)return json(res,400,{ok:false,erro:'Tamanho inválido do certificado.'});
 let validado;try{validado=abrirCertificado(pfx,senha);}catch(e){return json(res,400,{ok:false,erro:e.message});}
 const enc=criptografar({pfx:b64,senha});await supabaseRest(TABLE,{method:'POST',query:'?on_conflict=id',body:{id:'principal',payload_criptografado:enc.payload,iv:enc.iv,auth_tag:enc.tag,atualizado_em:new Date().toISOString()}});
 return json(res,200,{ok:true,mensagem:'Certificado A1 validado e armazenado criptografado ('+validado.modo+'). Faça o teste de conexão GNRE.'});
 }catch(e){return json(res,503,{ok:false,erro:'Não foi possível acessar o armazenamento seguro GNRE. Confira o SQL e as variáveis de servidor.'});}}
module.exports=handler;module.exports.credenciais=credenciais;module.exports.inspecionarPfx=inspecionarPfx;module.exports.extrairCnpj=extrairCnpj;
