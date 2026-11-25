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
function brDate(v){const m=String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?date(m[3]+'-'+m[2]+'-'+m[1]):null}
function unique(v){return [...new Set(v.filter(Boolean))]}
function factorDates(line){if(!line)return [];const n=Number(line.slice(33,37));if(!n)return [];const old=new Date(Date.UTC(1997,9,7)+n*86400000).toISOString().slice(0,10);return n>=1000?[old,new Date(Date.UTC(2025,1,22)+(n-1000)*86400000).toISOString().slice(0,10)]:[old]}
function validDoc(v){const d=dig(v);if(![11,14].includes(d.length)||/^(\d)\1+$/.test(d))return false;const check=(x,w)=>{const n=x.split('').reduce((s,c,i)=>s+Number(c)*w[i],0)%11;return n<2?0:11-n};if(d.length===14)return check(d.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[12])&&check(d.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[13]);return check(d.slice(0,9),[10,9,8,7,6,5,4,3,2])===Number(d[9])&&check(d.slice(0,10),[11,10,9,8,7,6,5,4,3,2])===Number(d[10])}
const docPattern='(?:\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}-?\\d{2}|\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2})';
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function beneficiaryFromText(t){
 const rows=String(t||'').replace(/bene\s+ci[aá]rio/gi,'beneficiário').split(/\n/).map(x=>x.trim()).filter(Boolean);
 const found=[];
 function add(name,doc,rank){
  const n=String(name||'').replace(/^\s*(?:nome (?:do )?|raz[aã]o social|benefici[aá]rio(?: final)?|cedente)\s*[:\-]?\s*/i,'').replace(/\s*[-–]?\s*(?:CPF\s*\/?\s*CNPJ|CNPJ\s*\/?\s*CPF|CNPJ|CPF)\s*:?\s*$/i,'').trim().replace(/\s{2,}/g,' ');
  const d=dig(doc);
  if(!validDoc(d)||d==='05451985000195'||!/[a-zÀ-ÿ]{3}/i.test(n)||n.length>160||/SOFISTICATTO|PAGADOR|SACADO|ENDERECO|VENCIMENTO|PORTADOR|AGENCIA|CODIGO|AUTENTICACAO|DATA DO DOCUMENTO|^BANCO\b|^CNPJ\b|^CPF\b/.test(normal(n)))return;
  found.push({beneficiario:n,documento:d,rank});
 }
 const after=new RegExp('^(.{3,160}?)\\s+(?:[-–]\\s*)?(?:(?:CNPJ|CPF(?:/CNPJ)?)\\s*:\\s*)?('+docPattern+')(?!\\d)','i');
 const before=new RegExp('^(?:CNPJ\\s*:\\s*)?('+docPattern+')\\s*[-–]\\s*(.{3,160}?)(?=\\s+\\d{3,}[/\\-]|\\s+(?:CNPJ|CPF|Ag[eê]ncia|C[oó]digo)\\b|$)','i');
 for(let i=0;i<rows.length;i++){
  const row=rows[i],prev=rows[i-1]||'',next=rows[i+1]||'';
  const header=/^(?:nome (?:do )?)?(?:benefici[aá]rio|cedente)(?:\s|$|:)/i;
  const direct=row.match(/^(?:nome (?:do )?)?(?:benefici[aá]rio|cedente)\s*[:\-]?\s*(.*)$/i);
  const labeled=header.test(prev)&&!/^endereço/i.test(prev);
  const candidate=direct?direct[1]:row;
  for(const m of [candidate.match(after),candidate.match(before)])if(m){
   const reverse=m===null?false:new RegExp('^'+docPattern+'$').test(m[1]);
   const rank=(labeled||direct)?3:(/ENDERECO DO BENEFICIARIO/.test(normal(next))?2:0);
   if(rank)add(reverse?m[2]:m[1],reverse?m[1]:m[2],rank);
  }
 }
 const rank=Math.max(0,...found.map(x=>x.rank));const best=found.filter(x=>x.rank===rank),docs=unique(best.map(x=>x.documento));
 return docs.length===1?best.find(x=>x.documento===docs[0]):null;
}
function issueFields(t,due){
 const rows=String(t||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),pairs=[];
 const pattern=/^(\d{2}\/\d{2}\/\d{4})\s+([0-9][0-9A-Z./-]{1,24})\s+(?:DM|DV|DS|NP|RC|DR|OU|CH|LC|ND|NCC|NCE|NCI|NCR|DMI|DSI|DM I)\s+(?:N|S|NAO|NÃO|SIM)\s+(\d{2}\/\d{2}\/\d{4})(?:\s|$)/i;
 for(const r of rows){
  const m=r.match(pattern);if(!m)continue;
  const issue=brDate(m[1]),processing=brDate(m[3]);
  if(issue&&processing&&issue<=processing&&(!due||issue<=due))pairs.push({emissao:issue,numero_documento:m[2]});
 }
 const keys=unique(pairs.map(x=>x.emissao+'|'+x.numero_documento));
 return keys.length===1?pairs[0]:null;
}
function inspect(t,filename){
 t=String(t||'').replace(/bene\s+ci[aá]rio/gi,'beneficiário');
 const l=lines(t),norm=normal(t);
 if(!l.length&&!/\b(boleto|bloqueto|duplicata)\b/i.test(filename.replace(/[_-]/g,' '))&&!(/BENEFICIARIO/.test(norm)&&/VENCIMENTO/.test(norm)&&/PAGADOR|SACADO/.test(norm)))return null;
 const line=l.length===1?l[0]:null,amount=line?Number(line.slice(37)):null;
 const ds=unique((t.match(/(?<!\d)\d{2}\/\d{2}\/\d{4}(?!\d)/g)||[]).map(brDate)),matches=ds.filter(x=>factorDates(line).includes(x)),due=matches.length===1?matches[0]:null;
 const ben=beneficiaryFromText(t)||labeledBeneficiary(t)||extendedBeneficiary(t);
 const emissions=[],numbers=[];
 const rows=t.split(/\n/);
 for(let i=0;i<rows.length;i++){
  const r=rows[i],n=normal(r),next=rows[i+1]||'';
  if(/DATA (?:DO )?(?:DOCUMENTO|DOC\.|DE EMISSAO)|\bEMISSAO\s*:/.test(n)){
   const sample=/\d{2}\/\d{2}\/\d{4}/.test(r)?r:next;
   const dates=unique((sample.match(/\d{2}\/\d{2}\/\d{4}/g)||[]).map(brDate)).filter(x=>x!==due);
   if(dates.length===1)emissions.push(dates[0]);
   const m=next.trim().match(/^\d{2}\/\d{2}\/\d{4}\s+([0-9][0-9A-Z/-]{2,24})(?!\S)/i);if(m&&/DOCUMENTO/.test(n))numbers.push(m[1]);
  }
  const doc=r.match(/(?:n[úu]mero do documento|n[º°o.]?\s*(?:do\s+)?documento)\s*:\s*([0-9][0-9A-Z/-]{2,24})(?!\S)/i);if(doc)numbers.push(doc[1]);
  if(/(?:N[º°O.]?\s*(?:DO\s+)?DOCUMENTO|NUMERO (?:DO )?DOCUMENTO)/.test(n)){const m=next.trim().match(/^(\d{4,20})(?!\d|\/)/);if(m)numbers.push(m[1]);}
 }
 const structured=line?issueFields(t,due):null;
 const emits=unique(emissions),nums=unique(numbers);
 return {linha_digitavel:line,valor_centavos:amount>0?amount:null,vencimento:due,emissao:structured?.emissao||(emits.length===1?emits[0]:null),beneficiario:ben?.beneficiario||null,documento:ben?.documento||null,numero_documento:structured?.numero_documento||(nums.length===1?nums[0]:null),observacao:line?'Linha digitável validada; confira pagador, beneficiário e datas no PDF.':'Possível boleto sem linha única validada; revisar PDF ou digitalização.'};
}
function planPages(texts,filename,complete=true){
 const parsed=texts.map((text,i)=>({pagina_pdf:i+1,info:inspect(text,filename)})),confirmed=parsed.filter(x=>x.info?.linha_digitavel);
 const all=new Map();for(const p of confirmed)if(!all.has(p.info.linha_digitavel))all.set(p.info.linha_digitavel,p);
 // A page containing multiple valid lines is ambiguous, never silently discard a title.
 const ambiguous=texts.some(t=>lines(t).length>1);
 if(complete&&!ambiguous&&all.size){
  if(texts.length===1||confirmed.length===texts.length&&all.size===1)return [{...confirmed[0].info,pagina_pdf:0}];
  return [...all.values()].map(p=>({...p.info,pagina_pdf:p.pagina_pdf}));
 }
 const info=inspect(texts.join('\n'),filename);
 return info?[{...info,pagina_pdf:0,linha_digitavel:null,valor_centavos:null,vencimento:null,emissao:null,numero_documento:null,observacao:'PDF com múltiplos documentos, digitalização ou leitura incompleta. Conferir manualmente.'}]:[];
}
function classify(name){const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]/g,' ');
 if(/\.xml$/.test(n))return 'XML';if(/\.pdf$/.test(n)){if(/\b(danfe|nf e|nfe|nota fiscal|nf)\b/.test(n))return 'NF';if(/\b(dacte|cte|ct e)\b/.test(n))return 'CT-e';if(/relatorio/.test(n))return 'Relatório';if(/fatura/.test(n))return 'Fatura';if(/comprovante/.test(n))return 'Comprovante';if(/boleto|bloqueto/.test(n))return 'Boleto';return 'PDF anexo'}return 'Anexo';
}
function attachments(n,out=[]){if(!n)return out;const name=n.dispositionParameters?.filename||n.parameters?.name||'';if(n.part&&name&&/\.(pdf|xml)$/i.test(name)&&Number(n.size||0)<=4000000)out.push({parte:String(n.part),nome:limit(name,180),tipo:classify(name)});for(const c of n.childNodes||[])attachments(c,out);return out}
async function db(q,options={}){const r=await auth.db(TABLE+q,options);const raw=await r.text();return raw.trim()?JSON.parse(raw):null}
async function row(id){if(!uuid(id))err('Identificador inválido');const r=await db('?id=eq.'+encodeURIComponent(id)+'&limit=1');if(!r[0])err('Boleto não localizado',404);return r[0]}
async function mail(fn){const user=String(process.env.GOOGLE_GMAIL_ADMIN_USER||'').trim().toLowerCase(),pass=String(process.env.GMAIL_READ_APP_PASSWORD||'').replace(/\s/g,'');if(!user||!/^[A-Za-z0-9]{16}$/.test(pass))err('Gmail IMAP ainda não configurado',503);
 const {ImapFlow}=require('imapflow');const c=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user,pass},logger:false,logRaw:false,disableAutoIdle:true,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:10000});let lock;
 const deadline=Date.now()+23000;const timer=setTimeout(()=>{try{c.close()}catch{}},23000);c.on('error',()=>{});
 try{await c.connect();const folders=await c.list();const folder=folders.find(x=>x.specialUse==='\\All')?.path||'INBOX';lock=await c.getMailboxLock(folder,{readOnly:true});return await fn(c,{user,folder,validity:String(c.mailbox.uidValidity),deadline})}finally{clearTimeout(timer);try{lock?.release()}catch{}try{c.close()}catch{}}
}
async function bytes(c,uid,part,max=2800000){const d=await c.download(Number(uid),String(part),{uid:true,maxBytes:max+1});if(!d.content)err('Anexo não disponível',404);const chunks=[];let size=0;for await(const chunk of d.content){size+=chunk.length;if(size>max)err('Anexo excede o limite de download',413);chunks.push(Buffer.from(chunk))}if(!size)err('Anexo vazio');return Buffer.concat(chunks)}
async function pdfPages(b){let task;try{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const worker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs');globalThis.pdfjsWorker={WorkerMessageHandler:worker.WorkerMessageHandler};
 task=pdfjs.getDocument({data:new Uint8Array(b),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true});
 const doc=await task.promise,texts=[];
 for(let i=1;i<=Math.min(doc.numPages,40);i++){const page=await doc.getPage(i),items=(await page.getTextContent()).items.filter(x=>x.str?.trim()),rows=[];
 for(const x of items){const y=x.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,items:[]};rows.push(r)}r.items.push(x)}
 texts.push(rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n'))}
 return {texts,complete:doc.numPages<=40};
 }catch{return {texts:[''],complete:false}}finally{try{await task?.destroy()}catch{}}}
