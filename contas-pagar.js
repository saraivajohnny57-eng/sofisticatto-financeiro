(function(){
'use strict';
const $=id=>document.getElementById(id),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let rows=[],filtered=[],cursor=null,offset=0,busy=false,ready=false;
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
function name(r,part){const a=(r.anexos||[]).find(x=>x.parte===(part||r.parte));return safeName(a?.nome||'boleto.pdf')}
function action(fn){return async()=>{try{await fn()}catch(e){msg(e.message)}}}
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
 for(const r of filtered){
  const tr=el('tr');for(const t of [r.beneficiario||'Beneficiário a conferir',r.documento||'—',money(r.valor_centavos),br(r.emissao),dt(r.recebido_em),br(r.vencimento),status(r),r.categoria||'—'])tr.append(el('td',t));
  const docs=el('td'),ops=el('td');
  docs.append(btn('Baixar boleto',action(async()=>save(await blob(r),name(r)))));
  for(const a of r.anexos||[])if(a.parte!==r.parte)docs.append(btn('Baixar '+a.tipo,action(async()=>save(await blob(r,a.parte),name(r,a.parte)))));
  ops.append(btn('Imprimir',action(()=>printOne(r))),btn('E-mail / detalhes',()=>details(r)));
  if(!['pago_manual','cancelado'].includes(r.status))ops.append(btn('Conferir / editar',()=>edit(r)));
  if(['aberto','agendado'].includes(r.status))ops.append(btn('Marcar como pago',()=>paid(r),'btn verde'));
  if(r.status==='aberto')ops.append(btn('Marcar agendado',action(async()=>{if(confirm('Registrar como agendado? Isto não agenda no banco.')){await request({acao:'alterar',id:r.id,operacao:'agendar'});await load()}})));
  tr.append(docs,ops);tb.append(tr);
 }
 $('cpCount').textContent=filtered.length+' de '+rows.length+' registros carregados. Totais referem-se apenas ao período e aos registros carregados.';
}
async function load(more=false){const d=await request({acao:'listar',...range(),offset:more?offset:0});if(!more)rows=[];rows.push(...d.itens);offset=rows.length;$('cpMais').hidden=!d.mais;render()}
async function scan(more=false){if(busy)return;busy=true;$('cpBuscar').disabled=true;$('cpContinuar').disabled=true;
 try{msg('Buscando PDFs no Gmail em somente leitura...');const d=await request({acao:'buscar',...range(),antes_uid:more?cursor:0});cursor=d.proximo;$('cpContinuar').hidden=!cursor;msg('Mensagens processadas: '+d.processados+' / '+d.total+' · Novos: '+d.registrados+' · Duplicados: '+d.duplicados+' · Em conferência: '+d.conferencia+' · Erros: '+d.erros+(d.parcial?' · Busca parcial; use Continuar pesquisa.':''));await load()}
 finally{busy=false;$('cpBuscar').disabled=false;$('cpContinuar').disabled=false}
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
 d.append(btn('Salvar',async()=>{if(!c.checked){out.textContent='Confirme a conferência antes de salvar.';return}const b={acao:'alterar',id:r.id,operacao:paying?'pagar':'editar',conferido:true};
 for(const [k,i] of Object.entries(inputs)){if(i.type==='number'&&!i.value.trim()){out.textContent='Informe o valor.';return}b[k]=i.type==='number'?Math.round(Number(i.value)*100):i.value}
 try{await request(b);d.close();await load();msg('Registro atualizado. Nenhuma transação bancária realizada.')}catch(e){out.textContent=e.message}
 },'btn verde'),btn('Cancelar',()=>d.close()));d.showModal()}
const edit=r=>form(r,false),paid=r=>form(r,true);
async function printOne(r){const w=window.open('','_blank');if(!w)throw Error('Permita pop-ups para imprimir.');try{w.location.href=URL.createObjectURL(new Blob([await blob(r)],{type:'application/pdf'}));msg('PDF aberto. Use Ctrl+P para imprimir.')}catch(e){w.close();throw e}}
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
 const label=el('p','PDFs preparados. Abra cada documento e use Ctrl+P; o navegador não confirma impressão física.');d.append(label);
 for(const f of files)d.append(btn('Abrir '+f.name,()=>{const w=window.open('','_blank');if(w)w.location.href=URL.createObjectURL(new Blob([f.data],{type:'application/pdf'}));else msg('Permita pop-ups.')}));}
 else{save(zip(files),'boletos_'+today()+'.zip');d.append(el('p','ZIP preparado. Confirme o download no navegador.'));}}
 }finally{busy=false;d.append(btn('Fechar',()=>d.close()))}}
