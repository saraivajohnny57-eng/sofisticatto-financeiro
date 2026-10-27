/** V442 — Descoberta assistida, somente leitura, de CT-e recebidos no Gmail.
 * Requer delegação de domínio Google Workspace e escopo gmail.readonly.
 * Nunca cadastra automaticamente nem usa dados não confirmados como entradas.
 */
const {JWT}=require('google-auth-library');
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
 const chave=(inf.match(/Id=["']CTe(\d{44})["']/i)||[])[1]||'';
 const nfs=[...inf.matchAll(/<(?:(?:\w+):)?chave>\s*(\d{44})\s*<\/(?:(?:\w+):)?chave>/gi)].map(x=>x[1]);
 return {numeroCte,chaveCte:chave,numeroNfe:nfs.length?String(Number(nfs[0].slice(25,34))):'',chavesNfe:[...new Set(nfs)].slice(0,10),remetente:remetente||'',cnpjRemetente:dig(campo(rem,'CNPJ')||campo(rem,'CPF')),transportadora:campo(emit,'xNome')||'',cnpjTransportadora:dig(campo(emit,'CNPJ')),destinatario:campo(dest,'xNome')||'',cnpjDestinatario:destinatario,destinatarioConfirmado:destinatario.length===14&&destinatario===cnpj,destinatarioInformado:!!destinatario};
}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=dig(process.env.SOFISTICATTO_CNPJ);
 if(cnpj.length!==14)return json(res,200,{ok:false,configuracao:true,erro:'Configure SOFISTICATTO_CNPJ na Vercel.'});
 const email=String(process.env.GOOGLE_GMAIL_ADMIN_USER||'').trim();
 const sa=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim();
 const key=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n');
 if(!email||!sa||!key)return json(res,200,{ok:false,configuracao:true,erro:'Configure GOOGLE_GMAIL_ADMIN_USER, GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. A conta de serviço precisa de delegação de domínio para gmail.readonly.'});
 try{
  const jwt=new JWT({email:sa,key,subject:email,scopes:['https://www.googleapis.com/auth/gmail.readonly']});
  const auth=await jwt.getAccessToken();if(!auth.token)throw Error('Não foi possível obter autorização Gmail.');
  const base=`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(email)}`;
  async function get(path){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(base+path,{headers:{Authorization:`Bearer ${auth.token}`},signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(`Gmail HTTP ${r.status}: ${String(d.error?.message||'acesso negado').slice(0,160)}`);return d;}finally{clearTimeout(t)}}
  const dias=Math.min(30,Math.max(1,Number(req.body?.dias)||7));
  const query=encodeURIComponent(`newer_than:${dias}d has:attachment {filename:xml filename:XML} -in:trash -in:spam`);
  const lista=await get(`/messages?maxResults=25&q=${query}`);
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
    const item=extrair(xml,cnpj);if(item){item.arquivo=p.filename;item.origem='Gmail — CT-e XML';item.dataEmail=m.internalDate?new Date(Number(m.internalDate)).toISOString():'';resultados.push(item)}
   }
  }
  return json(res,200,{ok:true,fonte:'Gmail — XML CT-e',conta:email,totalMensagens:(lista.messages||[]).length,anexosExaminados:examinados,resultados:resultados.slice(0,50),aviso:'Somente leitura. A lista não é exaustiva; nenhuma mercadoria é cadastrada automaticamente. CT-es com destinatário não confirmado exigem conferência.'});
 }catch(e){return json(res,200,{ok:false,erro:'Falha na leitura do Gmail: '+String(e.message||e).slice(0,220),orientacao:'Confirme a delegação de domínio do Google Workspace com escopo https://www.googleapis.com/auth/gmail.readonly. A autorização de envio não concede leitura.'})}
};