function sourceRecord(meta,key,info){return {conta_email:meta.conta_email,caixa:meta.caixa,uidvalidity:String(meta.uidvalidity),uid:String(meta.uid),parte:meta.parte,pagina_pdf:info.pagina_pdf,arquivo_hash:key,recebido_em:meta.recebido_em,assunto:meta.assunto,remetente:meta.remetente}}
function sameSource(a,b){return ['conta_email','caixa','uidvalidity','uid','parte','pagina_pdf','arquivo_hash'].every(k=>String(a[k])===String(b[k]))}
function reference(line){return validLine(line)?line.slice(0,9)+line.slice(10,20)+line.slice(21,31):null}
async function exactLine(line){if(!line)return null;const rr=await db('?linha_digitavel=eq.'+encodeURIComponent(line)+'&limit=1');return rr[0]||null}
async function registerResend(known,meta,key,info,actor){
 const source=sourceRecord(meta,key,info);
 if(sameSource(known,source)||['conta_email','caixa','uidvalidity','uid','parte','arquivo_hash'].every(k=>String(known[k])===String(source[k])))return false;
 for(let attempt=0;attempt<2;attempt++){
  const old=Array.isArray(known.reenvios)?known.reenvios:[];
  if(old.some(x=>sameSource(x,source))||old.length>=100)return false;
  const changed=await db('?id=eq.'+known.id+'&atualizado_em=eq.'+encodeURIComponent(known.atualizado_em),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({reenvios:[...old,source],atualizado_por:actor,atualizado_em:new Date().toISOString()})});
  if(changed?.length)return true;known=await row(known.id);
 }
 return false;
}
async function reconcileFile(b,meta,actor){
 const pages=await pdfPages(b),plan=planPages(pages.texts,meta.filename,pages.complete),result={registrados:0,duplicados:0,revisados:0,reenvios:0,possiveis_substituicoes:0,erros:0,pendencias:0,detalhe:''};
 if(!plan.length)return result;
 if(plan.some(x=>!x.linha_digitavel||!x.beneficiario||!x.documento||!x.vencimento))result.pendencias++;
 const key=hash(b),existing=await db('?arquivo_hash=eq.'+key+'&order=pagina_pdf.asc&limit=50'),old=existing.find(x=>x.pagina_pdf===0);
 if(old&&plan[0].pagina_pdf>0&&(old.status!=='conferencia'||old.fonte_dados?.startsWith('Conferência manual')||old.linha_digitavel)){result.duplicados++;result.detalhe='Registro anterior conferido; não foi dividido automaticamente.';return result}
 if(existing.some(x=>x.pagina_pdf>0)&&plan[0].pagina_pdf===0){result.duplicados++;return result}
 for(const info of plan){
  let known=existing.find(x=>x.pagina_pdf===info.pagina_pdf)||(info===plan[0]?old:null);
  try{
   const exact=await exactLine(info.linha_digitavel);
   if(exact&&(!known||exact.id!==known.id)){
    if(await registerResend(exact,meta,key,info,actor))result.reenvios++;
    result.duplicados++;
    if(known){result.pendencias++;result.detalhe='Um registro antigo sem identificação corresponde a boleto já cadastrado. Confira antes de pagar; nenhum registro foi excluído.';}
    continue;
   }
   const ref=reference(info.linha_digitavel);
   // Reference matching is only a hint (bank-specific free field may not identify a title uniquely).
   const alternatives=ref?await db('?referencia_bancaria=eq.'+encodeURIComponent(ref)+'&select=id,linha_digitavel&limit=10'):[];
   const possible=alternatives.some(x=>x.id!==known?.id&&x.linha_digitavel!==info.linha_digitavel);
   if(known){
    if(await registerResend(known,meta,key,info,actor)){result.reenvios++;known=await row(known.id)}
    if(known.status!=='conferencia'||known.fonte_dados?.startsWith('Conferência manual')){result.duplicados++;continue}
    const {patch,conflicts}=recoveryPatch(known,info);if(conflicts.length){result.pendencias++;result.detalhe='Divergência no cadastro existente; conferência necessária.';continue}
    if(known.pagina_pdf!==info.pagina_pdf&&known.arquivo_hash===key)patch.pagina_pdf=info.pagina_pdf;
    if(possible&&!known.possivel_substituicao){patch.possivel_substituicao=true;result.possiveis_substituicoes++}
    if(!Object.keys(patch).length){result.duplicados++;continue}
    Object.assign(patch,{observacao:info.observacao,atualizado_por:actor,atualizado_em:new Date().toISOString()});
    const changed=await db('?id=eq.'+known.id+'&status=eq.conferencia&atualizado_em=eq.'+encodeURIComponent(known.atualizado_em),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});if(!changed?.length)err('Registro alterado durante a leitura.',409);result.revisados++;
   }else{
    if(old&&info!==plan[0]&&result.revisados===0&&!existing.some(x=>x.pagina_pdf===plan[0].pagina_pdf)){result.erros++;continue}
    const {filename,...source}=meta;
    await db('',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...source,...info,arquivo_hash:key,possivel_substituicao:possible,atualizado_por:actor,status:'conferencia',fonte_dados:'Gmail — dados sujeitos a conferência'})});
    result.registrados++;if(possible)result.possiveis_substituicoes++;
   }
  }catch(e){
   if(e.status===409){const exact=await exactLine(info.linha_digitavel);if(exact&&await registerResend(exact,meta,key,info,actor))result.reenvios++;result.duplicados++}
   else {result.erros++;console.warn('contas-pagar registro',Number(e.status)||'falha')}
  }
 }
 if(!pages.complete)result.detalhe='Leitura incompleta; dados não presumidos.';
 return result;
}
async function original(r,part){return mail(async(c,m)=>{if(m.user!==r.conta_email||m.folder!==r.caixa||m.validity!==r.uidvalidity)err('Caixa de e-mail mudou. Documento precisa de conferência.',409);
 const a=(r.anexos||[]).find(x=>x.parte===part);if(!a)err('Anexo não vinculado ao boleto',404);
 const msg=await c.fetchOne(Number(r.uid),{bodyStructure:true},{uid:true});if(!attachments(msg?.bodyStructure).some(x=>x.parte===part&&x.nome===a.nome))err('Anexo não encontrado no e-mail original',404);
 const b=await bytes(c,r.uid,part);if(part===r.parte&&hash(b)!==r.arquivo_hash)err('O arquivo não corresponde ao boleto cadastrado',409);return b})}
