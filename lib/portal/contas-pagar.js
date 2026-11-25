// Contas a pagar — Gmail EXAMINE; somente usuários financeiros ativos.
const auth=require('./secure');
const crypto=require('node:crypto');
const TABLE='/rest/v1/contas_pagar_v1';
const dig=v=>String(v||'').replace(/\D/g,'');
const uuid=v=>/^[a-f0-9-]{36}$/i.test(String(v||''));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return null;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?v:null};
const limit=(v,n)=>String(v||'').trim().slice(0,n);
function err(msg,status=400){throw Object.assign(new Error(msg),{status,public:true})}
function dv10(v){let s=0,f=2;for(let i=v.length-1;i>=0;i--){let x=Number(v[i])*f;s+=x>9?x-9:x;f=3-f}return (10-s%10)%10}
function validLine(v){if(!/^\d{47}$/.test(v))return false;
 if([v.slice(0,9),v.slice(10,20),v.slice(21,31)].some((x,i)=>dv10(x)!==Number(v[[9,20,31][i]])))return false;
 const b=v.slice(0,4)+v[32]+v.slice(33)+v.slice(4,9)+v.slice(10,20)+v.slice(21,31);
 let s=0,f=2;for(let i=43;i>=0;i--){if(i===4)continue;s+=Number(b[i])*f;f=f===9?2:f+1}
 const d=11-s%11;return Number(b[4])===([0,10,11].includes(d)?1:d);
}
function lines(t){const all=String(t||'').match(/(?<!\d)\d{5}[.\s]?\d{5}[\s]*\d{5}[.\s]?\d{6}[\s]*\d{5}[.\s]?\d{6}[\s]*\d[\s]*\d{14}(?!\d)/g)||[];return [...new Set(all.map(dig).filter(validLine))]}
function inspect(t,filename){
 const l=lines(t);const norm=String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const named=/\b(boleto|bloqueto|duplicata)\b/i.test(filename.replace(/[_-]/g,' '));
 const candidate=l.length>0||named||(/beneficiario/.test(norm)&&/vencimento/.test(norm)&&/pagador|sacado/.test(norm));
 if(!candidate)return null;
 const line=l.length===1?l[0]:null;
 const amount=line?Number(line.slice(37)):null;
 // Valor nominal codificado é uma sugestão. Nenhum documento é declarado em aberto automaticamente.
 const due=[...new Set((String(t).match(/(?:vencimento|vence em)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/gi)||[]).map(x=>x.match(/(\d{2})\/(\d{2})\/(\d{4})/)).map(x=>date(x[3]+'-'+x[2]+'-'+x[1])).filter(Boolean))];
 return {linha_digitavel:line,valor_centavos:amount>0?amount:null,vencimento:due.length===1?due[0]:null,observacao:l.length>1?'Mais de uma linha digitável no PDF. Conferir e separar manualmente.':line?'Linha digitável com dígitos verificadores válidos. Conferir beneficiário, pagador e vencimento.':'Possível boleto sem linha validada; revisar PDF.'};
}
function classify(name){const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]/g,' ');
 if(/\.xml$/.test(n))return 'XML';if(/\.pdf$/.test(n)){if(/\b(danfe|nf e|nfe|nota fiscal|nf)\b/.test(n))return 'NF';if(/\b(dacte|cte|ct e)\b/.test(n))return 'CT-e';if(/relatorio/.test(n))return 'Relatório';if(/fatura/.test(n))return 'Fatura';if(/comprovante/.test(n))return 'Comprovante';if(/boleto|bloqueto/.test(n))return 'Boleto';return 'PDF anexo'}return 'Anexo';
}
function attachments(n,out=[]){if(!n)return out;const name=n.dispositionParameters?.filename||n.parameters?.name||'';if(n.part&&name&&/\.(pdf|xml)$/i.test(name)&&Number(n.size||0)<=4000000)out.push({parte:String(n.part),nome:limit(name,180),tipo:classify(name)});for(const c of n.childNodes||[])attachments(c,out);return out}
async function db(q,options={}){const r=await auth.db(TABLE+q,options);return r.status===204?null:r.json()}
async function row(id){if(!uuid(id))err('Identificador inválido');const r=await db('?id=eq.'+encodeURIComponent(id)+'&limit=1');if(!r[0])err('Boleto não localizado',404);return r[0]}
async function mail(fn){const user=String(process.env.GOOGLE_GMAIL_ADMIN_USER||'').trim().toLowerCase(),pass=String(process.env.GMAIL_READ_APP_PASSWORD||'').replace(/\s/g,'');if(!user||!/^[A-Za-z0-9]{16}$/.test(pass))err('Gmail IMAP ainda não configurado',503);
 const {ImapFlow}=require('imapflow');const c=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user,pass},logger:false,logRaw:false,disableAutoIdle:true,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:10000});let lock;
 const deadline=Date.now()+23000;const timer=setTimeout(()=>{try{c.close()}catch{}},23000);c.on('error',()=>{});
 try{await c.connect();const folders=await c.list();const folder=folders.find(x=>x.specialUse==='\\All')?.path||'INBOX';lock=await c.getMailboxLock(folder,{readOnly:true});return await fn(c,{user,folder,validity:String(c.mailbox.uidValidity),deadline})}finally{clearTimeout(timer);try{lock?.release()}catch{}try{c.close()}catch{}}
}
async function bytes(c,uid,part,max=2800000){const d=await c.download(Number(uid),String(part),{uid:true,maxBytes:max+1});if(!d.content)err('Anexo não disponível',404);const chunks=[];let size=0;for await(const chunk of d.content){size+=chunk.length;if(size>max)err('Anexo excede o limite de download',413);chunks.push(Buffer.from(chunk))}if(!size)err('Anexo vazio');return Buffer.concat(chunks)}
async function pdfText(b){let task;try{const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');task=pdfjs.getDocument({data:new Uint8Array(b),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true});const doc=await task.promise;let text='';for(let i=1;i<=Math.min(doc.numPages,8);i++){const p=await doc.getPage(i);text+=(await p.getTextContent()).items.map(x=>x.str||'').join(' ')+'\n';if(text.length>150000)break}return text}catch{return ''}finally{try{await task?.destroy()}catch{}}}
function queryDate(start,end){if(!date(start)||!date(end)||start>end||(new Date(end)-new Date(start))/86400000>92)err('Informe um período válido de até 93 dias.');return {start,end}}
async function scan(body,actor){
 const {start,end}=queryDate(body.inicio,body.fim);const after=Number(body.antes_uid||0);if(!Number.isSafeInteger(after)||after<0)err('Cursor inválido');
 const tomorrow=new Date(new Date(end+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10);
 // Busca por PDF, não só por palavra boleto. Gmail usa sua própria zona na pesquisa; data final é verificada localmente.
 return mail(async(c,m)=>{
 const raw='after:'+start.replace(/-/g,'/')+' before:'+tomorrow.replace(/-/g,'/')+' has:attachment filename:pdf -in:trash -in:spam -in:sent';
 const ids=(await c.search({gmraw:raw},{uid:true})||[]).filter(x=>!after||x<after).sort((a,b)=>b-a);
 const page=ids.slice(0,8);let cursor=after,count=0,added=0,duplicates=0,review=0,errors=0;
 for(const uid of page){
  if(Date.now()>m.deadline-6500)break;
  try{
   const msg=await c.fetchOne(uid,{envelope:true,bodyStructure:true,internalDate:true},{uid:true});
   if(!msg?.internalDate){errors++;continue}
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(msg.internalDate));
   if(day<start||day>end)continue;
   const docs=attachments(msg.bodyStructure);
   const pdfs=docs.filter(x=>/\.pdf$/i.test(x.nome));
   for(const a of pdfs.slice(0,8)){
    if(Date.now()>m.deadline-3000){errors++;break}
    try{
     const b=await bytes(c,uid,a.parte);if(b.subarray(0,5).toString()!=='%PDF-')continue;
     const info=inspect(await pdfText(b),a.nome);
     if(!info)continue;
     const obj={...info,arquivo_hash:hash(b),conta_email:m.user,caixa:m.folder,uidvalidity:m.validity,uid,parte:a.parte,anexos:docs,assunto:limit(msg.envelope?.subject,250),remetente:limit(msg.envelope?.from?.map(x=>x.address).join(', '),250),recebido_em:new Date(msg.internalDate).toISOString(),atualizado_por:actor,status:'conferencia',fonte_dados:'Gmail — dados sujeitos a conferência'};
     // A restrição UNIQUE trata concorrência e reenvio sem modificar registros antigos.
     try{await db('',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(obj)});added++;review++}catch(e){if(e.status===409)duplicates++;else errors++}
    }catch{errors++}
   }
  }catch{errors++}finally{cursor=uid;count++}
 }
 return {ok:true,processados:count,total:ids.length,registrados:added,duplicados:duplicates,conferencia:review,erros:errors,proximo:count&&ids.length>count?cursor:null,parcial:count<ids.length};
 });
}
async function download(body,res){const r=await row(body.id);const part=String(body.parte||r.parte);const a=(r.anexos||[]).find(x=>x.parte===part);if(!a)err('Anexo não vinculado ao boleto',404);
 const b=await mail(async(c,m)=>{if(m.user!==r.conta_email||m.folder!==r.caixa||m.validity!==r.uidvalidity)err('Caixa de e-mail mudou. Documento precisa de conferência.',409);
 const msg=await c.fetchOne(Number(r.uid),{bodyStructure:true},{uid:true});const doc=attachments(msg?.bodyStructure).find(x=>x.parte===part&&x.nome===a.nome);if(!doc)err('Anexo não encontrado no e-mail original',404);
 const b=await bytes(c,r.uid,part);if(part===r.parte&&hash(b)!==r.arquivo_hash)err('O arquivo não corresponde ao boleto cadastrado',409);return b});
 const name=a.nome.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(-150)||'documento';
 res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="'+name+'"');return res.status(200).send(b);
}
async function update(body,user){const r=await row(body.id);if(r.status==='pago_manual'||r.status==='cancelado')err('Registro encerrado; solicite conferência administrativa.',409);
 const patch={atualizado_por:user.login,atualizado_em:new Date().toISOString()};
 if(body.operacao==='editar'){
  const line=dig(body.linha_digitavel);if(line&&!validLine(line))err('Linha digitável inválida.');
  const doc=dig(body.documento);if(doc&&![11,14].includes(doc.length))err('CPF/CNPJ deve ter 11 ou 14 dígitos.');
  const val=Number(body.valor_centavos);if(!Number.isSafeInteger(val)||val<0||val>9999999999)err('Valor inválido.');
  const due=date(body.vencimento);if(!due||!limit(body.beneficiario,180))err('Informe beneficiário e vencimento.');
  Object.assign(patch,{beneficiario:limit(body.beneficiario,180),documento:doc||null,linha_digitavel:line||null,emissao:date(body.emissao),vencimento:due,valor_centavos:val,categoria:limit(body.categoria,70)||'Outros',observacao:limit(body.observacao,1000),status:body.conferido===true?'aberto':'conferencia',fonte_dados:'Conferência manual — pagamento não verificado'});
 }else if(body.operacao==='pagar'){
  const pago=date(body.pago_em),valor=Number(body.valor_pago_centavos),banco=limit(body.banco_pagamento,90);
  if(!pago||!Number.isSafeInteger(valor)||valor<=0||valor>9999999999||!banco||r.status==='conferencia')err('Confirme primeiro o boleto e informe data, banco e valor pago.');
  Object.assign(patch,{status:'pago_manual',pago_em:pago,valor_pago_centavos:valor,banco_pagamento:banco});
 }else if(body.operacao==='agendar'&&r.status==='aberto')patch.status='agendado';else err('Operação inválida.');
 const rr=await db('?id=eq.'+encodeURIComponent(r.id)+'&atualizado_em=eq.'+encodeURIComponent(r.atualizado_em),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
 if(!rr?.length)err('Registro atualizado por outro usuário; recarregue.',409);return {ok:true};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='POST')err('Método inválido',405);if(!auth.sameOrigin(req))err('Origem inválida',403);
  const u=auth.session(req);if(!u||!['admin','financeiro'].includes(u.tipo))err('Acesso restrito ao Financeiro.',403);
  const ar=await auth.db('/rest/v1/usuarios?id=eq.'+encodeURIComponent(u.id)+'&select=id,login,tipo,ativo&limit=1');const actual=(await ar.json())[0];
  if(!actual||actual.ativo===false||actual.login!==u.login||!['admin','financeiro'].includes(actual.tipo))err('Usuário sem autorização ativa.',403);
  const b=req.body||{};
  if(b.acao==='listar'){
   const {start,end}=queryDate(b.inicio,b.fim);const offset=Math.max(0,Math.min(10000,Math.trunc(Number(b.offset)||0)));
   const q=new URLSearchParams({select:'*',order:'recebido_em.desc,id.desc',limit:'201',offset:String(offset)});
   q.append('recebido_em','gte.'+start+'T00:00:00-03:00');q.append('recebido_em','lte.'+end+'T23:59:59.999-03:00');
   const r=await db('?'+q);return res.status(200).json({ok:true,itens:r.slice(0,200),mais:r.length>200});
  }
  if(b.acao==='buscar')return res.status(200).json(await scan(b,u.login));
  if(b.acao==='baixar')return await download(b,res);
  if(b.acao==='alterar')return res.status(200).json(await update(b,u));
  if(b.acao==='dda')return res.status(200).json({ok:true,bb:'API DDA disponível; habilitação não verificada',bradesco:'DDA Net Empresa disponível; API não confirmada',pagamento:'Sem fonte bancária de liquidação autorizada. Nenhum pagamento automático.'});
  err('Ação inválida');
 }catch(e){return res.status(e.public?e.status: e.status===409?409:502).json({ok:false,erro:e.public?e.message:e.status===409?'Documento duplicado ou conflito de atualização.':'Não foi possível concluir a consulta. Confira a sessão, Gmail e Financeiro02.'})}
};
module.exports._test={validLine,lines,inspect,classify,date,queryDate};
