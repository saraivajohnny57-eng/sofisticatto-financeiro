(function(){
'use strict';
const $=id=>document.getElementById(id),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let rows=[],filtered=[],cursor=null,offset=0,busy=false,ready=false,scanStats=null,scanRange=null;
const money=n=>n==null?'—':(Number(n)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const dt=v=>v?new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
function el(tag,t){const n=document.createElement(tag);if(t!==undefined)n.textContent=t;return n}
function btn(t,fn,cls='btn azul'){const n=el('button',t);n.type='button';n.className=cls;n.onclick=fn;return n}
function msg(t){$('cpStatus').textContent=t}
async function request(b,blob=false){const r=await fetch('/api/integracoes?action=contas-pagar',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});if(blob&&r.ok)return r.blob();const d=await r.json();if(!r.ok||!d.ok)throw Error(d.erro||'Operação não confirmada');return d}
function range(){return {inicio:$('cpInicio').value,fim:$('cpFim').value}}
function status(r){if(r.status==='aberto'||r.status==='agendado'){if(r.vencimento&&r.vencimento<today())return 'Vencido';if(r.vencimento===today())return 'Vence hoje';return r.status==='agendado'?'Agendado':'A vencer'}return ({conferencia:'Em conferência',pago_manual:'Pago manualmente',cancelado:'Cancelado'})[r.status]||r.status}
function safeName(s){return String(s||'boleto').replace(/[\\/:*?"<>|]/g,'_').slice(0,110)}
function save(b,n){const url=URL.createObjectURL(b),a=el('a');a.href=url;a.download=n;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function blob(r,part){return request({acao:'baixar',id:r.id,parte:part||r.parte},true)}
function name(r,part){const a=(r.anexos||[]).find(x=>x.parte===(part||r.parte));const n=safeName(a?.nome||'boleto.pdf');return (!part||part===r.parte)&&r.pagina_pdf>0?n.replace(/\.pdf$/i,'_parcela_p'+r.pagina_pdf+'.pdf'):n}
function action(fn){return async()=>{try{await fn()}catch(e){msg(e.message)}}}
function groupKey(r){return JSON.stringify([r.conta_email,r.caixa,r.uidvalidity,String(r.uid)])}
function orderGroup(a,b){return String(a.vencimento||'9999').localeCompare(String(b.vencimento||'9999'))||String(a.numero_documento||'').localeCompare(String(b.numero_documento||''))||Number(a.pagina_pdf)-Number(b.pagina_pdf)||String(a.id).localeCompare(String(b.id))}
function groups(rs){const m=new Map();for(const r of rs){const k=groupKey(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return [...m.values()].map(x=>x.sort(orderGroup))}
function fmtDoc(v){const d=String(v||'').replace(/\D/g,'');return d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):d.length===11?d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):(v||'—')}
async function fullGroup(r){return (await request({acao:'grupo',id:r.id})).itens}
function groupName(rs){return safeName((rs[0].beneficiario||'boletos').slice(0,55)+'_'+String(rs[0].uid)+'_'+rs.length+'-boletos.pdf')}
async function groupAction(r,print){if(busy)return;busy=true;
 try{const all=await fullGroup(r);if(!confirm((print?'Imprimir':'Baixar')+' todos os '+all.length+' registro(s) cadastrados deste e-mail, inclusive os que não aparecem no filtro?'))return;
 msg('Preparando PDF conjunto de '+all.length+' boleto(s)...');const b=await request({acao:'pdf-grupo',id:r.id,ids:all.map(x=>x.id)},true);
 if(print)previewPdf(b,groupName(all));else save(b,groupName(all));msg('PDF conjunto preparado: '+all.length+' boleto(s).');
 }finally{busy=false}}
async function groupDialog(r,editing=false){const all=await fullGroup(r),d=$('cpDialog');d.replaceChildren(el('h2',editing?'Conferir / editar boletos do e-mail':'E-mail / detalhes'),el('p','Assunto: '+r.assunto),el('p','Remetente: '+r.remetente),el('p','Recebido em: '+dt(r.recebido_em)),el('p',all.length+' boleto(s) cadastrados neste e-mail.'));
 for(const [i,x] of all.entries()){const card=el('div');card.className='cpGroupDetail';card.append(el('strong','Boleto '+(i+1)+' • '+(x.numero_documento||'—')),el('p',br(x.vencimento)+' · '+money(x.valor_centavos)+' · '+status(x)),el('p','Linha digitável: '+(x.linha_digitavel||'Não validada')),el('p',x.observacao||''));
 if(x.possivel_substituicao)card.append(el('p','Possível substituição de boleto anterior. Compare os documentos antes de pagar.'));
 for(const re of x.reenvios||[])card.append(el('p','Reenvio: '+dt(re.recebido_em)+' • '+re.assunto));
 if(x.linha_digitavel)card.append(btn('Copiar linha digitável',action(()=>navigator.clipboard.writeText(x.linha_digitavel))));
 if(!['pago_manual','cancelado'].includes(x.status))card.append(btn('Conferir / editar',()=>{d.close();edit(x)}));
 if(['aberto','agendado'].includes(x.status))card.append(btn('Marcar como pago',()=>{d.close();paid(x)},'btn verde'));
 if(x.status==='aberto')card.append(btn('Marcar agendado',action(async()=>{if(confirm('Registrar como agendado? Isto não agenda no banco.')){await request({acao:'alterar',id:x.id,operacao:'agendar'});d.close();await load()}})));
 card.append(btn('Imprimir',action(()=>printOne(x))));d.append(card)}
 d.append(btn('Fechar',()=>d.close()));d.showModal()}
async function groupReprocess(r){if(busy)return;busy=true;try{const all=await fullGroup(r),seen=new Set(),targets=all.filter(x=>{const k=x.arquivo_hash+'|'+x.parte;if(x.status!=='conferencia'||String(x.fonte_dados||'').startsWith('Conferência manual')||seen.has(k))return false;seen.add(k);return true});if(!targets.length){msg('Nenhum PDF pendente de releitura.');return}
 let revised=0,added=0,fail=0;
 for(const [i,x] of targets.entries()){msg('Reprocessando PDF '+(i+1)+'/'+targets.length+'...');try{const d=await request({acao:'reprocessar',id:x.id});revised+=d.revisados||0;added+=d.registrados||0;fail+=d.erros||0}catch{fail++}}
 await load();msg('Releitura concluída: '+revised+' corrigido(s), '+added+' novo(s), '+fail+' erro(s). Registros conferidos preservados.');
 }finally{busy=false}}

function render(){
 const term=$('cpBusca').value.toLowerCase().trim(),st=$('cpFiltro').value;
 filtered=rows.filter(r=>(!term||[r.beneficiario,r.documento,r.assunto,r.remetente,r.linha_digitavel].join(' ').toLowerCase().includes(term))&&(!st||status(r)===st));
 const total=rs=>rs.reduce((a,r)=>a+Number(r.valor_centavos||0),0);
 const opened=rows.filter(r=>['aberto','agendado'].includes(r.status)),due=opened.filter(r=>r.vencimento===today()),late=opened.filter(r=>r.vencimento&&r.vencimento<today());
 const metrics=[['Em aberto',opened],['Vence hoje',due],['Vencidos',late],['Em conferência',rows.filter(r=>r.status==='conferencia')],['Pagos manualmente',rows.filter(r=>r.status==='pago_manual')]];
 $('cpMetrics').replaceChildren(...metrics.map(([n,rs])=>{const c=el('div');c.className='cpMetric';c.append(el('small',n),el('strong',money(total(rs))),el('small',rs.length+' documento(s)'));return c}));
 $('cpBadge').textContent=due.length?' ('+due.length+')':'';
 $('cpAviso').textContent=due.length||late.length?due.length+' vencem hoje e '+late.length+' estão vencidos no período carregado.':'Nenhum vencimento de hoje ou vencido nos boletos conferidos deste período.';
 const tb=$('cpRows');tb.replaceChildren();
 const allGroups=new Map(groups(rows).map(g=>[groupKey(g[0]),g]));
 for(const group of groups(filtered)){
  const all=allGroups.get(groupKey(group[0]))||group,first=group[0],names=[...new Set(all.map(x=>x.beneficiario).filter(Boolean))],docs=[...new Set(all.map(x=>x.documento).filter(Boolean))];
  const shared=el('td');shared.rowSpan=group.length;shared.className='cpShared';
  shared.append(el('strong',names.join(' / ')||'Beneficiário a conferir'),el('small',docs.map(fmtDoc).join(' / ')||'CPF/CNPJ a conferir'),el('small','Recebido: '+dt(first.recebido_em)),el('small',all.length+' boleto(s) carregado(s)'+(group.length!==all.length?' • '+group.length+' no filtro':'')),el('small','Total carregado: '+money(total(all))),el('small',first.assunto||''));
  const actions=el('td');actions.rowSpan=group.length;actions.className='cpShared cpGroupActions';
  actions.append(btn('Imprimir todos',action(()=>groupAction(first,true)),'btn verde'),btn('Baixar todos (PDF)',action(()=>groupAction(first,false))),btn('E-mail / detalhes',action(()=>groupDialog(first))),btn('Conferir / editar',action(()=>groupDialog(first,true))));
  if(all.some(x=>x.status==='conferencia'&&!String(x.fonte_dados||'').startsWith('Conferência manual')))actions.append(btn('Reprocessar PDF',action(()=>groupReprocess(first))));
  const primary=new Set(all.map(x=>String(x.parte))),parts=new Map();
  for(const r of all)for(const d of r.anexos||[])if(!primary.has(String(d.parte))&&!parts.has(String(d.parte)))parts.set(String(d.parte),{r,d});
  const xmls=[...parts.values()].filter(x=>x.d.tipo==='XML');
  for(const {r,d} of parts.values())if(d.tipo!=='XML'||xmls.length===1)actions.append(btn('Baixar '+d.tipo,action(async()=>save(await blob(r,d.parte),name(r,d.parte)))));
  if(xmls.length>1)actions.append(btn('Baixar XMLs ('+xmls.length+')',action(async()=>{if(busy)return;busy=true;const files=[];let failed=0;try{for(const [i,{r,d}] of xmls.entries()){msg('Baixando XML '+(i+1)+'/'+xmls.length);try{files.push({name:(i+1)+'_'+name(r,d.parte),data:new Uint8Array(await (await blob(r,d.parte)).arrayBuffer())})}catch{failed++}}if(files.length)save(zip(files),'xmls_'+String(first.uid)+'.zip');msg(files.length+' XML(s) preparados; '+failed+' erro(s).')}finally{busy=false}})));
  if(all.some(x=>x.pagina_pdf>0))actions.append(btn('PDF original completo',action(async()=>{const list=[...new Map(all.filter(x=>x.pagina_pdf>0).map(x=>[x.parte,x])).values()];for(const r of list){const b=await request({acao:'baixar',id:r.id,parte:r.parte,original:true},true);save(b,safeName((r.anexos||[]).find(x=>x.parte===r.parte)?.nome||'original.pdf'))}})));
  for(const [i,r] of group.entries()){
   const tr=el('tr');if(i===0)tr.className='cpGroupStart';
   if(i===0)tr.append(shared);
   const n=all.findIndex(x=>x.id===r.id)+1;
   for(const t of ['Boleto '+n+(r.numero_documento?' • '+r.numero_documento:''),money(r.valor_centavos),br(r.emissao),br(r.vencimento),status(r),r.categoria||'—'])tr.append(el('td',t));
   const dc=el('td');dc.className='cpIndividual';
   dc.append(btn('Imprimir boleto '+n,action(()=>printOne(r))),btn('Baixar boleto '+n,action(async()=>save(await blob(r),name(r)))));
   if(['aberto','agendado'].includes(r.status))dc.append(btn('Marcar como pago',()=>paid(r),'btn verde'));
   if(r.possivel_substituicao)dc.append(el('small','Possível boleto atualizado — conferir'));if(r.reenvios?.length)dc.append(el('small',r.reenvios.length+' reenvio(s)'));tr.append(dc);if(i===0)tr.append(actions);tb.append(tr)
  }
 }
 $('cpCount').textContent=filtered.length+' de '+rows.length+' boletos carregados • '+groups(filtered).length+' e-mail(s) no filtro. As ações de grupo consultam todos os registros cadastrados do e-mail.';
}
async function load(more=false){const d=await request({acao:'listar',...range(),offset:more?offset:0});if(!more)rows=[];rows.push(...d.itens);offset=rows.length;$('cpMais').hidden=!d.mais;render()}
function emptySearchStats(){return {processados:0,total:0,registrados:0,duplicados:0,revisados:0,conferencia:0,erros:0,pdfs_lidos:0,reenvios:0,possiveis_substituicoes:0,pendencias:0,lotes:0,motivos:{}}}
function addSearchStats(stats,d){
 const n={...stats,motivos:{...stats.motivos},lotes:stats.lotes+1};
 for(const k of ['processados','registrados','duplicados','revisados','conferencia','erros','pdfs_lidos','reenvios','possiveis_substituicoes','pendencias'])n[k]+=Math.max(0,Number(d[k]||0));
 n.total=n.processados+Math.max(0,Number(d.restantes??(Number(d.total||0)-Number(d.processados||0))));
 for(const [k,v] of Object.entries(d.motivos_erros||{}))n.motivos[k]=(n.motivos[k]||0)+Math.max(0,Number(v)||0);
 return n
}
function searchPercent(stats,complete=false){return complete?100:stats.total?Math.min(99,Math.floor(stats.processados/stats.total*100)):0}
function searchSummary(n){return 'Mensagens: '+n.processados+'/'+n.total+' · PDFs lidos: '+n.pdfs_lidos+' · Novos: '+n.registrados+' · Duplicados: '+n.duplicados+' · Corrigidos: '+n.revisados+' · Em conferência: '+n.conferencia+' · Erros: '+n.erros}
async function scan(more=false){
 if(busy)return;const selected=range();
 if(more&&(!cursor||!scanStats||!scanRange||scanRange.inicio!==selected.inicio||scanRange.fim!==selected.fim))more=false;
 if(!more){cursor=null;scanStats=emptySearchStats();scanRange={...selected}}
 busy=true;let stop=false,finished=false,problem='',stalled=0;
 const d=$('cpSearchProgress'),title=el('h2','Pesquisa de boletos no Gmail'),period=el('p','Recebimento: '+br(scanRange.inicio)+' a '+br(scanRange.fim)),stage=el('p','Conectando ao Gmail e identificando mensagens...'),p=el('progress');p.max=100;p.removeAttribute('value');p.setAttribute('aria-label','Progresso da pesquisa');
 const pct=el('strong','Localizando mensagens...'),grid=el('div');grid.className='cpSearchMetrics';
 const counters={};for(const [k,label] of [['processados','Mensagens examinadas'],['pdfs_lidos','PDFs lidos'],['registrados','Boletos novos'],['duplicados','Duplicados'],['revisados','Corrigidos'],['conferencia','Novos em conferência'],['erros','Erros'],['reenvios','Reenvios vinculados'],['possiveis_substituicoes','Possíveis substituições'],['pendencias','PDFs a conferir'],['lotes','Lotes concluídos']]){
  const c=el('div'),v=el('strong','0');c.className='cpMetric';c.append(el('small',label),v);grid.append(c);counters[k]=v;
 }
 const causes=el('div');causes.className='cpSearchErrors';
 const foot=el('p','A pesquisa continua automaticamente em lotes enquanto o portal estiver aberto. Não feche a página. Nenhum pagamento é realizado.');
 const cancel=btn('Interromper pesquisa',()=>{stop=true;cancel.disabled=true;stage.textContent='Interrompendo após a etapa em andamento...';},'btn vermelho');
 const close=btn('Fechar',()=>d.close());close.hidden=true;
 d.replaceChildren(title,period,stage,p,pct,grid,causes,foot,cancel,close);
 d.oncancel=e=>{if(busy){e.preventDefault();cancel.click()}};
 for(const id of ['cpBuscar','cpContinuar','cpInicio','cpFim','cpLoad','cpMais'])$(id).disabled=true;
 d.showModal();
 const show=(complete=false)=>{
  const n=scanStats,v=searchPercent(n,complete);p.value=v;pct.textContent=v+'% • '+n.processados+'/'+n.total+' mensagens examinadas';
  for(const k of Object.keys(counters))counters[k].textContent=k==='processados'?n.processados+'/'+n.total:String(n[k]);
  causes.replaceChildren();for(const [reason,count] of Object.entries(n.motivos))causes.append(el('p',reason+': '+count));
 };
 if(more)show();
 try{
  // Sequential requests avoid long Vercel functions and repeated database list reads.
  while(!stop){
   stage.textContent='Pesquisando lote '+(scanStats.lotes+1)+'...';
   const sent=cursor;
   const result=await request({acao:'buscar',...scanRange,continuacao:sent||undefined});
   scanStats=addSearchStats(scanStats,result);
   if(!result.parcial){finished=true;cursor=null;show(true);break}
   if(!result.continuacao)throw Error('A pesquisa não retornou um cursor de continuação válido. Atualize o portal.');
   cursor=result.continuacao;
   const moved=JSON.stringify(sent)!==JSON.stringify(cursor)||Number(result.processados)>0||Number(result.anexos_processados)>0;
   stalled=moved?0:stalled+1;
   show();
   if(stalled>=2)throw Error('O Gmail não avançou nas últimas tentativas. Use Continuar pesquisa para retomar.');
  }
 }catch(e){problem=e.message||'Falha de pesquisa.'}
 finally{
  // The modal remains visible until the user closes it. Refresh the list only once.
  stage.textContent='Atualizando a lista de boletos...';
  try{await load()}catch(e){problem+=(problem?' • ':'')+'Não foi possível atualizar a lista: '+e.message}
  busy=false;for(const id of ['cpBuscar','cpContinuar','cpInicio','cpFim','cpLoad','cpMais'])$(id).disabled=false;
  $('cpContinuar').hidden=!cursor;cancel.hidden=true;close.hidden=false;
  show(finished);
  if(problem)stage.textContent='Pesquisa interrompida: '+problem;
  else if(finished)stage.textContent=(scanStats.erros||scanStats.pendencias)?'Pesquisa concluída com pendências de leitura.':'Pesquisa concluída.';
  else stage.textContent='Pesquisa interrompida pelo usuário. Resultados já registrados foram preservados.';
  foot.textContent=finished?((scanStats.erros||scanStats.pendencias)?'Os erros indicados precisam de conferência. 100% significa mensagens examinadas, não todos os boletos reconhecidos.':'Resultados importados estão disponíveis na lista. Nenhum pagamento foi efetuado.'):(cursor?'Clique em Continuar pesquisa para retomar do último ponto nesta sessão.':'Clique em Buscar boletos no Gmail para iniciar novamente.');
  msg(searchSummary(scanStats)+(finished?' · Pesquisa concluída'+(scanStats.erros?' com pendências.':'.'):' · Pesquisa parcial.')+(problem?' '+problem:''));
 }
}
function details(r){const d=$('cpDialog');d.replaceChildren(el('h2','Documento recebido'),el('p','Assunto: '+r.assunto),el('p','Remetente: '+r.remetente),el('p','Recebido em: '+dt(r.recebido_em)),el('p','Linha digitável: '+(r.linha_digitavel||'Não validada')),el('p',r.observacao||''));
 if(r.linha_digitavel)d.append(btn('Copiar linha digitável',action(async()=>{await navigator.clipboard.writeText(r.linha_digitavel)})));
 d.append(btn('Fechar',()=>d.close()));d.showModal()}
function form(r,paying){const d=$('cpDialog');d.replaceChildren(el('h2',paying?'Confirmar pagamento manual':'Conferir dados do boleto'));
 const fields=paying?[['pago_em','Data do pagamento','date',today()],['valor_pago_centavos','Valor pago (R$)','number',r.valor_centavos==null?'':(r.valor_centavos/100).toFixed(2)],['banco_pagamento','Banco utilizado','text','']]:
 [['beneficiario','Beneficiário','text',r.beneficiario],['documento','CPF/CNPJ','text',r.documento],['emissao','Emissão','date',r.emissao],['vencimento','Vencimento','date',r.vencimento],['valor_centavos','Valor (R$)','number',r.valor_centavos==null?'':(r.valor_centavos/100).toFixed(2)],['linha_digitavel','Linha digitável','text',r.linha_digitavel],['categoria','Categoria','text',r.categoria],['observacao','Observações','text',r.observacao]];
 const inputs={};for(const [k,label,type,v] of fields){const wrap=el('label',label);const i=el('input');i.type=type;i.value=v||'';if(type==='number'){i.step='0.01';i.min='0'}wrap.append(i);d.append(wrap);inputs[k]=i}
 const c=el('input');c.type='checkbox';const l=el('label',paying?'Confirmo que o pagamento foi efetivamente realizado.':'Conferi o PDF, pagador, beneficiário, valor e vencimento.');l.prepend(c);d.append(l);
 const out=el('p');d.append(out);
 d.append(btn('Salvar',async()=>{if(!c.checked){out.textContent='Confirme a conferência antes de salvar.';return}if(!paying&&r.possivel_substituicao&&!confirm('Confirma que verificou a situação do boleto anterior e que este título deve ser liberado?'))return;const b={acao:'alterar',id:r.id,operacao:paying?'pagar':'editar',conferido:true,substituicao_conferida:!!r.possivel_substituicao};
 for(const [k,i] of Object.entries(inputs)){if(i.type==='number'&&!i.value.trim()){out.textContent='Informe o valor.';return}b[k]=i.type==='number'?Math.round(Number(i.value)*100):i.value}
 try{await request(b);d.close();await load();msg('Registro atualizado. Nenhuma transação bancária realizada.')}catch(e){out.textContent=e.message}
 },'btn verde'),btn('Cancelar',()=>d.close()));d.showModal()}
const edit=r=>form(r,false),paid=r=>form(r,true);
let activePreview=null;
function previewPdf(file,filename){
 if(activePreview)activePreview();
 const url=URL.createObjectURL(new Blob([file],{type:'application/pdf'})),modal=el('dialog');
 modal.style.cssText='width:min(1120px,96vw);height:92vh;max-width:96vw;max-height:92vh;padding:0;border:1px solid #d4c8e8;border-radius:14px;overflow:hidden;background:white;color:#302653';
 const panel=el('section');panel.style.cssText='height:100%;display:flex;flex-direction:column';
 const header=el('header');header.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;background:#f4effa;border-bottom:1px solid #ded4ee';
 const title=el('strong',filename);title.style.flex='1';
 const frame=el('iframe');frame.title='Prévia do boleto original';frame.style.cssText='width:100%;flex:1;border:0;background:#eee';frame.src=url;
 let closed=false;const close=()=>{if(closed)return;closed=true;modal.close();modal.remove();URL.revokeObjectURL(url);if(activePreview===close)activePreview=null};
 modal.addEventListener('cancel',e=>{e.preventDefault();close()});
 header.append(title,btn('Imprimir',()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch{msg('Use o ícone de impressão no visualizador do PDF.')}},'btn verde'),btn('Baixar PDF',()=>save(file,filename)),btn('Fechar',close));
 const note=el('small','Prévia interna • PDF preservado • Confira o tamanho real na impressão.');note.style.cssText='padding:6px 12px;color:#665577';
 panel.append(header,note,frame);modal.append(panel);document.body.append(modal);modal.showModal();activePreview=close;
}
async function printOne(r){msg('Carregando prévia interna...');const b=await blob(r);previewPdf(b,name(r));msg('Prévia interna pronta.');}
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function zip(files){const parts=[],central=[];let off=0,cd=0;const enc=new TextEncoder();
 for(const f of files){const n=enc.encode(f.name),b=f.data,h=new Uint8Array(30+n.length),v=new DataView(h.buffer),z=new Uint8Array(46+n.length),w=new DataView(z.buffer);const sum=crc(b);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint32(14,sum,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint32(16,sum,true);w.setUint32(20,b.length,true);w.setUint32(24,b.length,true);w.setUint16(28,n.length,true);w.setUint32(42,off,true);z.set(n,46);parts.push(h,b);central.push(z);off+=h.length+b.length;cd+=z.length}
 const e=new Uint8Array(22),q=new DataView(e.buffer);q.setUint32(0,0x06054b50,true);q.setUint16(8,files.length,true);q.setUint16(10,files.length,true);q.setUint32(12,cd,true);q.setUint32(16,off,true);return new Blob([...parts,...central,e],{type:'application/zip'})}
async function batch(print=false){if(busy)return;const list=filtered.slice();if(!list.length)return msg('Nenhum boleto no filtro.');if(list.length>50)return msg('Selecione até 50 registros por lote.');if(!confirm((print?'Abrir para impressão ':'Baixar ')+list.length+' boletos do filtro carregado?'))return;
 busy=true;const d=$('cpProgress');d.replaceChildren(el('h2',print?'Preparar impressão':'Baixar todos os boletos por filtro'));const p=el('progress');p.max=list.length;p.value=0;const info=el('p'),errors=el('div');d.append(p,info,errors);d.showModal();
 let ok=0,fail=0;const files=[];const update=()=>{info.textContent='Processando: '+p.value+'/'+list.length+' · Preparados: '+ok+'/'+list.length+' · Erros: '+fail+' · '+(print?'Impressos: não confirmado':'Salvos no PC: depende do navegador')};update();
 try{for(const r of list){try{const b=await blob(r);files.push({name:(files.length+1)+'_'+name(r),data:new Uint8Array(await b.arrayBuffer())});ok++}catch(e){fail++;errors.append(el('p',(r.beneficiario||r.assunto||r.id)+': '+e.message))}p.value++;update()}
 if(files.length){if(print){
 // Impressão em lote sem alegar confirmação física: cada PDF é aberto por clique explícito.
 const label=el('p','PDFs preparados. Visualize cada documento no balão interno e clique em Imprimir; a impressão física não é confirmada pelo navegador.');d.append(label);
 for(const f of files)d.append(btn('Visualizar '+f.name,()=>previewPdf(new Blob([f.data],{type:'application/pdf'}),f.name)));}
 else{save(zip(files),'boletos_'+today()+'.zip');d.append(el('p','ZIP preparado. Confirme o download no navegador.'));}}
 }finally{busy=false;d.append(btn('Fechar',()=>d.close()))}}
function mount(){if(ready)return;ready=true;
 const root=$('contasPagar');root.innerHTML='<div class="card cpRoot"><h1>Contas a pagar</h1><p>Boletos recebidos no Gmail · controle financeiro · sem débito automático</p><div id="cpMetrics" class="cpMetrics"></div><p id="cpAviso" class="cpAviso"></p><div class="cpTools"><label>Recebido de<input type="date" id="cpInicio"></label><label>Até<input type="date" id="cpFim"></label><label>Pesquisar<input id="cpBusca" placeholder="Beneficiário, CNPJ, e-mail"></label><label>Situação<select id="cpFiltro"><option value="">Todas</option><option>Em conferência</option><option>A vencer</option><option>Vence hoje</option><option>Vencido</option><option>Agendado</option><option>Pago manualmente</option><option>Cancelado</option></select></label></div><div class="cpActions"><button class="btn azul" id="cpLoad">Atualizar lista</button><button class="btn verde" id="cpBuscar">Buscar boletos no Gmail</button><button class="btn azul" id="cpContinuar" hidden>Continuar pesquisa</button><button class="btn azul" id="cpDda">Consultar disponibilidade DDA</button><button class="btn verde" id="cpZip">Baixar todos os boletos por filtro</button><button class="btn azul" id="cpPrint">Preparar impressão por filtro</button></div><p id="cpStatus" role="status" aria-live="polite"></p><p id="cpCount"></p><div class="cpScroll"><table><thead><tr><th>Beneficiário / e-mail</th><th>Parcela / documento</th><th>Valor</th><th>Emissão</th><th>Vencimento</th><th>Status</th><th>Categoria</th><th>Ações individuais</th><th>Ações do e-mail</th></tr></thead><tbody id="cpRows"></tbody></table></div><button class="btn azul" id="cpMais" hidden>Carregar mais registros</button><dialog id="cpDialog"></dialog><dialog id="cpProgress"></dialog><dialog id="cpSearchProgress"></dialog></div>';
 const style=el('style');style.textContent='#contasPagar .cpMetrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:15px 0}.cpMetric{background:#f3eff9;border:1px solid #ded5ed;border-radius:10px;padding:14px;display:grid;gap:5px;color:#4d3b84}.cpMetric strong{font-size:19px}.cpTools,.cpActions{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0;align-items:end}.cpTools label{display:grid;gap:5px;font-size:12px;min-width:140px}.cpTools input,.cpTools select{padding:8px;border:1px solid #d6cce8;border-radius:7px}.cpScroll{overflow:auto}.cpScroll table{min-width:1050px;width:100%;border-collapse:collapse}.cpScroll td,.cpScroll th{padding:9px;border-bottom:1px solid #eee;vertical-align:top;text-align:left;font-size:12px}.cpScroll td button{display:block;margin:3px 0;font-size:11px;white-space:nowrap}.cpAviso{background:#fff6e2;color:#76520f;padding:10px;border-radius:8px}.cpRoot dialog{max-width:min(620px,90vw);max-height:85vh;overflow:auto;border:1px solid #d6cce8;border-radius:12px;padding:20px}.cpRoot dialog label{display:block;margin:8px 0}.cpRoot dialog input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;padding:7px}.cpRoot dialog button{margin:5px}.cpRoot progress{width:100%}.cpRoot [hidden]{display:none!important}.cpScroll .cpShared{background:#faf8fe;vertical-align:top;border-bottom:2px solid #d8cce9;min-width:150px}.cpShared small{display:block;margin:6px 0;overflow-wrap:anywhere}.cpScroll .cpGroupStart td{border-top:2px solid #d8cce9}.cpScroll .cpIndividual button,.cpScroll .cpGroupActions button{margin:2px 0;padding:6px 9px;min-height:28px}.cpGroupDetail{border:1px solid #ded4ee;border-radius:9px;padding:12px;margin:10px 0;overflow-wrap:anywhere}.cpGroupDetail p{margin:5px 0}#cpSearchProgress{position:fixed!important;inset:0!important;margin:auto!important;width:min(620px,94vw);height:max-content;max-height:88vh;box-sizing:border-box;overflow:auto} .cpRoot dialog:not(#cpSearchProgress){margin:auto!important}#cpSearchProgress progress{height:18px;accent-color:#5a4fa3}#cpSearchProgress .cpSearchMetrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}#cpSearchProgress .cpMetric{padding:10px}#cpSearchProgress .cpSearchErrors{color:#a44a2c;font-size:12px}#cpSearchProgress .cpSearchErrors p{margin:4px 0}';document.head.append(style);
 $('cpFim').value=today();$('cpInicio').value=today().slice(0,8)+'01';
 $('cpLoad').onclick=action(()=>load());$('cpBuscar').onclick=action(()=>scan());$('cpContinuar').onclick=action(()=>scan(true));$('cpMais').onclick=action(()=>load(true));
 $('cpBusca').oninput=render;$('cpFiltro').onchange=render;
 for(const id of ['cpInicio','cpFim'])$(id).onchange=()=>{cursor=null;scanStats=null;scanRange=null;$('cpContinuar').hidden=true;rows=[];render();msg('Período alterado. Clique em Atualizar lista ou Buscar boletos.');};
 $('cpZip').onclick=action(()=>batch());$('cpPrint').onclick=action(()=>batch(true));$('cpDda').onclick=action(async()=>{const x=await request({acao:'dda'});msg('BB: '+x.bb+' · Bradesco: '+x.bradesco+' · '+x.pagamento)});
}
window.contasPagarAbrir=()=>{mount();action(()=>load())()};
})();