async function reprocess(body,actor){const r=await row(body.id);if(r.status!=='conferencia'||r.fonte_dados?.startsWith('Conferência manual'))err('Releitura permitida apenas em registros não conferidos.',409);const a=(r.anexos||[]).find(x=>x.parte===r.parte);if(!a)err('Arquivo não vinculado.');const b=await original(r,r.parte);const meta={filename:a.nome};for(const k of ['conta_email','caixa','uidvalidity','uid','parte','anexos','assunto','remetente','recebido_em'])meta[k]=r[k];return {ok:true,...await reconcileFile(b,meta,actor)}}
function queryDate(start,end){if(!date(start)||!date(end)||start>end||(new Date(end)-new Date(start))/86400000>92)err('Informe um período válido de até 93 dias.');return {start,end}}
function searchCursor(body){
 const read=(v,name)=>{const n=Number(v||0);if(!Number.isSafeInteger(n)||n<0)err('Cursor de pesquisa inválido: '+name);return n};
 const x=body.continuacao||{},after=read(x.antes_uid??body.antes_uid,'mensagem'),ceiling=read(x.limite_uid,'limite'),pending=read(x.uid_pendente,'mensagem pendente'),part=read(x.anexo_indice,'anexo');
 if((pending&&after&&pending>=after)||(pending&&ceiling&&pending>ceiling)||(!pending&&part)||part>10000)err('Cursor de pesquisa inconsistente.');
 return {after,ceiling,pending,part,validity:String(x.validade_uid||''),folder:String(x.caixa||'')};
}
async function scan(body,actor){
 const {start,end}=queryDate(body.inicio,body.fim),state=searchCursor(body);
 const tomorrow=new Date(new Date(end+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10);
 return mail(async(c,m)=>{
 if((state.validity&&state.validity!==m.validity)||(state.folder&&state.folder!==m.folder))err('A caixa de e-mail mudou. Inicie uma nova pesquisa.',409);
 const raw='after:'+start.replace(/-/g,'/')+' before:'+tomorrow.replace(/-/g,'/')+' has:attachment filename:pdf -in:trash -in:spam -in:sent';
 const found=(await c.search({gmraw:raw},{uid:true})||[]).sort((a,b)=>b-a);
 const ceiling=state.ceiling||Number(found[0]||0);
 const ids=found.filter(x=>x<=ceiling&&(!state.after||x<state.after));
 const page=ids.slice(0,8);
 let cursor=state.after,pending=state.pending,part=state.part,count=0,added=0,duplicates=0,review=0,errors=0,revised=0,pdfsRead=0,attempted=0,reenvios=0,substituicoes=0,pendencias=0;
 const reasons={};
 const issue=(label,n=1)=>{errors+=n;reasons[label]=(reasons[label]||0)+n};
 for(const uid of page){
  if(Date.now()>m.deadline-6500||attempted>=8)break;
  let finished=true;
  try{
   const message=await c.fetchOne(uid,{envelope:true,bodyStructure:true,internalDate:true},{uid:true});
   if(!message?.internalDate){issue('Mensagem indisponível');continue}
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(message.internalDate));
   if(day<start||day>end)continue;
   const docs=attachments(message.bodyStructure),pdfs=docs.filter(x=>/\.pdf$/i.test(x.nome));
   const startPart=Number(uid)===state.pending?state.part:0;
   if(startPart>pdfs.length){issue('Anexos alterados durante a busca');continue}
   for(let i=startPart;i<pdfs.length;i++){
    if(Date.now()>m.deadline-6500||attempted>=8){finished=false;pending=uid;part=i;break}
    const a=pdfs[i];attempted++;
    try{
     const data=await bytes(c,uid,a.parte);if(data.subarray(0,5).toString()!=='%PDF-'){issue('Anexo PDF inválido');continue}
     pdfsRead++;
     const x=await reconcileFile(data,{filename:a.nome,conta_email:m.user,caixa:m.folder,uidvalidity:m.validity,uid,parte:a.parte,anexos:docs,assunto:limit(message.envelope?.subject,250),remetente:limit(message.envelope?.from?.map(x=>x.address).join(', '),250),recebido_em:new Date(message.internalDate).toISOString()},actor);
     added+=x.registrados;duplicates+=x.duplicados;review+=x.registrados;revised+=x.revisados;reenvios+=x.reenvios||0;substituicoes+=x.possiveis_substituicoes||0;pendencias+=x.pendencias||0;
     if(x.erros)issue('Falha no registro ou conferência do PDF',x.erros);
    }catch(e){issue(e.status===413?'Anexo acima do limite de download':'Falha ao baixar ou analisar PDF')}
   }
  }catch{issue('Falha ao consultar mensagem')}
  finally{if(finished){cursor=uid;count++;pending=0;part=0}}
  if(!finished)break;
 }
 const partial=count<ids.length;
 const next=partial?{antes_uid:cursor,limite_uid:ceiling,uid_pendente:pending,anexo_indice:part,validade_uid:m.validity,caixa:m.folder}:null;
 return {ok:true,processados:count,total:ids.length,restantes:ids.length-count,registrados:added,duplicados:duplicates,revisados:revised,conferencia:review,erros:errors,pdfs_lidos:pdfsRead,reenvios,possiveis_substituicoes:substituicoes,pendencias,anexos_processados:attempted,motivos_erros:reasons,continuacao:next,proximo:partial?cursor:null,parcial:partial};
 });
}
async function download(body,res){const r=await row(body.id);const part=String(body.parte||r.parte);const a=(r.anexos||[]).find(x=>x.parte===part);if(!a)err('Anexo não vinculado ao boleto',404);
 let b=await original(r,part);
 if(part===r.parte&&r.pagina_pdf>0&&body.original!==true){const {PDFDocument}=require('pdf-lib');const source=await PDFDocument.load(b);if(r.pagina_pdf>source.getPageCount())err('Página cadastrada não existe no PDF.',409);const pdf=await PDFDocument.create();const [page]=await pdf.copyPages(source,[r.pagina_pdf-1]);pdf.addPage(page);b=Buffer.from(await pdf.save());}
 const name=a.nome.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(-150)||'documento';
 res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="'+name+'"');return res.status(200).send(b);
}
function sameMessage(a,b){return ['conta_email','caixa','uidvalidity','uid'].every(k=>String(a[k])===String(b[k]))}
function orderGroup(a,b){return String(a.vencimento||'9999').localeCompare(String(b.vencimento||'9999'))||String(a.numero_documento||'').localeCompare(String(b.numero_documento||''))||Number(a.pagina_pdf)-Number(b.pagina_pdf)||String(a.id).localeCompare(String(b.id))}
async function group(id){const anchor=await row(id),q=new URLSearchParams({select:'*',limit:'51'});
 for(const k of ['conta_email','caixa','uidvalidity','uid'])q.set(k,'eq.'+anchor[k]);
 const items=await db('?'+q);if(items.length>50)err('E-mail com mais de 50 registros. Use o download individual.',413);
 if(!items.length||items.some(x=>!sameMessage(anchor,x)))err('Não foi possível conferir o grupo de origem.',409);
 return items.sort(orderGroup)}
