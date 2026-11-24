/** V442 — Descoberta assistida, somente leitura, de CT-e recebidos no Gmail.
 * OAuth de uma caixa autorizada ou delegação de domínio existente; escopo gmail.readonly.
 * Nunca cadastra automaticamente nem usa dados não confirmados como entradas.
 */
const {JWT,OAuth2Client}=require('google-auth-library');
const {json,exigirAdmin}=require('./_utils');
const dig=x=>String(x||'').replace(/\D/g,'');
const esc=x=>String(x||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
function bloco(xml,tag){const m=String(xml).match(new RegExp('<(?:\\w+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?'+tag+'>','i'));return m?.[1]||'';}
function campo(xml,tag){return esc(bloco(xml,tag).replace(/<[^>]+>/g,''));}
function extrair(xml,cnpj){
 const inf=bloco(xml,'infCte')||xml;
 const emit=bloco(inf,'emit'),rem=bloco(inf,'rem'),dest=bloco(inf,'dest');
 if(!inf||!bloco(inf,'ide')||!emit)return null;
 const destinatario=dig(campo(dest,'CNPJ')||campo(dest,'CPF'));
 const remetente=campo(rem,'xNome')||campo(bloco(inf,'exped'),'xNome');
 const numeroCte=campo(bloco(inf,'ide'),'nCT');
 const chave=(String(xml).match(/<(?:\w+:)?infCte\b[^>]*\bId=["']CTe(\d{44})["']/i)||[])[1]||'';
 const nfs=[...inf.matchAll(/<(?:(?:\w+):)?chave>\s*(\d{44})\s*<\/(?:(?:\w+):)?chave>/gi)].map(x=>x[1]);
 return {numeroCte,chaveCte:chave,numeroNfe:nfs.length?String(Number(nfs[0].slice(25,34))):'',chavesNfe:[...new Set(nfs)].slice(0,10),remetente:remetente||'',cnpjRemetente:dig(campo(rem,'CNPJ')||campo(rem,'CPF')),transportadora:campo(emit,'xNome')||'',cnpjTransportadora:dig(campo(emit,'CNPJ')),destinatario:campo(dest,'xNome')||'',cnpjDestinatario:destinatario,destinatarioConfirmado:destinatario.length===14&&destinatario===cnpj,destinatarioInformado:!!destinatario};
}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=dig(process.env.SOFISTICATTO_CNPJ);
 if(cnpj.length!==14)return json(res,200,{ok:false,configuracao:true,erro:'Configure SOFISTICATTO_CNPJ na Vercel.'});
 const email=String(process.env.GOOGLE_GMAIL_ADMIN_USER||'').trim().toLowerCase();
 const sa=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim();
 const key=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n');
 const clientId=String(process.env.GMAIL_READ_CLIENT_ID||'').trim();
 const clientSecret=String(process.env.GMAIL_READ_CLIENT_SECRET||'').trim();
 const refreshToken=String(process.env.GMAIL_READ_REFRESH_TOKEN||'').trim();
 const oauth=[clientId,clientSecret,refreshToken];
 const modo=oauth.some(Boolean)?'oauth':'delegacao';
 if(!email||(modo==='oauth'?!oauth.every(Boolean):!sa||!key))
  return json(res,200,{ok:false,configuracao:true,erro:'Leitura do Gmail ainda não autorizada. Configure as credenciais OAuth de leitura na Vercel (GMAIL_READ_CLIENT_ID, GMAIL_READ_CLIENT_SECRET, GMAIL_READ_REFRESH_TOKEN) ou a delegação Google Workspace existente. O envio SMTP permanece independente.'});
 const scope='https://www.googleapis.com/auth/gmail.readonly';
 try{
  let client;
  if(modo==='oauth'){
   client=new OAuth2Client(clientId,clientSecret);
   client.setCredentials({refresh_token:refreshToken});
  }else client=new JWT({email:sa,key,subject:email,scopes:[scope]});
  const auth=await client.getAccessToken();if(!auth.token)throw Error('auth');
  if(modo==='oauth'){
   const info=await client.getTokenInfo(auth.token);
   if(!Array.isArray(info.scopes)||!info.scopes.includes(scope)||
      info.scopes.some(x=>x!==scope&&!['openid','email','profile','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'].includes(x)))
     return json(res,200,{ok:false,erro:'A autorização OAuth precisa conter gmail.readonly, sem outros escopos de acesso a dados.'});
  }
  const base='https://gmail.googleapis.com/gmail/v1/users/me';
  async function get(path){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(base+path,{headers:{Authorization:'Bearer '+auth.token},signal:controller.signal});const d=await r.json();if(!r.ok)throw Error('Gmail HTTP '+r.status);return d;}finally{clearTimeout(t)}}
  const perfil=await get('/profile');
  if(String(perfil.emailAddress||'').trim().toLowerCase()!==email)
   return json(res,200,{ok:false,erro:'A conta autorizada não corresponde à caixa de faturamento configurada. Nenhuma mensagem foi consultada.'});
  if(req.body?.testeConexao===true)
   return json(res,200,{ok:true,fonte:'Gmail — somente leitura',conta:email,modo,testeConexao:true,resultados:[],aviso:'Conexão confirmada; nenhuma mensagem ou anexo foi consultado.'});
  const dias=Math.min(30,Math.max(1,Number(req.body?.dias)||7));
  const query=encodeURIComponent(`newer_than:${dias}d has:attachment {filename:xml filename:XML} -in:trash -in:spam`);
  const lista=await get(`/messages?maxResults=25&q=${query}`);
  const filtro=dig(req.body?.chaveNfe);
  if(filtro&&filtro.length!==44)return json(res,400,{ok:false,erro:'Chave NF-e inválida.'});
  const resultados=[];let examinados=0;
  for(const msg of (lista.messages||[]).slice(0,25)){
   const m=await get(`/messages/${encodeURIComponent(msg.id)}?format=full`);
   const parts=[];function walk(p){if(!p)return; if(p.filename&&/\.xml$/i.test(p.filename))parts.push(p);(p.parts||[]).forEach(walk)}walk(m.payload);
   for(const p of parts.slice(0,4)){
    if((p.body?.size||0)>800000)continue;
    let data=p.body?.data;
    if(!data&&p.body?.attachmentId){const a=await get(`/messages/${encodeURIComponent(msg.id)}/attachments/${encodeURIComponent(p.body.attachmentId)}`);data=a.data;}
    if(!data)continue;examinados++;
    const xml=Buffer.from(data.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
    const item=extrair(xml,cnpj);if(item&&(!filtro||item.chavesNfe.includes(filtro))){item.arquivo=p.filename;item.origem='Gmail — CT-e XML';item.dataEmail=m.internalDate?new Date(Number(m.internalDate)).toISOString():'';resultados.push(item)}
   }
  }
  return json(res,200,{ok:true,fonte:'Gmail — XML CT-e',conta:email,totalMensagens:(lista.messages||[]).length,anexosExaminados:examinados,resultados:resultados.slice(0,50),aviso:'Somente leitura. A lista não é exaustiva; nenhuma mercadoria é cadastrada automaticamente. CT-es com destinatário não confirmado exigem conferência.'});
 }catch(e){return json(res,200,{ok:false,erro:'Não foi possível autorizar ou consultar o Gmail. Confira as credenciais de leitura e a autorização da conta no Google.',orientacao:'A permissão de envio SMTP não concede leitura. Nenhum segredo é exibido.'})}
};
