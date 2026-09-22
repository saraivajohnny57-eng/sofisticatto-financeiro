/* Sofisticatto Financeiro V234 — Relatório detalhado de faturas dos Correios */
let correiosFaturaLinhas=[];
let correiosFaturaMeta={arquivo:'',importadoEm:null};

function cfTxt(v){return String(v??'').trim()}
function cfNorm(v){return cfTxt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function cfTrack(v){return cfTxt(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function cfCep(v){const d=cfTxt(v).replace(/\D/g,'').padStart(8,'0').slice(-8);return d?`${d.slice(0,5)}-${d.slice(5)}`:''}
function cfNumBR(v){let s=cfTxt(v).replace(/R\$/gi,'').replace(/\s/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0}
function cfMoeda(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function cfEsc(v){return cfTxt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cfCsvCell(v){const s=cfTxt(v);return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function cfDetectSep(line){return (line.match(/;/g)||[]).length >= (line.match(/,/g)||[]).length?';':','}
function cfParseLine(line,sep){let a=[],cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===sep&&!q){a.push(cur);cur=''}else cur+=c}a.push(cur);return a}
function cfKey(k){return cfNorm(k).replace(/[^a-z0-9]/g,'')}
function cfPick(o,names){for(const n of names){const k=Object.keys(o).find(x=>cfKey(x)===cfKey(n)||cfKey(x).includes(cfKey(n)));if(k&&cfTxt(o[k]))return o[k]}return ''}

function cfParseCsv(text){
  const raw=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(!raw.length)return [];
  let hi=raw.findIndex(l=>/etiqueta|rastre|cep/i.test(l)&&/valor|servi/i.test(l)); if(hi<0)hi=0;
  const sep=cfDetectSep(raw[hi]), headers=cfParseLine(raw[hi],sep).map(x=>x.trim());
  return raw.slice(hi+1).map(l=>{const vals=cfParseLine(l,sep),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o}).filter(o=>Object.values(o).some(v=>cfTxt(v)));
}

async function cfCarregarBase(){
  let rast=[],col=[];
  try{const r=await banco.from('logistica_rastreamentos').select('*').eq('sentido','saida');if(!r.error)rast=r.data||[]}catch(e){console.warn(e)}
  try{const r=await banco.from('coleta_agendamentos').select('*').order('created_at',{ascending:false}).limit(3000);if(!r.error)col=r.data||[]}catch(e){console.warn(e)}
  return {rast,col};
}
function cfInfoColeta(a){const d=a?.dados||{};return {cliente:a?.cliente_nome||d.razao_destino||'',nf:a?.numero_nf||d.numero_nf||d.numero_nfe||'',cidade:d.cidade_destino||'',uf:d.uf_destino||d.estado_destino||'',cep:d.cep_destino||'',pedido:d.numero_pedido||d.pedido||''}}
function cfAchar(row,base){
  const tr=cfTrack(row.rastreio);
  const r=base.rast.find(x=>cfTrack(x.protocolo_rastreio)===tr);
  if(r){const a=base.col.find(x=>String(x.id)===String(r.coleta_agendamento_id));const ci=cfInfoColeta(a);return {cliente:r.parceiro_nome||ci.cliente,nf:r.numero_nfe||ci.nf,pedido:ci.pedido,cidade:ci.cidade,uf:ci.uf,cep:ci.cep,fonte:'Rastreio do portal',status:'ok'}}
  const a=base.col.find(x=>{const d=x.dados||{};return [x.codigo_coleta,x.protocolo_cotacao,d.codigo_rastreio,d.rastreio,d.objeto,d.etiqueta].some(v=>cfTrack(v)===tr)});
  if(a){const ci=cfInfoColeta(a);return {...ci,fonte:'Coleta do portal',status:'ok'}}
  const cep=cfTxt(row.cep).replace(/\D/g,'');
  const sugest=base.col.filter(x=>cfTxt((x.dados||{}).cep_destino).replace(/\D/g,'')===cep);
  if(sugest.length===1){const ci=cfInfoColeta(sugest[0]);return {...ci,fonte:'Sugestão pelo CEP',status:'sugestao'}}
  return {cliente:'',nf:'',pedido:'',cidade:'',uf:'',cep:'',fonte:'Não identificado',status:'pendente'};
}

async function importarFaturaCorreiosCsv(){
  const inp=document.getElementById('corFaturaCsv'),file=inp?.files?.[0];if(!file)return alert('Selecione o arquivo CSV baixado do Portal dos Correios.');
  const txt=await file.text(),dados=cfParseCsv(txt);if(!dados.length)return alert('Não encontrei linhas de postagem no CSV.');
  const base=await cfCarregarBase();
  correiosFaturaLinhas=dados.map(o=>{
    const row={
      data:cfPick(o,['data','data postagem','data da postagem']),
      servico:cfPick(o,['serviço','servico','nome serviço','nome servico']),
      cep:cfCep(cfPick(o,['cep','cep destinatário','cep destinatario'])),
      rastreio:cfTrack(cfPick(o,['etiqueta','objeto','rastreio','código rastreamento','codigo rastreamento'])),
      peso:cfPick(o,['peso (g)','peso','peso g']),
      valor:cfNumBR(cfPick(o,['valor','valor serviço','valor servico','valor líquido','valor liquido'])),
      declarado:cfNumBR(cfPick(o,['valor declarado','declarado']))
    };
    return {...row,...cfAchar(row,base)};
  }).filter(x=>x.rastreio||x.cep||x.valor);
  correiosFaturaMeta={arquivo:file.name,importadoEm:new Date().toISOString()};
  cfRender();
}
function cfRender(){
  const tb=document.getElementById('corFaturaTabela'),res=document.getElementById('corFaturaResumo'),pend=document.getElementById('corFaturaPendencias');if(!tb)return;
  const total=correiosFaturaLinhas.reduce((s,x)=>s+x.valor,0), pac=correiosFaturaLinhas.filter(x=>/pac/i.test(x.servico)).length, sedex=correiosFaturaLinhas.filter(x=>/sedex/i.test(x.servico)).length, ok=correiosFaturaLinhas.filter(x=>x.status==='ok').length, sug=correiosFaturaLinhas.filter(x=>x.status==='sugestao').length;
  res.innerHTML=`<b>${correiosFaturaLinhas.length}</b> postagens • PAC: <b>${pac}</b> • SEDEX: <b>${sedex}</b> • Total: <b>${cfMoeda(total)}</b> • Identificados: <b>${ok}</b>${sug?` • Sugestões por CEP: <b>${sug}</b>`:''}`;
  tb.innerHTML=correiosFaturaLinhas.map((x,i)=>`<tr style="border-bottom:1px solid #ddd;background:${x.status==='pendente'?'#fff3f3':x.status==='sugestao'?'#fff9e8':'white'}"><td style="padding:7px">${cfEsc(x.data)}</td><td><input value="${cfEsc(x.cliente)}" placeholder="Cliente" oninput="cfEditar(${i},'cliente',this.value)" style="min-width:180px"></td><td>${cfEsc([x.cidade,x.uf].filter(Boolean).join('/'))}</td><td><input value="${cfEsc(x.nf||x.pedido)}" placeholder="NF/Pedido" oninput="cfEditar(${i},'nf',this.value)" style="width:100px"></td><td>${cfEsc(x.servico)}</td><td><b>${cfEsc(x.rastreio)}</b></td><td>${cfEsc(x.cep)}</td><td>${cfEsc(x.peso)}</td><td>${cfMoeda(x.valor)}</td><td>${cfMoeda(x.declarado)}</td><td>${x.status==='ok'?'✅':x.status==='sugestao'?'⚠️':'❌'} ${cfEsc(x.fonte)}</td></tr>`).join('');
  const n=correiosFaturaLinhas.filter(x=>x.status==='pendente').length;pend.innerHTML=n?`<div style="padding:9px;border-radius:8px;background:#fff0f0;color:#a12222"><b>⚠️ ${n} postagem(ns) não identificada(s).</b> Você pode preencher Cliente e NF/Pedido diretamente na tabela. O sistema nunca confirma cliente somente pelo CEP.</div>`:'<div style="padding:9px;border-radius:8px;background:#effaf2;color:#25713c"><b>✅ Todas as postagens foram identificadas ou sugeridas.</b></div>';
}
function cfEditar(i,k,v){if(correiosFaturaLinhas[i]){correiosFaturaLinhas[i][k]=v;if(k==='cliente'&&cfTxt(v))correiosFaturaLinhas[i].status='manual',correiosFaturaLinhas[i].fonte='Preenchimento manual';}}
function cfRelatorioHtml(){
  const total=correiosFaturaLinhas.reduce((s,x)=>s+x.valor,0),decl=correiosFaturaLinhas.reduce((s,x)=>s+x.declarado,0), pac=correiosFaturaLinhas.filter(x=>/pac/i.test(x.servico)).length,sedex=correiosFaturaLinhas.filter(x=>/sedex/i.test(x.servico)).length;
  const rows=correiosFaturaLinhas.map(x=>`<tr><td>${cfEsc(x.data)}</td><td>${cfEsc(x.cliente||'NÃO IDENTIFICADO')}</td><td>${cfEsc([x.cidade,x.uf].filter(Boolean).join('/'))}</td><td>${cfEsc(x.nf||x.pedido||'—')}</td><td>${cfEsc(x.servico)}</td><td>${cfEsc(x.rastreio)}</td><td>${cfEsc(x.cep)}</td><td>${cfEsc(x.peso)}</td><td>${cfMoeda(x.valor)}</td><td>${cfMoeda(x.declarado)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Correios - Sofisticatto</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#29264a}h1{color:#4f459c;margin:0}.sub{color:#777;margin:3px 0 15px}.kpis{display:flex;gap:8px;margin:12px 0}.k{flex:1;border:1px solid #d8d3ef;padding:8px;text-align:center;border-radius:7px}.k b{display:block;font-size:18px;color:#4f459c}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#4f459c;color:white;padding:6px}td{border-bottom:1px solid #ddd;padding:5px}tr:nth-child(even){background:#f7f6fb}.foot{margin-top:10px;font-size:9px;color:#777}@media print{button{display:none}}</style></head><body><h1>Sofisticatto Cosméticos — Relatório dos Correios</h1><div class="sub">Conferência detalhada de postagens, clientes, destinos e custos • Arquivo: ${cfEsc(correiosFaturaMeta.arquivo)}</div><div class="kpis"><div class="k"><b>${correiosFaturaLinhas.length}</b>Postagens</div><div class="k"><b>${pac}</b>PAC</div><div class="k"><b>${sedex}</b>SEDEX</div><div class="k"><b>${cfMoeda(total)}</b>Total</div><div class="k"><b>${cfMoeda(decl)}</b>Valor declarado</div></div><table><thead><tr><th>Data</th><th>Cliente</th><th>Cidade/UF</th><th>NF/Pedido</th><th>Serviço</th><th>Rastreio</th><th>CEP</th><th>Peso</th><th>Frete</th><th>Declarado</th></tr></thead><tbody>${rows}</tbody></table><div class="foot">Relatório gerado pelo Portal Sofisticatto a partir do CSV dos Correios e dos registros logísticos internos. Sugestões por CEP devem ser conferidas antes do fechamento.</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}
function imprimirRelatorioFaturaCorreios(){if(!correiosFaturaLinhas.length)return alert('Importe primeiro o CSV dos Correios.');const w=window.open('','_blank');if(!w)return alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');w.document.write(cfRelatorioHtml());w.document.close()}
function exportarRelatorioFaturaCorreiosCsv(){if(!correiosFaturaLinhas.length)return alert('Importe primeiro o CSV dos Correios.');const hs=['Data','Cliente','Cidade/UF','NF/Pedido','Serviço','Rastreio','CEP','Peso','Frete','Valor declarado','Identificação'];const ls=[hs.join(';'),...correiosFaturaLinhas.map(x=>[x.data,x.cliente,[x.cidade,x.uf].filter(Boolean).join('/'),x.nf||x.pedido,x.servico,x.rastreio,x.cep,x.peso,x.valor.toFixed(2).replace('.',','),x.declarado.toFixed(2).replace('.',','),x.fonte].map(cfCsvCell).join(';'))];const blob=new Blob(['\uFEFF'+ls.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Relatorio_Correios_Sofisticatto_Detalhado.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