async function groupPdf(body,res){
 const items=await group(body.id);
 const expected=Array.isArray(body.ids)?body.ids.map(String):[];
 if(expected.length!==items.length||new Set(expected).size!==items.length||items.some(x=>!expected.includes(String(x.id))))err('O grupo foi alterado. Confira novamente antes de baixar.',409);
 // Read each original attachment once. Keep vector PDF pages and never send a partial group.
 const {PDFDocument}=require('pdf-lib'),out=await PDFDocument.create(),cache=new Map();
 let total=0;
 for(const r of items){
  const key=String(r.parte)+'|'+r.arquivo_hash;
  if(!cache.has(key)){const b=await original(r,r.parte);total+=b.length;if(total>10000000)err('Arquivos grandes demais para reunir. Use o download individual.',413);cache.set(key,await PDFDocument.load(b))}
  const src=cache.get(key),n=src.getPageCount();
  if(r.pagina_pdf<0||r.pagina_pdf>n)err('Página inválida no cadastro.',409);
  const indices=r.pagina_pdf>0?[r.pagina_pdf-1]:Array.from({length:n},(_,i)=>i);
  // Do not mix a whole-file record and its split pages.
  if(r.pagina_pdf===0&&items.some(x=>x.id!==r.id&&x.arquivo_hash===r.arquivo_hash&&x.parte===r.parte))err('Arquivo possui cadastro integral e páginas individuais. Reprocesse antes de reunir.',409);
  for(const page of await out.copyPages(src,indices))out.addPage(page);
 }
 const bytes=Buffer.from(await out.save());if(bytes.length>4000000)err('PDF conjunto excede o limite de resposta. Baixe os boletos individualmente.',413);
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="boletos-email.pdf"');return res.status(200).send(bytes);
}

