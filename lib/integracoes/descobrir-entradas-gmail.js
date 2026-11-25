/** V442 — Descoberta assistida, somente leitura, de CT-e recebidos no Gmail.
 * IMAP em modo EXAMINE, OAuth ou delegação de domínio existente.
 * Nunca cadastra automaticamente nem usa dados não confirmados como entradas.
 */
const {JWT,OAuth2Client}=require('google-auth-library');
const {json,exigirAdmin}=require('./_utils');
const dig=x=>String(x||'').replace(/\D/g,'');
const esc=x=>String(x||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
function bloco(xml,tag){const m=String(xml).match(new RegExp('<(?:\\w+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?'+tag+'>','i'));return m?.[1]||'';}
function campo(xml,tag){return esc(bloco(xml,tag).replace(/<[^>]+>/g,''));}
function extrair(xml,cnpj){
 const inf=bloco(xml,'infCte');
 const emit=bloco(inf,'emit'),rem=bloco(inf,'rem'),dest=bloco(inf,'dest');
 if(!inf||!bloco(inf,'ide')||!emit||!campo(bloco(inf,'ide'),'nCT'))return null;
 const destinatario=dig(campo(dest,'CNPJ')||campo(dest,'CPF'));
 const remetente=campo(rem,'xNome')||campo(bloco(inf,'exped'),'xNome');
 const numeroCte=campo(bloco(inf,'ide'),'nCT');
 const chave=(String(xml).match(/<(?:\w+:)?infCte\b[^>]*\bId=["']CTe(\d{44})["']/i)||[])[1]||'';
 const nfs=[...inf.matchAll(/<(?:(?:\w+):)?chave>\s*(\d{44})\s*<\/(?:(?:\w+):)?chave>/gi)].map(x=>x[1]);
 return {origemTransporte:[campo(bloco(inf,'ide'),'xMunIni'),campo(bloco(inf,'ide'),'UFIni')].filter(Boolean).join(' / '),destinoTransporte:[campo(bloco(inf,'ide'),'xMunFim'),campo(bloco(inf,'ide'),'UFFim')].filter(Boolean).join(' / '),dataEmissao:campo(bloco(inf,'ide'),'dhEmi'),numeroCte,chaveCte:chave,numeroNfe:nfs.length?String(Number(nfs[0].slice(25,34))):'',chavesNfe:[...new Set(nfs)].slice(0,10),remetente:remetente||'',cnpjRemetente:dig(campo(rem,'CNPJ')||campo(rem,'CPF')),transportadora:campo(emit,'xNome')||'',cnpjTransportadora:dig(campo(emit,'CNPJ')),destinatario:campo(dest,'xNome')||'',cnpjDestinatario:destinatario,destinatarioConfirmado:destinatario.length===14&&destinatario===cnpj,destinatarioInformado:!!destinatario};
}
// Leitura IMAP limitada: TLS, EXAMINE e nenhum comando de alteração.
async function lerImap(req,res,email,cnpj){
 const pass=String(process.env.GMAIL_READ_APP_PASSWORD||'').replace(/\s/g,'');
 if(!email||!/^[a-zA-Z0-9]{16}$/.test(pass))return json(res,200,{ok:false,configuracao:true,erro:'Preencha GMAIL_READ_APP_PASSWORD na Vercel com a senha de aplicativo da conta Gmail cadastrada. O envio SMTP permanece intacto.'});
 const filtro=dig(req.body?.chaveNfe);
 if(filtro&&filtro.length!==44)return json(res,400,{ok:false,erro:'Chave NF-e inválida.'});
 const {ImapFlow}=require('imapflow');
 const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:email,pass},
  logger:false,logRaw:false,disableAutoIdle:true,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
  connectionTimeout:7000,greetingTimeout:7000,socketTimeout:10000});
 const deadline=Date.now()+20000;
 let expirou=false,lock;
 const timer=setTimeout(()=>{expirou=true;try{client.close()}catch(_){}},20000);
 client.on('error',()=>{});
 try{
  await client.connect();
  if(req.body?.testeConexao===true){
   lock=await client.getMailboxLock('INBOX',{readOnly:true});
   return json(res,200,{ok:true,fonte:'Gmail — IMAP',conta:email,modo:'imap',testeConexao:true,resultados:[],aviso:'Conexão e abertura somente leitura confirmadas. Nenhuma mensagem baixada.'});
  }
  const pastas=await client.list();
  const pasta=pastas.find(x=>x.specialUse==='\\All')?.path||'INBOX';
  lock=await client.getMailboxLock(pasta,{readOnly:true});
  const dias=Math.min(30,Math.max(1,Math.trunc(Number(req.body?.dias)||7)));
  const uids=await client.search({gmraw:'newer_than:'+dias+'d has:attachment filename:xml -in:trash -in:spam'},{uid:true});
  const ids=Array.isArray(uids)?uids.slice().sort((a,b)=>b-a).slice(0,25):[];
  const resultados=[],vistos=new Set();let examinados=0,mensagens=0,parcial=false;
  function anexos(node,out=[]){
   if(!node)return out;
   const nome=node.dispositionParameters?.filename||node.parameters?.name||'';
   if(node.part&&/\.xml$/i.test(nome)&&Number(node.size||0)<=1200000)out.push({part:node.part,nome});
   for(const child of node.childNodes||[])anexos(child,out);
   return out;
  }
  for(const uid of ids){
   if(Date.now()>deadline-3500){parcial=true;break}
   const m=await client.fetchOne(uid,{bodyStructure:true,internalDate:true},{uid:true});
   mensagens++;
   for(const part of anexos(m?.bodyStructure).slice(0,4)){
    if(Date.now()>deadline-2500){parcial=true;break}
    const {content}=await client.download(uid,part.part,{uid:true,maxBytes:800001});
    if(!content)continue;
    const chunks=[];let size=0;
    for await(const chunk of content){size+=chunk.length;if(size>800000){chunks.length=0;break}chunks.push(chunk)}
    if(!chunks.length||size>800000)continue;
    examinados++;
    const xml=Buffer.concat(chunks).toString('utf8');
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))continue;
    const item=extrair(xml,cnpj);
    if(!item||!item.destinatarioConfirmado||(filtro&&!item.chavesNfe.includes(filtro)))continue;
    const key=item.chaveCte||[item.cnpjTransportadora,item.numeroCte,item.chavesNfe.join(',')].join('|');
    if(vistos.has(key))continue;vistos.add(key);
    item.arquivo=part.nome;item.origem='Gmail IMAP — CT-e XML';
    item.dataEmail=m.internalDate?new Date(m.internalDate).toISOString():'';
    resultados.push(item);
   }
  }
  return json(res,200,{ok:true,fonte:'Gmail IMAP — CT-e XML',conta:email,modo:'imap',
   totalMensagens:mensagens,anexosExaminados:examinados,resultados:resultados.slice(0,50),
   parcial:parcial||ids.length<(uids?.length||0),aviso:'Somente leitura pelo portal. Busca limitada aos XMLs recentes e destinatário confirmado; nenhum cadastro automático.'});
 }catch(e){
  return json(res,200,{ok:false,erro:expirou?'Tempo limite da consulta Gmail. Tente novamente com um período menor.':'Não foi possível conectar ou ler o Gmail por IMAP. Confira a senha de aplicativo, conta cadastrada e permissão IMAP. Nenhum segredo exibido.'});
 }finally{
  clearTimeout(timer);try{lock?.release()}catch(_){}
  try{client.close()}catch(_){}
 }
}

module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=dig(process.env.SOFISTICATTO_CNPJ);
 if(cnpj.length!==14)return json(res,200,{ok:false,configuracao:true,erro:'Configure SOFISTICATTO_CNPJ na Vercel.'});
 const email=String(process.env.GOOGLE_GMAIL_ADMIN_USER||'').trim().toLowerCase();
 if(String(process.env.GMAIL_READ_MODE||'').toLowerCase()==='imap')return lerImap(req,res,email,cnpj);
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