function mount(){if(ready)return;ready=true;
 const root=$('contasPagar');root.innerHTML='<div class="card cpRoot"><h1>Contas a pagar</h1><p>Boletos recebidos no Gmail · controle financeiro · sem débito automático</p><div id="cpMetrics" class="cpMetrics"></div><p id="cpAviso" class="cpAviso"></p><div class="cpTools"><label>Recebido de<input type="date" id="cpInicio"></label><label>Até<input type="date" id="cpFim"></label><label>Pesquisar<input id="cpBusca" placeholder="Beneficiário, CNPJ, e-mail"></label><label>Situação<select id="cpFiltro"><option value="">Todas</option><option>Em conferência</option><option>A vencer</option><option>Vence hoje</option><option>Vencido</option><option>Agendado</option><option>Pago manualmente</option><option>Cancelado</option></select></label></div><div class="cpActions"><button class="btn azul" id="cpLoad">Atualizar lista</button><button class="btn verde" id="cpBuscar">Buscar boletos no Gmail</button><button class="btn azul" id="cpContinuar" hidden>Continuar pesquisa</button><button class="btn azul" id="cpDda">Consultar disponibilidade DDA</button><button class="btn verde" id="cpZip">Baixar todos os boletos por filtro</button><button class="btn azul" id="cpPrint">Preparar impressão por filtro</button></div><p id="cpStatus" role="status" aria-live="polite"></p><p id="cpCount"></p><div class="cpScroll"><table><thead><tr><th>Beneficiário</th><th>CPF/CNPJ</th><th>Valor</th><th>Emissão</th><th>Recebimento</th><th>Vencimento</th><th>Status</th><th>Categoria</th><th>Documentos</th><th>Ações</th></tr></thead><tbody id="cpRows"></tbody></table></div><button class="btn azul" id="cpMais" hidden>Carregar mais registros</button><dialog id="cpDialog"></dialog><dialog id="cpProgress"></dialog></div>';
 const style=el('style');style.textContent='#contasPagar .cpMetrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:15px 0}.cpMetric{background:#f3eff9;border:1px solid #ded5ed;border-radius:10px;padding:14px;display:grid;gap:5px;color:#4d3b84}.cpMetric strong{font-size:19px}.cpTools,.cpActions{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0;align-items:end}.cpTools label{display:grid;gap:5px;font-size:12px;min-width:140px}.cpTools input,.cpTools select{padding:8px;border:1px solid #d6cce8;border-radius:7px}.cpScroll{overflow:auto}.cpScroll table{min-width:1050px;width:100%;border-collapse:collapse}.cpScroll td,.cpScroll th{padding:9px;border-bottom:1px solid #eee;vertical-align:top;text-align:left;font-size:12px}.cpScroll td button{display:block;margin:3px 0;font-size:11px;white-space:nowrap}.cpAviso{background:#fff6e2;color:#76520f;padding:10px;border-radius:8px}.cpRoot dialog{max-width:min(620px,90vw);max-height:85vh;overflow:auto;border:1px solid #d6cce8;border-radius:12px;padding:20px}.cpRoot dialog label{display:block;margin:8px 0}.cpRoot dialog input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;padding:7px}.cpRoot dialog button{margin:5px}.cpRoot progress{width:100%}.cpRoot [hidden]{display:none!important}';document.head.append(style);
 $('cpFim').value=today();$('cpInicio').value=today().slice(0,8)+'01';
 $('cpLoad').onclick=action(()=>load());$('cpBuscar').onclick=action(()=>scan());$('cpContinuar').onclick=action(()=>scan(true));$('cpMais').onclick=action(()=>load(true));
 $('cpBusca').oninput=render;$('cpFiltro').onchange=render;
 for(const id of ['cpInicio','cpFim'])$(id).onchange=()=>{cursor=null;$('cpContinuar').hidden=true;rows=[];render();msg('Período alterado. Clique em Atualizar lista ou Buscar boletos.');};
 $('cpZip').onclick=action(()=>batch());$('cpPrint').onclick=action(()=>batch(true));$('cpDda').onclick=action(async()=>{const x=await request({acao:'dda'});msg('BB: '+x.bb+' · Bradesco: '+x.bradesco+' · '+x.pagamento)});
}
window.contasPagarAbrir=()=>{mount();action(()=>load())()};
})();
