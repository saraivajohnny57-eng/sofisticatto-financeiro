// V423 — certificado A1 GNRE, armazenado somente cifrado no Supabase via service role.
const crypto=require('crypto');
const tls=require('tls');
const forge=require('node-forge');
// ICP-Brasil: para e-CNPJ o identificador deve ser extraido do SAN
// otherName OID 2.16.76.1.3.3 ou do serialNumber (novo perfil).
// Nunca tentar adivinhar um CNPJ pelos dados do responsavel/CPF.
const OID_CNPJ='2.16.76.1.3.3';
const OID_SERIAL='2.5.4.5';
function extrairCnpj(texto){
 const raw=String(texto||'').trim();
 const m=raw.match(/(?:^|[:=])\s*(\d{14})$/)
   ||raw.match(/(?:^|[:=])\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
 return m?m[1].replace(/\D/g,''):null;
}
function cnpjEmAsn(node,depth=0){
 if(depth>6||node==null)return null;
 if(Array.isArray(node)){
  for(const n of node){const found=cnpjEmAsn(n,depth+1);if(found)return found;}
  return null;
 }
 if(typeof node==='object')return cnpjEmAsn(node.value,depth+1);
 if(typeof node!=='string')return null;
 if(/^\d{14}$/.test(node))return node;
 // Conteudo OtherName pode conter uma OCTET STRING ASN.1 encapsulada.
 try{
  const decoded=forge.asn1.fromDer(forge.util.createBuffer(node));
  return cnpjEmAsn(decoded,depth+1);
 }catch{return null;}
}
function identificarCnpjCertificado(pem){
 const cert=forge.pki.certificateFromPem(pem);
 const san=cert.getExtension('subjectAltName');
 const outros=(san?.altNames||[]).filter(a=>a.type===0&&Array.isArray(a.value));
 const encontrados=[];
 for(const alt of outros){
  try{
   if(forge.asn1.derToOid(alt.value[0]?.value)!==OID_CNPJ)continue;
   const cnpj=cnpjEmAsn(alt.value[1]);
   if(cnpj)encontrados.push({cnpj,origem:'san_cnpj_icp_brasil'});
  }catch{ /* Nao inferir de campos OtherName desconhecidos. */ }
 }
 // Serial Number do DN no perfil ICP-Brasil atualizado.
 const attrs=cert.subject?.attributes||[];
 for(const a of attrs){
  if(a.type!==OID_SERIAL&&a.name!=='serialNumber')continue;
  const cnpj=extrairCnpj(a.value);
  if(cnpj)encontrados.push({cnpj,origem:'subject_serial_number'});
 }
 // Ultimo recurso estrito: CN do titular, nao nome do responsavel.
 const cn=attrs.find(a=>a.type==='2.5.4.3'||a.name==='commonName')?.value;
 const cnpjCn=extrairCnpj(cn);
 if(cnpjCn)encontrados.push({cnpj:cnpjCn,origem:'subject_cn'});
 const valores=[...new Set(encontrados.map(e=>e.cnpj))];
 if(valores.length!==1)return {cnpj:null,origem:valores.length?'identificadores_divergentes':'nao_localizado'};
 // Se tiver SAN, usa sua origem como fonte primaria, sem omitir inconsistencias.
 return {cnpj:valores[0],origem:encontrados[0].origem};
}
function metadadosCertificadoPem(pem){
 const cert=new crypto.X509Certificate(pem);
 const inicio=Date.parse(cert.validFrom),fim=Date.parse(cert.validTo);
 const now=Date.now();
 const datasValidas=Number.isFinite(inicio)&&Number.isFinite(fim);
 let id;
 try{id=identificarCnpjCertificado(pem);}
 catch{
  // Fallback estrito ao DN do TITULAR quando a biblioteca ASN.1 nao oferece SAN.
  // Nao vasculhar outros atributos, como o CPF do responsavel pelo A1.
  const subject=String(cert.subject||'');
  const serial=subject.match(/(?:^|\n)serialNumber=([^\r\n]+)/i)?.[1]||'';
  const cn=subject.match(/(?:^|\n)CN=([^\r\n]+)/i)?.[1]||'';
  const a=extrairCnpj(serial),b=extrairCnpj(cn);
  id=a&&b&&a!==b
   ?{cnpj:null,origem:'identificadores_divergentes'}
   :{cnpj:a||b||null,origem:a?'subject_serial_number':b?'subject_cn':'nao_localizado'};
 }
 return {
  ok:true,
  formato:'PKCS#12',
  // Metadados limitados; nunca incluir material criptografico na resposta.
  titular:String(cert.subject||''),
  emissor:String(cert.issuer||''),
  valido_de:datasValidas?new Date(inicio).toISOString():null,
  valido_ate:datasValidas?new Date(fim).toISOString():null,
  expirado:datasValidas?(now<inicio||now>fim):null,
  cnpj:id.cnpj,
  cnpj_origem:id.origem,
  fingerprint256:cert.fingerprint256,
  chave_publica:cert.publicKey?.asymmetricKeyType||null
 };
}
// Inspeciona PFX nativo sem devolver senha, chave nem conteudo binario.
function inspecionarPfx(pfx,senha){
 if(!Buffer.isBuffer(pfx)||pfx.length<100)throw new TypeError('PFX vazio ou invalido.');
 let contexto;
 try{contexto=tls.createSecureContext({pfx,passphrase:String(senha||'')});}
 catch{throw new Error('Senha incorreta ou arquivo PFX/P12 invalido.');}
 const der=contexto.context.getCertificate();
 if(!der)throw new Error('Certificado nao encontrado no PFX.');
 const pem='-----BEGIN CERTIFICATE-----\n'+der.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----';
 return metadadosCertificadoPem(pem);
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
   return {key:privateKey,cert,modo:'compatibilidade',meta:metadadosCertificadoPem(cert)};
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
module.exports.metadadosCertificadoPem=metadadosCertificadoPem;
module.exports.identificarCnpjCertificado=identificarCnpjCertificado;
module.exports.abrirCertificado=abrirCertificado;
