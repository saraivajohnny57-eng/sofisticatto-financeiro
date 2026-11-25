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
function inspect(t,filename){
 const l=lines(t),norm=String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!l.length&&!/\b(boleto|bloqueto|duplicata)\b/i.test(filename.replace(/[_-]/g,' '))&&!(/beneficiario/.test(norm)&&/vencimento/.test(norm)&&/pagador|sacado/.test(norm)))return null;
 const line=l.length===1?l[0]:null,amount=line?Number(line.slice(37)):null;
 const ds=unique((String(t).match(/(?<!\d)\d{2}\/\d{2}\/\d{4}(?!\d)/g)||[]).map(brDate));
 const matches=ds.filter(x=>factorDates(line).includes(x)),due=matches.length===1?matches[0]:null;
 const ben=[];for(const m of String(t).matchAll(/(?:^|\n|\s)(?:benefici[aá]rio|cedente)\s*[:\-]?\s*(?:\n\s*)?([^\n]{3,210}?)[\s\-]+(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/gi)){
 const n=m[1].trim().replace(/^(?:nome|raz[aã]o social)\s*[:\-]?\s*/i,''),doc=dig(m[2]);if(/[a-zÀ-ÿ]{3}/i.test(n)&&!/\b(?:ag[eê]ncia|c[oó]digo|pagador|sacado|vencimento|cpf|cnpj)\b/i.test(n)&&validDoc(doc))ben.push({beneficiario:n,documento:doc})}
 const docs=unique(ben.map(x=>x.documento)),beneficiary=docs.length===1?ben.find(x=>x.documento===docs[0]):null;
 const emissions=[];for(const m of String(t).matchAll(/(?:data (?:do documento|de emiss[aã]o)|emiss[aã]o)\b[^\n]{0,200}(?:\n[^\n]{0,200})?/gi)){const d=unique((m[0].match(/\d{2}\/\d{2}\/\d{4}/g)||[]).map(brDate)).filter(x=>x!==due);if(d.length===1)emissions.push(d[0])}
 const emits=unique(emissions),nums=unique([...String(t).matchAll(/(?:n[º°o.]?\s*(?:do\s+)?documento|número (?:do )?documento)[^\n]{0,180}\n\s*(\d{4,20})(?!\d|\/)/gi)].map(x=>x[1]));
 return {linha_digitavel:line,valor_centavos:amount>0?amount:null,vencimento:due,emissao:emits.length===1?emits[0]:null,beneficiario:beneficiary?.beneficiario||null,documento:beneficiary?.documento||null,numero_documento:nums.length===1?nums[0]:null,observacao:line?'Linha digitável validada; confira pagador, beneficiário e datas no PDF.':'Possível boleto sem linha única validada; revisar PDF.'}
}
function planPages(texts,filename,complete=true){
 const parsed=texts.map((text,i)=>({pagina_pdf:i+1,info:inspect(text,filename)})),confirmed=parsed.filter(x=>x.info?.linha_digitavel),ids=unique(confirmed.map(x=>x.info.linha_digitavel));
 if(complete&&confirmed.length===texts.length&&ids.length===texts.length&&texts.length>1)return confirmed.map(x=>({...x.info,pagina_pdf:x.pagina_pdf}));
 if(complete&&ids.length===1&&confirmed.length===texts.length)return [{...confirmed[0].info,pagina_pdf:0}];
 if(complete&&texts.length===1&&parsed[0].info)return [{...parsed[0].info,pagina_pdf:0}];
 const info=inspect(texts.join('\n'),filename);
 return info?[{...info,pagina_pdf:0,linha_digitavel:null,valor_centavos:null,vencimento:null,emissao:null,numero_documento:null,observacao:'PDF com múltiplos documentos ou leitura incompleta. Conferir manualmente.'}]:[];
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
async function pdfPages(b){let task;try{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const worker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs');globalThis.pdfjsWorker={WorkerMessageHandler:worker.WorkerMessageHandler};
 task=pdfjs.getDocument({data:new Uint8Array(b),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true});
 const doc=await task.promise,texts=[];
 for(let i=1;i<=Math.min(doc.numPages,12);i++){const page=await doc.getPage(i),items=(await page.getTextContent()).items.filter(x=>x.str?.trim()),rows=[];
 for(const x of items){const y=x.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,items:[]};rows.push(r)}r.items.push(x)}
 texts.push(rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n'))}
 return {texts,complete:doc.numPages<=12};
 }catch{return {texts:[''],complete:false}}finally{try{await task?.destroy()}catch{}}}
async function reconcileFile(b,meta,actor){
 const pages=await pdfPages(b),plan=planPages(pages.texts,meta.filename,pages.complete),result={registrados:0,duplicados:0,revisados:0,erros:0,detalhe:''};
 if(!plan.length)return result;
 const key=hash(b),existing=await db('?arquivo_hash=eq.'+key+'&order=pagina_pdf.asc&limit=20'),old=existing.find(x=>x.pagina_pdf===0);
 if(old&&plan[0].pagina_pdf>0&&(old.status!=='conferencia'||old.fonte_dados?.startsWith('Conferência manual')||old.linha_digitavel)){result.duplicados++;result.detalhe='Registro anterior conferido; não foi dividido automaticamente.';return result}
 if(existing.some(x=>x.pagina_pdf>0)&&plan[0].pagina_pdf===0){result.duplicados++;return result}
 for(const info of plan){const known=existing.find(x=>x.pagina_pdf===info.pagina_pdf)||(info===plan[0]?old:null);
 try{if(known){if(known.status!=='conferencia'||known.fonte_dados?.startsWith('Conferência manual')){result.duplicados++;continue}
 const patch={};for(const k of ['linha_digitavel','valor_centavos','vencimento','emissao','beneficiario','documento','numero_documento'])if(known[k]==null&&info[k]!=null)patch[k]=info[k];
 if(known.pagina_pdf!==info.pagina_pdf)patch.pagina_pdf=info.pagina_pdf;
 if(!Object.keys(patch).length){result.duplicados++;continue}
 Object.assign(patch,{observacao:info.observacao,atualizado_por:actor,atualizado_em:new Date().toISOString()});
 const changed=await db('?id=eq.'+known.id+'&status=eq.conferencia&atualizado_em=eq.'+encodeURIComponent(known.atualizado_em),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});if(!changed?.length)err('Registro alterado durante a leitura.',409);result.revisados++;
 }else{if(old&&info!==plan[0]&&result.revisados===0&&!existing.some(x=>x.pagina_pdf===plan[0].pagina_pdf)){result.erros++;continue}
 const {filename,...source}=meta;await db('',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...source,...info,arquivo_hash:key,atualizado_por:actor,status:'conferencia',fonte_dados:'Gmail — dados sujeitos a conferência'})});result.registrados++}
 }catch(e){if(e.status===409)result.duplicados++;else result.erros++}}
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
 let cursor=state.after,pending=state.pending,part=state.part,count=0,added=0,duplicates=0,review=0,errors=0,revised=0,pdfsRead=0,attempted=0;
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
     added+=x.registrados;duplicates+=x.duplicados;review+=x.registrados;revised+=x.revisados;
     if(x.erros)issue('Falha no registro ou conferência do PDF',x.erros);
    }catch(e){issue(e.status===413?'Anexo acima do limite de download':'Falha ao baixar ou analisar PDF')}
   }
  }catch{issue('Falha ao consultar mensagem')}
  finally{if(finished){cursor=uid;count++;pending=0;part=0}}
  if(!finished)break;
 }
 const partial=count<ids.length;
 const next=partial?{antes_uid:cursor,limite_uid:ceiling,uid_pendente:pending,anexo_indice:part,validade_uid:m.validity,caixa:m.folder}:null;
 return {ok:true,processados:count,total:ids.length,restantes:ids.length-count,registrados:added,duplicados:duplicates,revisados:revised,conferencia:review,erros:errors,pdfs_lidos:pdfsRead,anexos_processados:attempted,motivos_erros:reasons,continuacao:next,proximo:partial?cursor:null,parcial:partial};
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
  if(b.acao==='grupo')return res.status(200).json({ok:true,itens:await group(b.id)});
  if(b.acao==='pdf-grupo')return await groupPdf(b,res);
  if(b.acao==='reprocessar')return res.status(200).json(await reprocess(b,u.login));
  if(b.acao==='alterar')return res.status(200).json(await update(b,u));
  if(b.acao==='dda')return res.status(200).json({ok:true,bb:'API DDA disponível; habilitação não verificada',bradesco:'DDA Net Empresa disponível; API não confirmada',pagamento:'Sem fonte bancária de liquidação autorizada. Nenhum pagamento automático.'});
  err('Ação inválida');
 }catch(e){return res.status(e.public?e.status: e.status===409?409:502).json({ok:false,erro:e.public?e.message:e.status===409?'Documento duplicado ou conflito de atualização.':'Não foi possível concluir a consulta. Confira a sessão, Gmail e Financeiro02.'})}
};
module.exports._test={validLine,lines,inspect,classify,date,queryDate,planPages,factorDates,validDoc,searchCursor};
