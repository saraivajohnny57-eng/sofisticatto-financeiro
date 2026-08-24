const crypto = require('crypto');
const nodemailer = require('nodemailer');

function responder(res,status,corpo){ res.status(status).json(corpo); }
function norm(v){ return String(v||'').trim(); }
function adminAutorizado(req){
  const esperado=norm(process.env.INTEGRATIONS_ADMIN_KEY);
  const recebido=norm(req.headers['x-integrations-key']||req.headers['x-admin-key']);
  return !!esperado && recebido===esperado;
}
function supabaseConfig(){
  const url=norm(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key=norm(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!url||!key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas na Vercel.');
  return {url:url.replace(/\/$/,''),key};
}
async function sb(path,opts={}){
  const {url,key}=supabaseConfig();
  const r=await fetch(url+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})}});
  const txt=await r.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error((data&&data.message)||txt||('Supabase HTTP '+r.status));
  return data;
}
function masterKey(){
  const {key}=supabaseConfig();
  return crypto.createHash('sha256').update('sofisticatto:smtp:v60:'+key).digest();
}
function cifrar(texto){
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',masterKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(texto),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {senha_cifrada:encrypted.toString('base64'),iv:iv.toString('base64'),tag:tag.toString('base64')};
}
function decifrar(row){
  const d=crypto.createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(row.iv,'base64'));
  d.setAuthTag(Buffer.from(row.tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(row.senha_cifrada,'base64')),d.final()]).toString('utf8');
}
async function obter(email){
  const e=encodeURIComponent(String(email).toLowerCase());
  const rows=await sb(`email_remetentes_smtp?email=eq.${e}&select=*`);
  return Array.isArray(rows)?rows[0]:null;
}
function transporter(email,senha){
  return nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE||'true').toLowerCase()==='true',auth:{user:email,pass:senha}});
}
module.exports=async function handler(req,res){
  if(req.method!=='POST') return responder(res,405,{ok:false,erro:'Método não permitido.'});
  if(!adminAutorizado(req)) return responder(res,401,{ok:false,erro:'Chave administrativa inválida.'});
  try{
    const {acao,login,email,nome,senha_app}=req.body||{};
    const em=norm(email).toLowerCase();
    if(!em) return responder(res,400,{ok:false,erro:'Informe o e-mail remetente.'});
    if(acao==='status'){
      const row=await obter(em);
      return responder(res,200,{ok:true,configurado:!!row,ativo:!!row?.ativo,testado_em:row?.testado_em||null,ultimo_erro:row?.ultimo_erro||null});
    }
    if(acao==='desativar'){
      await sb(`email_remetentes_smtp?email=eq.${encodeURIComponent(em)}`,{method:'PATCH',body:JSON.stringify({ativo:false,updated_at:new Date().toISOString()})});
      return responder(res,200,{ok:true,mensagem:'Remetente desativado.'});
    }
    if(acao==='salvar'){
      const pass=String(senha_app||'').replace(/\s+/g,'');
      if(pass.length<12) return responder(res,400,{ok:false,erro:'Informe a senha de aplicativo do Google. Ela normalmente possui 16 caracteres.'});
      const c=cifrar(pass); const agora=new Date().toISOString();
      const payload={usuario_login:norm(login)||null,email:em,nome_exibicao:norm(nome)||null,...c,ativo:true,updated_at:agora};
      const atual=await obter(em);
      if(atual) await sb(`email_remetentes_smtp?email=eq.${encodeURIComponent(em)}`,{method:'PATCH',body:JSON.stringify(payload)});
      else await sb('email_remetentes_smtp',{method:'POST',body:JSON.stringify({...payload,created_at:agora})});
      return responder(res,200,{ok:true,mensagem:'Senha de aplicativo armazenada de forma criptografada.'});
    }
    if(acao==='testar'){
      const row=await obter(em);
      if(!row||!row.ativo) return responder(res,404,{ok:false,erro:'Este remetente ainda não possui senha de aplicativo ativa.'});
      let pass; try{pass=decifrar(row)}catch{throw new Error('Não foi possível descriptografar a credencial. Se a Service Role do Supabase foi trocada, cadastre a senha novamente.');}
      const t=transporter(em,pass); await t.verify();
      const nomeFinal=norm(nome)||norm(row.nome_exibicao)||'Sofisticatto Cosméticos';
      await t.sendMail({from:`"${nomeFinal.replace(/"/g,'')}" <${em}>`,to:em,subject:'Teste de remetente — Portal Sofisticatto',text:'Seu e-mail foi configurado com sucesso como remetente no Portal Sofisticatto.'});
      await sb(`email_remetentes_smtp?email=eq.${encodeURIComponent(em)}`,{method:'PATCH',body:JSON.stringify({testado_em:new Date().toISOString(),ultimo_erro:null,ativo:true,updated_at:new Date().toISOString()})});
      return responder(res,200,{ok:true,mensagem:'Teste concluído. Um e-mail de confirmação foi enviado para '+em+'.'});
    }
    return responder(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){ console.error('Erro /api/remetentes-smtp:',e); return responder(res,500,{ok:false,erro:e.message||'Falha ao configurar remetente.'}); }
};