// OCR and text recovery for existing, unreviewed records. No external document service.
const recoveryFields=['linha_digitavel','valor_centavos','vencimento','emissao','beneficiario','documento','numero_documento'];
function needsRecovery(r){return r.status==='conferencia'&&!String(r.fonte_dados||'').startsWith('Conferência manual')&&recoveryFields.some(k=>r[k]==null||r[k]==='')}
function recoveryPatch(r,info){
 const patch={},conflicts=[];
 // Never mix different titles, even if some fields coincide.
 for(const k of ['linha_digitavel','valor_centavos','vencimento','documento']){
  if(r[k]!=null&&r[k]!==''&&info[k]!=null&&String(r[k])!==String(info[k]))conflicts.push(k);
 }
 if(conflicts.length)return {patch,conflicts};
 for(const k of recoveryFields)if((r[k]==null||r[k]==='')&&info[k]!=null&&info[k]!=='')patch[k]=info[k];
 return {patch,conflicts};
}
function labeledBeneficiary(t){
 const rows=String(t||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),found=[];
 const header=/^(?:nome (?:do )?)?(?:benefici[aá]rio|cedente)(?:\s|:|$)/i;
 const docRx=new RegExp('(?:^|\\s)(?:(?:CNPJ\\s*\\/\\s*CPF|CPF\\s*\\/\\s*CNPJ|CNPJ|CPF)\\s*:?\\s*)?('+docPattern+')(?!\\d)','i');
 for(let i=0;i<rows.length;i++){
  if(!header.test(rows[i]))continue;
  const block=[rows[i].replace(header,'').replace(/^\s*[:\-]\s*/,''),...rows.slice(i+1,i+3)];
  for(let j=0;j<block.length;j++){
   if(/PAGADOR|SACADO|ENDERECO|AGENCIA|VENCIMENTO/.test(normal(block[j])))break;
   const m=block[j].match(docRx);if(!m)continue;
   const d=dig(m[1]),n=(block[j].slice(0,m.index).trim()||block[j-1]||'').replace(/\s*[-–:]\s*$/,'').trim();
   if(validDoc(d)&&d!=='05451985000195'&&/[a-zÀ-ÿ]{3}/i.test(n)&&n.length<=160&&!/SOFISTICATTO|PAGADOR|SACADO|ENDERECO|VENCIMENTO|AGENCIA|CODIGO|CNPJ|CPF|^BANCO\b/.test(normal(n)))found.push({beneficiario:n,documento:d});
  }
 }
 const docs=unique(found.map(x=>x.documento));return docs.length===1?found.find(x=>x.documento===docs[0]):null;
}
// Accept explicitly labelled beneficiary blocks, including CPF/CNPJ separated by slashes
// and bank-printed 15-digit zero-padded CNPJ. Never use the payer or an unlabelled name.
function extendedBeneficiary(t){
 const rows=String(t||'').replace(/bene\s+ci[aá]rio/gi,'beneficiário').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const label=/^(?:nome (?:do )?)?(?:benefici[aá]rio|cedente)(?=[\s:/]|$)/i;
 const docRx=/(?:CNPJ\s*\/\s*CPF|CPF\s*\/\s*CNPJ|CNPJ|CPF)\s*:\s*(0?\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/i;
 const found=[];
 for(let i=0;i<rows.length;i++){
  if(!label.test(rows[i])||/BENEFICIARIO FINAL/.test(normal(rows[i])))continue;
  for(let j=i+1;j<=Math.min(i+2,rows.length-1);j++){
   const r=rows[j];if(/^(?:PAGADOR|SACADO|ENDERECO|AGENCIA|VENCIMENTO|DATA)\b/.test(normal(r)))break;
   const m=r.match(docRx);if(!m)continue;
   let d=dig(m[1]);if(d.length===15&&d[0]==='0')d=d.slice(1);
   const n=(r.slice(0,m.index).trim()||rows[j-1]).replace(/\s*[-–:]\s*$/,'').trim();
   if(validDoc(d)&&d!=='05451985000195'&&/[A-ZÀ-Ÿ]{3}/i.test(n)&&n.length<=160&&!/SOFISTICATTO|PAGADOR|SACADO|ENDERECO|VENCIMENTO|AGENCIA|CNPJ|CPF|NAO INFORMADO|BENEFICIARIO FINAL/.test(normal(n)))found.push({beneficiario:n,documento:d});
  }
 }
 const ids=unique(found.map(x=>x.documento));return ids.length===1?found.find(x=>x.documento===ids[0]):null;
}
function payerConfirmed(t){
 const rows=String(t||'').split(/\r?\n/).map(x=>x.trim());
 for(let i=0;i<rows.length;i++){
  if(!/(?:^|\b)(?:PAGADOR|SACADO)\b|SOFISTICATTO/.test(normal(rows[i])))continue;
  const block=rows[i]+' '+(rows[i+1]||'');
  if(/SOFISTICATTO/.test(normal(block))&&/(?:^|\D)0?05[.\s]*451[.\s]*985[/.\s]*0001[-.\s]*95(?!\d)/.test(block))return true;
 }
 return false;
}
function parseOcr(text,filename,known=null){
 const t=String(text||'').replace(/\r/g,'');
 const base=inspect(t,filename);
 if(!base?.linha_digitavel||!base.valor_centavos)return null;
 const same=!!known?.linha_digitavel&&known.linha_digitavel===base.linha_digitavel;
 if(!base.vencimento&&same&&factorDates(base.linha_digitavel).includes(known.vencimento))base.vencimento=known.vencimento;
 if(!base.vencimento)return null;
 // Verify the payer in a labeled block, not just any CNPJ on the page.
 const payer=[...t.matchAll(/(?:^|\n)\s*(?:pagador|sacado)\s*:[^\n]*(?:\n[^\n]*)?/gi)];
 if(!same&&!payerConfirmed(t))return null;
 const prices=[...t.matchAll(/(?<!\d)(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)/g)].map(x=>Number(dig(x[0])));
 if(!same&&!prices.includes(base.valor_centavos))return null;
 const candidates=[];
 for(const m of t.matchAll(/(?:^|\n)\s*Benefici[aá]rio[^\n]*\n([^\n]{3,150})\n\s*(?:CNPJ\s*\/\s*CPF|CPF\s*\/\s*CNPJ|CNPJ|CPF)\s*:\s*([0-9.\/-]{11,24})(?!\d)/gi)){
  const d=dig(m[2]);const doc=d.length===15&&d[0]==='0'?d.slice(1):d;
  const name=m[1].replace(/\s*-\s*\d{3,}\/[\d-]+\s*$/,'').replace(/\s*[-–]\s*$/,'').trim();
  if(validDoc(doc)&&doc!=='05451985000195'&&/[A-ZÀ-Ÿ]{3}/i.test(name)&&!/SOFISTICATTO|PAGADOR|SACADO|NAO INFORMADO/.test(normal(name)))candidates.push({beneficiario:name,documento:doc});
 }
 const docs=unique(candidates.map(x=>x.documento));if(docs.length===1){const b=candidates.find(x=>x.documento===docs[0]);if(!base.documento||base.documento===b.documento)Object.assign(base,b);else return null;}
 // Bradesco prints issue and processing dates in the same row; first date follows "Data do doc.".
 const pairs=[...t.matchAll(/(?:^|\n)\s*Data\s+do\s+doc\.\s+[^\n]*N[º°o]\s*(?:do\s+)?documento[^\n]*\n\s*(\d{2}\/\d{2}\/\d{4})\s+([0-9]{4,20})(?!\d)/gi)];
 const dates=unique(pairs.map(x=>brDate(x[1]))),numbers=unique(pairs.map(x=>x[2]));
 if(!base.emissao&&dates.length===1)base.emissao=dates[0];if(!base.numero_documento&&numbers.length===1)base.numero_documento=numbers[0];
 if(!same&&(!base.documento||!base.beneficiario||!validDoc(base.documento)||base.documento==='05451985000195'))return null;
 return base;
}
// Explicit local CanvasFactory avoids PDF.js resolving native modules at its build-machine path.
function canvasRuntime(){
 const c=require('@napi-rs/canvas');
 for(const k of ['DOMMatrix','ImageData','Path2D'])if(!globalThis[k]&&c[k])globalThis[k]=c[k];
 class CanvasFactory{
  create(w,h){if(w<=0||h<=0)throw Error('Dimensões inválidas');const canvas=c.createCanvas(w,h);return {canvas,context:canvas.getContext('2d')}}
  reset(x,w,h){if(!x?.canvas||w<=0||h<=0)throw Error('Canvas inválido');x.canvas.width=w;x.canvas.height=h}
  destroy(x){if(x?.canvas){x.canvas.width=0;x.canvas.height=0;x.canvas=null;x.context=null}}
 }
 return {...c,CanvasFactory};
}
function ocrError(stage,e){
 const m=String(e?.message||e||'');
 const code=/timeout|tempo limite|interrompido/i.test(m)?'TEMPO_LIMITE':/cannot find|not found|não encontrad|ENOENT|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|native binding/i.test(m)?'DEPENDENCIA_AUSENTE':/DOMMatrix|Path2D|canvas|render/i.test(m)?'RENDERIZACAO':/worker|wasm|tesseract/i.test(m)?'MOTOR_OCR':'FALHA';
 // Log only technical metadata, never document content.
 console.warn('contas-pagar OCR',stage,code,String(e?.code||'').replace(/[^A-Z0-9_]/gi,'').slice(0,48));
 return 'OCR '+stage+' — '+code;
}
async function recognizePdf(b,pageNumber,deadline,consume){
 let worker,task,timer,ended=false,stage='canvas';
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{ended=true;reject(new Error('Tempo limite'))},Math.max(1,deadline-Date.now()))});
 const run=async()=>{
  const {createCanvas,CanvasFactory}=canvasRuntime();
  stage='biblioteca PDF';
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfworker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  globalThis.pdfjsWorker={WorkerMessageHandler:pdfworker.WorkerMessageHandler};
  const path=require('node:path'),fs=require('node:fs');
  const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
  task=pdfjs.getDocument({data:new Uint8Array(b),CanvasFactory,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true,standardFontDataUrl:path.join(pdfRoot,'standard_fonts')+path.sep,cMapUrl:path.join(pdfRoot,'cmaps')+path.sep,cMapPacked:true});
  stage='abrir PDF';const pdf=await task.promise;
  if(!pageNumber&&pdf.numPages!==1)return {reason:'PDF com várias páginas sem parcela identificada; conferência necessária.'};
  const n=pageNumber||1;if(n<1||n>pdf.numPages)return {reason:'Página cadastrada não localizada.'};
  stage='renderizar PDF';
  const pg=await pdf.getPage(n),base=pg.getViewport({scale:1});
  const viewport=pg.getViewport({scale:Math.min(3.5,2000/base.width,3100/base.height)});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  await pg.render({canvasContext:ctx,viewport,background:'#ffffff'}).promise;
  if(ended)throw Error('OCR interrompido');
  stage='arquivos do motor';
  const {createWorker,PSM}=require('tesseract.js');
  const workerPath=require.resolve('tesseract.js/src/worker-script/node/index.js');
  const language=require.resolve('@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz');
  const langPath=path.dirname(language);
  if(!fs.existsSync(workerPath)||!fs.existsSync(language))throw Error('Dependência OCR não encontrada');
  stage='iniciar Tesseract';
  let rejectWorker;
  const workerFailure=new Promise((_,reject)=>{rejectWorker=reject});
  const initializing=createWorker('por',1,{workerPath,langPath,cachePath:'/tmp',cacheMethod:'readOnly',logger:()=>{},errorHandler:e=>rejectWorker(new Error(String(e||'Worker OCR falhou')))});
  initializing.then(w=>{if(ended)void w.terminate().catch(()=>{})},()=>{});
  worker=await Promise.race([initializing,workerFailure]);
  if(ended){await worker.terminate();throw Error('OCR interrompido')}
  stage='reconhecer imagem';
  await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,preserve_interword_spaces:'0'});
  const crop=createCanvas(canvas.width,Math.ceil(canvas.height*.55));crop.getContext('2d').drawImage(canvas,0,0);
  const read=async image=>(await Promise.race([worker.recognize(image.toBuffer('image/png')),workerFailure])).data.text;
  return await consume(await read(crop),async()=>{await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});return read(canvas)},async()=>{
   // Numeric-only independent reading of the upper bank header; no guessed digits.
   const band=createCanvas(canvas.width,Math.ceil(canvas.height*.19));band.getContext('2d').drawImage(canvas,0,0);
   await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,tessedit_char_whitelist:'0123456789. -/'});
   return read(band);
  });
 };
 try{return await Promise.race([run(),timeout])}
 catch(e){return {reason:ocrError(stage,e),infra:true}}
 finally{ended=true;clearTimeout(timer);if(worker)try{await worker.terminate()}catch{};try{await task?.destroy()}catch{}}
}
async function ocrImage(b,pageNumber,deadline,known){
 return recognizePdf(b,pageNumber,deadline,async(first,fullRead,lineRead)=>{
  let data=parseOcr(first,'boleto.pdf',known),fullText='';
  if((!data||recoveryFields.some(k=>!data[k]&&!known?.[k]))&&Date.now()<deadline-7000){
   fullText=await fullRead();const full=parseOcr(fullText,'boleto.pdf',known);
   if(full&&(!data||full.linha_digitavel===data.linha_digitavel)){
    if(data&&['documento','vencimento','valor_centavos'].some(k=>data[k]!=null&&full[k]!=null&&data[k]!==full[k]))return {reason:'Leituras OCR divergentes; conferência necessária.'};
    data={...data,...Object.fromEntries(Object.entries(full).filter(([,v])=>v!=null))};
   }
  }
  if(!data&&Date.now()<deadline-5000){
   const combined=first+'\n'+fullText,observed=lines(combined);
   // Only augment missing line with independently read, checksum-valid bank header.
   if(observed.length===1)data=parseOcr(combined,'boleto.pdf',known);
   if(!data&&observed.length===0){
    const numeric=await lineRead(),candidates=lines(numeric);
    if(candidates.length===1)data=parseOcr(combined+'\n'+candidates[0],'boleto.pdf',known);
   }
  }
  return {data,reason:data?'':'OCR executado; dados insuficientes para validar o título.'};
 });
}
async function ocrSelfTest(){
 const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
 const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica);
 page.drawText('SOFISTICATTO OCR 12345',{x:45,y:745,size:27,font,color:rgb(0,0,0)});
 const result=await recognizePdf(Buffer.from(await doc.save()),1,Date.now()+45000,async(text,full)=>{
  const good=t=>/SOFISTICATTO/i.test(t)&&/12345/.test(t);
  return {passed:good(text)||good(await full())};
 });
 return {ok:true,aprovado:result.passed===true,detalhe:result.passed?'PDF sintético renderizado e reconhecido com sucesso.':result.reason||'OCR não reconheceu o texto sintético esperado.'};
}
async function ocrRecord(body,actor){
 const r=await row(body.id);
 if(!needsRecovery(r))return {ok:true,ocr:0,revisados:0,pendencias:0,detalhe:'Registro completo ou conferido; preservado.'};
 const start=Date.now(),b=await original(r,r.parte);
 let used=0,info=null,reason='';
 const record=async(patch,detail,pending,corrected)=>{
  if(!Object.keys(patch).length&&r.observacao===detail)return {ok:true,ocr:used,revisados:0,pendencias:pending,detalhe:detail};
  try{
   const changed=await db('?id=eq.'+r.id+'&status=eq.conferencia&atualizado_em=eq.'+encodeURIComponent(r.atualizado_em),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...patch,observacao:detail,atualizado_por:actor,atualizado_em:new Date().toISOString()})});
   return {ok:true,ocr:used,revisados:changed?.length?corrected:0,pendencias:changed?.length?pending:1,detalhe:changed?.length?detail:'Registro alterado durante a leitura; recarregue.'};
  }catch(e){if(e.status===409)return {ok:true,ocr:used,revisados:0,pendencias:1,detalhe:'Linha digitável já cadastrada ou conflito; confira manualmente.'};throw e}
 };
 // First use the PDF text of the known page, without spending an OCR worker.
 const pages=await pdfPages(b);
 const selected=r.pagina_pdf>0?pages.texts[r.pagina_pdf-1]:pages.texts.length===1?pages.texts[0]:null;
 if(selected)info=parseOcr(selected,'boleto.pdf',r);
 if(!info||recoveryFields.some(k=>!r[k]&&!info[k])){
  if(Date.now()<start+38000){
   used=1;
   try{
    const out=await ocrImage(b,r.pagina_pdf,Math.min(start+51000,Date.now()+35000),r);
    reason=out.reason||'';
    if(out.data&&(!info||out.data.linha_digitavel===info.linha_digitavel)){
     if(info&&['documento','vencimento','valor_centavos'].some(k=>info[k]!=null&&out.data[k]!=null&&info[k]!==out.data[k]))return record({},'Texto e OCR divergentes; confira o original.',1,0);
     info={...info,...Object.fromEntries(Object.entries(out.data).filter(([,v])=>v!=null))};
    }else if(out.data&&info)return record({},'Texto e OCR identificaram títulos diferentes; confira o original.',1,0);
   }catch(e){reason=ocrError('recuperar registro',e)}
  }else reason='Tempo de leitura do PDF excedido.';
 }
 if(!info)return record({},reason||'Não foi possível validar linha digitável, valor, vencimento e identificação do boleto.',1,0);
 const exact=await exactLine(info.linha_digitavel);
 if(exact&&exact.id!==r.id)return record({possivel_substituicao:true},'Linha digitável já cadastrada em outro registro. Confira a duplicidade antes de pagar.',1,0);
 const {patch,conflicts}=recoveryPatch(r,info);
 if(conflicts.length)return record({},'Divergência com cadastro: '+conflicts.join(', ')+'. Nenhum dado financeiro substituído.',1,0);
 const missing=recoveryFields.filter(k=>!(patch[k]??r[k]));
 const count=Object.keys(patch).length;
 if(!count)return record({},(reason?reason+' ':'')+'Campos pendentes: '+missing.join(', ')+'.',1,0);
 const ref=reference(info.linha_digitavel),alternatives=ref?await db('?referencia_bancaria=eq.'+encodeURIComponent(ref)+'&select=id,linha_digitavel&limit=10'):[];
 if(alternatives.some(x=>x.id!==r.id&&x.linha_digitavel!==info.linha_digitavel))patch.possivel_substituicao=true;
 patch.fonte_dados='Gmail — recuperação '+(used?'texto/OCR':'texto')+', sujeito a conferência';
 return record(patch,missing.length?'Campos recuperados: '+count+'. Ainda pendentes: '+missing.join(', ')+'. '+reason:'Dados recuperados. Confira o original antes de liberar.',missing.length?1:0,1);
}

