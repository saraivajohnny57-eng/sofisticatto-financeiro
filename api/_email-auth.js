const crypto=require('crypto');
function config(){return {url:String(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,''),key:String(process.env.SUPABASE_SERVICE_ROLE_KEY||'')};}
async function validar(req){
 const {url,key}=config(); if(!url||!key)throw Object.assign(new Error('Supabase não configurado.'),{status:503});
 const login=String(req.body?.login||'').trim(),senha=String(req.body?.senha||'');
 if(!login||!senha)throw Object.assign(new Error('Confirme sua senha para enviar documentos.'),{status:401});
 const r=await fetch(`${url}/rest/v1/usuarios?login=eq.${encodeURIComponent(login)}&select=id,login,tipo,senha,ativo&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!r.ok)throw Object.assign(new Error('Não foi possível validar o usuário.'),{status:503});
 const [u]=await r.json();
 const ok=u&&u.ativo!==false&&['financeiro','admin','gerente','vendedora'].includes(String(u.tipo||'').toLowerCase())&&crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(String(u.senha||'')).digest('hex')),Buffer.from(crypto.createHash('sha256').update(senha).digest('hex')));
 if(!ok)throw Object.assign(new Error('Usuário ou senha inválidos para envio de documentos.'),{status:401});
 return {usuario:u,url,key};
}
module.exports={validar,config};
