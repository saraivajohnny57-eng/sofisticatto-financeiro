const { JWT } = require('google-auth-library');

function json(res,status,body){ res.status(status).json(body); }
function cfg(){
  const client_email=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim();
  const private_key=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  const subject=String(process.env.GOOGLE_GMAIL_ADMIN_USER||process.env.SMTP_USER||'').trim().toLowerCase();
  if(!client_email||!private_key||!subject) throw new Error('Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY e GOOGLE_GMAIL_ADMIN_USER na Vercel.');
  return {client_email,private_key,subject};
}
async function token(){
  const c=cfg();
  const auth=new JWT({email:c.client_email,key:c.private_key,scopes:['https://www.googleapis.com/auth/gmail.settings.basic'],subject:c.subject});
  const t=await auth.getAccessToken();
  if(!t.token) throw new Error('Não foi possível autenticar a Service Account no Google Workspace.');
  return {token:t.token,subject:c.subject};
}
async function gmail(path,opts={}){
  const a=await token();
  const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(a.subject)}${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json',...(opts.headers||{})}
  });
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok){ const e=new Error(data?.error?.message||`Google Gmail API retornou HTTP ${r.status}`); e.status=r.status; e.google=data; throw e; }
  return data;
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,erro:'Método não permitido.'});}
  try{
    const {acao,email,nome}=req.body||{};
    const addr=String(email||'').trim().toLowerCase();
    if(!addr||!addr.includes('@')) return json(res,400,{ok:false,erro:'Informe um e-mail válido.'});
    if(acao==='status'){
      try{const d=await gmail(`/settings/sendAs/${encodeURIComponent(addr)}`);return json(res,200,{ok:true,email:addr,status:d.verificationStatus||'accepted',dados:d});}
      catch(e){if(e.status===404)return json(res,200,{ok:true,email:addr,status:'nao_cadastrado'});throw e;}
    }
    if(acao==='cadastrar'){
      let existente=null; try{existente=await gmail(`/settings/sendAs/${encodeURIComponent(addr)}`);}catch(e){if(e.status!==404)throw e;}
      if(!existente){
        existente=await gmail('/settings/sendAs',{method:'POST',body:JSON.stringify({sendAsEmail:addr,displayName:String(nome||'Sofisticatto Cosméticos').trim(),replyToAddress:addr})});
      }
      return json(res,200,{ok:true,email:addr,status:existente.verificationStatus||'accepted',mensagem:existente.verificationStatus==='pending'?'Cadastro criado. O Google enviou a confirmação para este endereço.':'Remetente autorizado no Google Workspace.'});
    }
    if(acao==='reenviar'){
      await gmail(`/settings/sendAs/${encodeURIComponent(addr)}/verify`,{method:'POST',body:'{}'});
      return json(res,200,{ok:true,email:addr,status:'pending',mensagem:'E-mail de confirmação reenviado pelo Google.'});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){console.error('gmail-remetentes',e.google||e);return json(res,e.status||500,{ok:false,erro:e.message,detalhes:e.google?.error?.status||null});}
};