async function update(body,user){const r=await row(body.id);if(r.status==='pago_manual'||r.status==='cancelado')err('Registro encerrado; solicite conferência administrativa.',409);
 const patch={atualizado_por:user.login,atualizado_em:new Date().toISOString()};
 if(body.operacao==='editar'){
  if(r.possivel_substituicao&&body.conferido===true&&body.substituicao_conferida!==true)err('Possível substituição: confirme a situação do boleto anterior antes de liberar.',409);
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
  if(b.acao==='grupo')return res.status(200).json({ok:true,itens:await group(b.id)});
  if(b.acao==='pdf-grupo')return await groupPdf(b,res);
  if(b.acao==='reprocessar')return res.status(200).json(await reprocess(b,u.login));
  if(b.acao==='ocr')return res.status(200).json(await ocrRecord(b,u.login));
  if(b.acao==='ocr-teste')return res.status(200).json(await ocrSelfTest());
  if(b.acao==='alterar')return res.status(200).json(await update(b,u));
  if(b.acao==='dda')return res.status(200).json({ok:true,bb:'API DDA disponível; habilitação não verificada',bradesco:'DDA Net Empresa disponível; API não confirmada',pagamento:'Sem fonte bancária de liquidação autorizada. Nenhum pagamento automático.'});
  err('Ação inválida');
 }catch(e){return res.status(e.public?e.status: e.status===409?409:502).json({ok:false,erro:e.public?e.message:e.status===409?'Documento duplicado ou conflito de atualização.':'Não foi possível concluir a consulta. Confira a sessão, Gmail e Financeiro02.'})}
};
module.exports._test={validLine,lines,inspect,classify,date,queryDate,planPages,factorDates,validDoc,searchCursor,beneficiaryFromText,reference,sameSource,db,parseOcr,needsRecovery,recoveryPatch,labeledBeneficiary,ocrSelfTest,ocrError,issueFields,extendedBeneficiary,payerConfirmed};
