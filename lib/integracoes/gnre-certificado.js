// V423 — certificado A1 GNRE, armazenado somente cifrado no Supabase via service role.
const tls=require('tls');
const {exigirAdmin,json,supabaseRest,criptografar,descriptografar}=require('./_utils');
const TABLE='gnre_certificados';
async function buscar(){const rows=await supabaseRest(TABLE,{query:'?select=payload_criptografado,iv,auth_tag,atualizado_em&id=eq.principal&limit=1'});return rows?.[0]||null}
async function credenciais(){const reg=await buscar();if(reg){const obj=descriptografar(reg);return {pfx:Buffer.from(obj.pfx,'base64'),passphrase:obj.senha,origem:'portal'}}const raw=String(process.env.GNRE_CERT_PFX_BASE64||'').trim().replace(/\s/g,'').replace(/^['"]|['"]$/g,'');return {pfx:Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64'),passphrase:process.env.GNRE_CERT_PASSWORD,origem:'vercel'}}
async function handler(req,res){if(!['POST','GET','DELETE'].includes(req.method))return json(res,405,{ok:false,erro:'Método não permitido'});if(!exigirAdmin(req,res))return;
 try{
 if(req.method==='GET'){const reg=await buscar();return json(res,200,{ok:true,cadastrado:!!reg,atualizado_em:reg?.atualizado_em||null,origem:reg?'portal':'variaveis_vercel'});}
 if(req.method==='DELETE'){await supabaseRest(TABLE,{method:'DELETE',query:'?id=eq.principal'});return json(res,200,{ok:true,removido:true});}
 const {arquivoBase64,senha}=req.body||{};if(typeof arquivoBase64!=='string'||typeof senha!=='string'||!senha||senha.length>512)return json(res,400,{ok:false,erro:'Selecione o arquivo A1 e informe a senha.'});
 const b64=arquivoBase64.replace(/\s/g,'');if(b64.length>350000||b64.length<100||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return json(res,400,{ok:false,erro:'Arquivo A1 inválido ou acima de 250 KB.'});
 const pfx=Buffer.from(b64,'base64');if(pfx.length<100||pfx.length>250000)return json(res,400,{ok:false,erro:'Tamanho inválido do certificado.'});
 try{tls.createSecureContext({pfx,passphrase:senha});}catch{return json(res,400,{ok:false,erro:'Não foi possível abrir o PFX/P12. Confira o arquivo e a senha.'});}
 const enc=criptografar({pfx:b64,senha});await supabaseRest(TABLE,{method:'POST',query:'?on_conflict=id',body:{id:'principal',payload_criptografado:enc.payload,iv:enc.iv,auth_tag:enc.tag,atualizado_em:new Date().toISOString()}});
 return json(res,200,{ok:true,mensagem:'Certificado A1 validado e armazenado criptografado. Faça o teste de conexão GNRE.'});
 }catch(e){return json(res,503,{ok:false,erro:'Não foi possível acessar o armazenamento seguro GNRE. Confira o SQL e as variáveis de servidor.'});}}
module.exports=handler;module.exports.credenciais=credenciais;
