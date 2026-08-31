/* Sofisticatto Financeiro V108 - Corridas / Entregadores */
let corridasEntregadoresCache=[];
let corridasAbertasCache=[];
let corridasFechamentosCache=[];
let corridasGraficoAtual=null;
let corridaEntregadorSelecionado=null;

function usuarioEhEntregador(){ return usuarioLogado?.tipo === 'entregador'; }
function usuarioPodeAdministrarCorridas(){ return ['admin','financeiro'].includes(usuarioLogado?.tipo); }
function fmtMoedaCorridas(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function escCorridas(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtDataCorridas(v){ if(!v)return '—'; const s=String(v).slice(0,10).split('-'); return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:v; }
function codigoCorrida(n){ return `COR-${String(n||0).padStart(6,'0')}`; }
function codigoFechamento(n){ return `FEC-${String(n||0).padStart(6,'0')}`; }
function valorNumeroCorridas(v){ return Number(String(v??'0').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0; }
function hojeISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function carregarModuloCorridas(){
  if(!banco) return;
  const data=document.getElementById('corridaData'); if(data&&!data.value)data.value=hojeISO();
  await Promise.all([carregarEntregadoresCorridas(),carregarCorridas(),carregarFechamentosCorridas()]);
  if(usuarioPodeAdministrarCorridas()) await carregarFeriadosCorridas();
  atualizarDashboardCorridas();
}

function mostrarAbaCorridas(aba){
  const permitida=usuarioEhEntregador()?['minhas','fechamentos']:['nova','corridas','entregadores','fechamentos','feriados'];
  if(!permitida.includes(aba)) aba=usuarioEhEntregador()?'minhas':'nova';
  document.querySelectorAll('.corridas-subsecao').forEach(e=>e.style.display='none');
  document.querySelectorAll('.corridas-tab').forEach(e=>e.classList.remove('ativo'));
  const sec=document.getElementById('corridasAba_'+aba); if(sec)sec.style.display='block';
  const btn=document.getElementById('corridasTab_'+aba); if(btn)btn.classList.add('ativo');
  if(aba==='corridas'||aba==='minhas') montarTabelaCorridas();
  if(aba==='fechamentos') montarTabelaFechamentos();
  if(aba==='entregadores') montarTabelaEntregadores();
}

async function carregarEntregadoresCorridas(){
  if(usuarioEhEntregador() && !usuarioLogado?.entregador_id){ corridasEntregadoresCache=[]; return; }
  let q=banco.from('corridas_entregadores').select('*').order('nome',{ascending:true});
  if(usuarioEhEntregador()) q=q.eq('id',usuarioLogado.entregador_id);
  const r=await q;
  if(r.error){ console.warn('Corridas: execute o SQL V108.',r.error); mostrarAvisoCorridasBanco(r.error); return; }
  corridasEntregadoresCache=r.data||[];
  montarTabelaEntregadores();
  atualizarListaEntregadorCorrida();
  atualizarSelectFechamentoEntregador();
}

async function carregarCorridas(){
  if(usuarioEhEntregador() && !usuarioLogado?.entregador_id){ corridasAbertasCache=[]; montarTabelaCorridas(); montarResumoCorridas(); return; }
  let q=banco.from('corridas').select('*').order('data_corrida',{ascending:false}).order('numero_corrida',{ascending:false});
  if(usuarioEhEntregador()) q=q.eq('entregador_id',usuarioLogado.entregador_id);
  const r=await q;
  if(r.error){ console.warn('Corridas:',r.error); mostrarAvisoCorridasBanco(r.error); return; }
  corridasAbertasCache=r.data||[];
  montarTabelaCorridas();
  montarResumoCorridas();
}

async function carregarFechamentosCorridas(){
  if(usuarioEhEntregador() && !usuarioLogado?.entregador_id){ corridasFechamentosCache=[]; montarTabelaFechamentos(); return; }
  let q=banco.from('corridas_fechamentos').select('*').order('numero_fechamento',{ascending:false});
  if(usuarioEhEntregador()) q=q.eq('entregador_id',usuarioLogado.entregador_id);
  const r=await q;
  if(r.error){ console.warn('Fechamentos:',r.error); return; }
  corridasFechamentosCache=r.data||[];
  montarTabelaFechamentos();
}

function mostrarAvisoCorridasBanco(erro){
  const box=document.getElementById('corridasAvisoSQL');
  if(box){box.style.display='block';box.innerHTML='⚠️ O módulo de Corridas ainda não encontrou as tabelas no Supabase. Execute o arquivo <b>sql_v108_modulo_corridas_entregadores.sql</b> antes de usar esta área.';}
}

function atualizarListaEntregadorCorrida(){
  const box=document.getElementById('corridaSugestoes'); if(!box)return;
  const termo=(document.getElementById('corridaEntregadorBusca')?.value||'').trim().toLowerCase();
  const itens=corridasEntregadoresCache.filter(x=>x.ativo!==false && (!termo || x.nome.toLowerCase().includes(termo) || String(x.telefone||'').includes(termo))).slice(0,12);
  if(!termo){ box.style.display='none'; box.innerHTML=''; return; }
  box.innerHTML=itens.length?itens.map(x=>`<button type="button" onclick="selecionarEntregadorCorrida('${x.id}')"><b>${escCorridas(x.nome)}</b><span>${escCorridas(x.categoria||'')} · ${escCorridas(x.telefone||'')}</span></button>`).join(''):'<div class="corrida-sug-vazio">Nenhum entregador encontrado.</div>';
  box.style.display='block';
}
function selecionarEntregadorCorrida(id){
  const x=corridasEntregadoresCache.find(e=>String(e.id)===String(id)); if(!x)return;
  corridaEntregadorSelecionado=x;
  document.getElementById('corridaEntregadorBusca').value=x.nome||'';
  document.getElementById('corridaEntregadorId').value=x.id;
  document.getElementById('corridaCategoria').value=x.categoria||'';
  document.getElementById('corridaTelefone').value=x.telefone||'';
  document.getElementById('corridaSugestoes').style.display='none';
}
function limparEntregadorSelecionadoSeDigitou(){
  const nome=document.getElementById('corridaEntregadorBusca')?.value||'';
  if(corridaEntregadorSelecionado && nome!==corridaEntregadorSelecionado.nome){
    corridaEntregadorSelecionado=null; document.getElementById('corridaEntregadorId').value=''; document.getElementById('corridaCategoria').value='';document.getElementById('corridaTelefone').value='';
  }
  atualizarListaEntregadorCorrida();
}

async function lancarCorrida(){
  if(!usuarioPodeAdministrarCorridas()) return alert('Seu usuário não pode lançar corridas.');
  const entregador_id=document.getElementById('corridaEntregadorId').value;
  const ent=corridasEntregadoresCache.find(x=>String(x.id)===String(entregador_id));
  const retirada=document.getElementById('corridaRetirada').value.trim();
  const destino=document.getElementById('corridaDestino').value.trim();
  const volumeRaw=(document.getElementById('corridaVolume')?.value||'').trim();
  const volume=volumeRaw?Math.max(1,parseInt(volumeRaw,10)||1):null;
  const tipo_mercadoria=(document.getElementById('corridaTipoMercadoria')?.value||'').trim();
  const observacao=document.getElementById('corridaObservacao').value.trim();
  const valor=valorNumeroCorridas(document.getElementById('corridaValor').value);
  const data_corrida=document.getElementById('corridaData').value;
  if(!ent)return alert('Selecione um entregador na lista inteligente.');
  if(!retirada||!destino||!data_corrida||valor<=0)return alert('Preencha retirada, destino, valor e data da corrida.');
  const r=await banco.from('corridas').insert([{entregador_id:ent.id,entregador_nome:ent.nome,categoria:ent.categoria||null,telefone:ent.telefone||null,retirada,destino,volume,tipo_mercadoria:tipo_mercadoria||null,observacao:observacao||null,valor,data_corrida,status:'aberta',criado_por:usuarioLogado?.login||null}]).select('numero_corrida').single();
  if(r.error)return alert('Erro ao lançar corrida: '+r.error.message);
  alert(`Corrida ${codigoCorrida(r.data.numero_corrida)} lançada com sucesso.`);
  ['corridaRetirada','corridaDestino','corridaVolume','corridaTipoMercadoria','corridaObservacao','corridaValor'].forEach(id=>document.getElementById(id).value='');
  await carregarCorridas(); await avaliarAlertasCorridas(); atualizarDashboardCorridas();
}

async function salvarEntregadorCorridas(){
  if(!usuarioPodeAdministrarCorridas())return;
  const id=document.getElementById('entregadorEditId').value;
  const nome=document.getElementById('entregadorNome').value.trim();
  const telefone=document.getElementById('entregadorTelefone').value.trim();
  const categoria=document.getElementById('entregadorCategoria').value;
  const placa=document.getElementById('entregadorPlaca').value.trim();
  const observacoes=document.getElementById('entregadorObs').value.trim();
  const alerta_mensal=document.getElementById('alertaMensal').checked;
  const alerta_quantidade=document.getElementById('alertaQuantidade').checked;
  const limite_quantidade=Math.max(1,Number(document.getElementById('alertaQuantidadeLimite').value||64));
  const alerta_valor=document.getElementById('alertaValor').checked;
  const limite_valor=valorNumeroCorridas(document.getElementById('alertaValorLimite').value);
  if(!nome||!categoria)return alert('Informe o nome e a categoria do entregador.');
  if(alerta_valor && limite_valor<=0)return alert('Informe o limite em reais para o alerta por valor.');
  const payload={nome,telefone:telefone||null,categoria,placa:placa||null,observacoes:observacoes||null,alerta_mensal,alerta_quantidade,limite_quantidade,alerta_valor,limite_valor:alerta_valor?limite_valor:null,ativo:document.getElementById('entregadorAtivo').checked};
  const r=id?await banco.from('corridas_entregadores').update(payload).eq('id',id):await banco.from('corridas_entregadores').insert([payload]);
  if(r.error)return alert('Erro ao salvar entregador: '+r.error.message);
  alert(id?'Entregador atualizado.':'Entregador cadastrado.'); limparFormEntregador(); await carregarEntregadoresCorridas(); await avaliarAlertasCorridas();
}
function editarEntregadorCorridas(id){
  const x=corridasEntregadoresCache.find(e=>String(e.id)===String(id));if(!x)return;
  document.getElementById('entregadorEditId').value=x.id;document.getElementById('entregadorNome').value=x.nome||'';document.getElementById('entregadorTelefone').value=x.telefone||'';document.getElementById('entregadorCategoria').value=x.categoria||'';document.getElementById('entregadorPlaca').value=x.placa||'';document.getElementById('entregadorObs').value=x.observacoes||'';document.getElementById('entregadorAtivo').checked=x.ativo!==false;document.getElementById('alertaMensal').checked=!!x.alerta_mensal;document.getElementById('alertaQuantidade').checked=!!x.alerta_quantidade;document.getElementById('alertaQuantidadeLimite').value=x.limite_quantidade||64;document.getElementById('alertaValor').checked=!!x.alerta_valor;document.getElementById('alertaValorLimite').value=x.limite_valor||'';
  document.getElementById('btnSalvarEntregador').textContent='Atualizar entregador'; window.scrollTo({top:document.getElementById('corridasAba_entregadores').offsetTop-20,behavior:'smooth'});
}
function limparFormEntregador(){
  ['entregadorEditId','entregadorNome','entregadorTelefone','entregadorPlaca','entregadorObs','alertaValorLimite'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('entregadorCategoria').value='Moto';document.getElementById('entregadorAtivo').checked=true;document.getElementById('alertaMensal').checked=false;document.getElementById('alertaQuantidade').checked=false;document.getElementById('alertaQuantidadeLimite').value=64;document.getElementById('alertaValor').checked=false;document.getElementById('btnSalvarEntregador').textContent='Cadastrar entregador';
}
function montarTabelaEntregadores(){
  const tb=document.getElementById('tabelaEntregadoresCorridas');if(!tb)return;
  tb.innerHTML=corridasEntregadoresCache.length?corridasEntregadoresCache.map(x=>{
    const regras=[]; if(x.alerta_mensal)regras.push('📅 Mensal');if(x.alerta_quantidade)regras.push(`🔢 ${x.limite_quantidade||64} corridas`);if(x.alerta_valor)regras.push(`💰 ${fmtMoedaCorridas(x.limite_valor)}`);
    return `<tr><td><b>${escCorridas(x.nome)}</b></td><td>${escCorridas(x.categoria||'—')}</td><td>${escCorridas(x.telefone||'—')}</td><td>${escCorridas(x.placa||'—')}</td><td>${regras.join('<br>')||'Sem alertas'}</td><td>${x.ativo!==false?'<span class="corridas-status ok">Ativo</span>':'<span class="corridas-status">Inativo</span>'}</td><td><button class="btn azul" onclick="editarEntregadorCorridas('${x.id}')">Editar</button></td></tr>`;
  }).join(''):'<tr><td colspan="7">Nenhum entregador cadastrado.</td></tr>';
}

function montarResumoCorridas(){
  const base=usuarioEhEntregador()?corridasAbertasCache:corridasAbertasCache;
  const abertas=base.filter(x=>x.status==='aberta'&&!x.fechamento_id);
  const total=abertas.reduce((s,x)=>s+Number(x.valor||0),0);
  const q=document.getElementById('corridasQtdAberto');if(q)q.textContent=abertas.length;
  const v=document.getElementById('corridasValorAberto');if(v)v.textContent=fmtMoedaCorridas(total);
}
function montarTabelaCorridas(){
  const tb=document.getElementById('tabelaCorridas');if(!tb)return;
  const busca=(document.getElementById('filtroCorridasBusca')?.value||'').toLowerCase();
  const st=document.getElementById('filtroCorridasStatus')?.value||'';
  const eid=document.getElementById('filtroCorridasEntregador')?.value||'';
  const ini=document.getElementById('filtroCorridasInicio')?.value||''; const fim=document.getElementById('filtroCorridasFim')?.value||'';
  const arr=corridasAbertasCache.filter(x=>(!busca||[x.entregador_nome,x.retirada,x.destino,x.tipo_mercadoria,codigoCorrida(x.numero_corrida)].join(' ').toLowerCase().includes(busca))&&(!st||x.status===st)&&(!eid||String(x.entregador_id)===String(eid))&&(!ini||x.data_corrida>=ini)&&(!fim||x.data_corrida<=fim));
  tb.innerHTML=arr.length?arr.map(x=>`<tr><td><b>${codigoCorrida(x.numero_corrida)}</b></td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${escCorridas(x.categoria||'—')}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'—')}</td><td><b>${fmtMoedaCorridas(x.valor)}</b></td><td><span class="corridas-status ${x.status==='fechada'?'fechado':x.status==='aberta'?'ok':''}">${escCorridas(x.status)}</span></td></tr>`).join(''):'<tr><td colspan="11">Nenhuma corrida encontrada.</td></tr>';
  const tbd=document.getElementById('tabelaCorridasDriver');
  if(tbd){
    const arrDriver=corridasAbertasCache;
    tbd.innerHTML=arrDriver.length?arrDriver.map(x=>`<tr><td><b>${codigoCorrida(x.numero_corrida)}</b></td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.categoria||'—')}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'—')}</td><td><b>${fmtMoedaCorridas(x.valor)}</b></td><td><span class="corridas-status ${x.status==='fechada'?'fechado':x.status==='aberta'?'ok':''}">${escCorridas(x.status)}</span></td></tr>`).join(''):'<tr><td colspan="10">Nenhuma corrida encontrada.</td></tr>';
  }
}
function atualizarSelectFechamentoEntregador(){
  ['fechamentoEntregador','filtroCorridasEntregador'].forEach(id=>{const s=document.getElementById(id);if(!s)return;const atual=s.value;s.innerHTML=`<option value="">${id==='fechamentoEntregador'?'Selecione o entregador':'Todos os entregadores'}</option>`+corridasEntregadoresCache.map(x=>`<option value="${x.id}">${escCorridas(x.nome)}</option>`).join('');s.value=atual;});
}
function atualizarPreviaFechamento(){
  const id=document.getElementById('fechamentoEntregador').value;
  const ini=document.getElementById('fechamentoInicio').value;const fim=document.getElementById('fechamentoFim').value;
  const arr=corridasAbertasCache.filter(x=>x.status==='aberta'&&!x.fechamento_id&&String(x.entregador_id)===String(id)&&(!ini||x.data_corrida>=ini)&&(!fim||x.data_corrida<=fim));
  const tb=document.getElementById('tabelaPreviaFechamento');
  tb.innerHTML=arr.length?arr.map(x=>`<tr><td><input type="checkbox" class="checkCorridaFechar" value="${x.id}" checked onchange="recalcularPreviaFechamento()"></td><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join(''):'<tr><td colspan="6">Nenhuma corrida aberta neste filtro.</td></tr>';
  recalcularPreviaFechamento();
}
function recalcularPreviaFechamento(){
  const ids=[...document.querySelectorAll('.checkCorridaFechar:checked')].map(x=>x.value);
  const arr=corridasAbertasCache.filter(x=>ids.includes(String(x.id)));
  const q=document.getElementById('fechamentoQtd');if(q)q.textContent=arr.length;
  const v=document.getElementById('fechamentoValor');if(v)v.textContent=fmtMoedaCorridas(arr.reduce((s,x)=>s+Number(x.valor||0),0));
}
async function fecharCorridasSelecionadas(){
  if(!usuarioPodeAdministrarCorridas())return;
  const entregador_id=document.getElementById('fechamentoEntregador').value;
  const ids=[...document.querySelectorAll('.checkCorridaFechar:checked')].map(x=>x.value);
  const obs=document.getElementById('fechamentoObs').value.trim();
  if(!entregador_id||!ids.length)return alert('Selecione o entregador e ao menos uma corrida.');
  if(!confirm(`Fechar ${ids.length} corrida(s)?\n\nOs alertas não bloqueiam lançamentos e as corridas ficarão disponíveis no Histórico de Fechamentos.`))return;
  const r=await banco.rpc('fechar_corridas_entregador',{p_entregador_id:entregador_id,p_corridas:ids,p_usuario:usuarioLogado?.login||null,p_observacao:obs||null});
  if(r.error)return alert('Erro ao fechar corridas: '+r.error.message);
  const n=Array.isArray(r.data)?r.data[0]?.numero_fechamento:r.data?.numero_fechamento;
  alert(`Fechamento ${codigoFechamento(n)} realizado com sucesso.`);
  document.getElementById('fechamentoObs').value=''; await Promise.all([carregarCorridas(),carregarFechamentosCorridas()]); atualizarPreviaFechamento(); await avaliarAlertasCorridas(); atualizarDashboardCorridas();
}
function montarTabelaFechamentos(){
  const tb=document.getElementById('tabelaFechamentosCorridas');if(!tb)return;
  tb.innerHTML=corridasFechamentosCache.length?corridasFechamentosCache.map(x=>`<tr><td><b>${codigoFechamento(x.numero_fechamento)}</b></td><td>${fmtDataCorridas(x.data_fechamento)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${fmtDataCorridas(x.periodo_inicio)} a ${fmtDataCorridas(x.periodo_fim)}</td><td>${x.qtd_corridas||0}</td><td><b>${fmtMoedaCorridas(x.valor_total)}</b></td><td><span class="corridas-status ${x.status_pagamento==='pago'?'ok':'fechado'}">${x.status_pagamento==='pago'?'Pago':'Fechado'}</span></td><td><button class="btn azul" onclick="abrirFechamentoCorridas('${x.id}')">Ver corridas</button> <button class="btn roxo" onclick="imprimirFechamentoCorridas('${x.id}')">🖨️ Imprimir</button>${usuarioPodeAdministrarCorridas()&&x.status_pagamento!=='pago'?` <button class="btn verde" onclick="marcarFechamentoPago('${x.id}')">Marcar pago</button>`:''}</td></tr>`).join(''):'<tr><td colspan="8">Nenhum fechamento realizado.</td></tr>';
}
async function buscarCorridasFechamento(id){
  const r=await banco.from('corridas').select('*').eq('fechamento_id',id).order('data_corrida',{ascending:true}).order('numero_corrida',{ascending:true});
  if(r.error)throw new Error(r.error.message); return r.data||[];
}
async function abrirFechamentoCorridas(id){
  const f=corridasFechamentosCache.find(x=>String(x.id)===String(id)); if(!f)return;
  const arr=await buscarCorridasFechamento(id);
  document.getElementById('modalFechamentoTitulo').textContent=`${codigoFechamento(f.numero_fechamento)} — ${f.entregador_nome}`;
  document.getElementById('modalFechamentoResumo').innerHTML=`<b>Período:</b> ${fmtDataCorridas(f.periodo_inicio)} a ${fmtDataCorridas(f.periodo_fim)} &nbsp; <b>Corridas:</b> ${f.qtd_corridas} &nbsp; <b>Total:</b> ${fmtMoedaCorridas(f.valor_total)}${f.observacao?`<br><b>Observação:</b> ${escCorridas(f.observacao)}`:''}`;
  document.getElementById('modalFechamentoTabela').innerHTML=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'—')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  const m=document.getElementById('modalFechamentoCorridas');m.dataset.id=id;m.style.display='flex';
}
function fecharModalFechamentoCorridas(){document.getElementById('modalFechamentoCorridas').style.display='none';}
async function marcarFechamentoPago(id){
  if(!confirm('Marcar este fechamento como pago?'))return;
  const r=await banco.from('corridas_fechamentos').update({status_pagamento:'pago',pago_em:new Date().toISOString()}).eq('id',id);if(r.error)return alert(r.error.message);await carregarFechamentosCorridas();
}
async function imprimirFechamentoCorridas(id){
  const f=corridasFechamentosCache.find(x=>String(x.id)===String(id));if(!f)return;const arr=await buscarCorridasFechamento(id);imprimirDocumentoCorridas(f,arr);
}
function imprimirFechamentoModal(){const id=document.getElementById('modalFechamentoCorridas').dataset.id;if(id)imprimirFechamentoCorridas(id);}
function imprimirDocumentoCorridas(f,arr){
  const rows=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${codigoFechamento(f.numero_fechamento)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#222;font-size:11px}h1{margin:0;color:#5a4fa3}h2{margin:4px 0 16px;font-size:13px;font-weight:normal}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.meta div{border:1px solid #ddd;padding:8px;border-radius:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;vertical-align:top}th{background:#f1eef9}tfoot td{font-weight:bold}.assinaturas{display:flex;gap:60px;margin-top:35px}.ass{flex:1;border-top:1px solid #444;text-align:center;padding-top:6px}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1>Sofisticatto Cosméticos</h1><h2>Fechamento detalhado de corridas — ${codigoFechamento(f.numero_fechamento)}</h2><div class="meta"><div><b>Entregador</b><br>${escCorridas(f.entregador_nome)}</div><div><b>Período</b><br>${fmtDataCorridas(f.periodo_inicio)} a ${fmtDataCorridas(f.periodo_fim)}</div><div><b>Quantidade</b><br>${f.qtd_corridas}</div><div><b>Total</b><br>${fmtMoedaCorridas(f.valor_total)}</div></div>${f.observacao?`<p><b>Observação do fechamento:</b> ${escCorridas(f.observacao)}</p>`:''}<table><thead><tr><th>Corrida</th><th>Data</th><th>Volume</th><th>Mercadoria</th><th>Retirada</th><th>Destino</th><th>Observação</th><th>Valor</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="7">TOTAL</td><td>${fmtMoedaCorridas(f.valor_total)}</td></tr></tfoot></table><div class="assinaturas"><div class="ass">Responsável</div><div class="ass">Entregador</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
}
async function imprimirCorridasFiltradas(){
  const vis=[...document.querySelectorAll('#tabelaCorridas tr')]; if(!vis.length)return alert('Não há corridas para imprimir.');
  const ids=[]; // usa os mesmos filtros diretamente para preservar detalhes
  const busca=(document.getElementById('filtroCorridasBusca')?.value||'').toLowerCase(),st=document.getElementById('filtroCorridasStatus')?.value||'',eid=document.getElementById('filtroCorridasEntregador')?.value||'',ini=document.getElementById('filtroCorridasInicio')?.value||'',fim=document.getElementById('filtroCorridasFim')?.value||'';
  const arr=corridasAbertasCache.filter(x=>(!busca||[x.entregador_nome,x.retirada,x.destino,x.tipo_mercadoria,codigoCorrida(x.numero_corrida)].join(' ').toLowerCase().includes(busca))&&(!st||x.status===st)&&(!eid||String(x.entregador_id)===String(eid))&&(!ini||x.data_corrida>=ini)&&(!fim||x.data_corrida<=fim));
  const total=arr.reduce((s,x)=>s+Number(x.valor||0),0); const rows=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${escCorridas(x.categoria||'')}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Corridas</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px Arial;color:#222}h1{color:#5a4fa3;margin:0}p{margin:4px 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px}th{background:#f1eef9}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1>Sofisticatto Cosméticos</h1><p>Relatório detalhado de corridas — ${new Date().toLocaleString('pt-BR')}</p><table><thead><tr><th>Corrida</th><th>Data</th><th>Entregador</th><th>Categoria</th><th>Volume</th><th>Mercadoria</th><th>Retirada</th><th>Destino</th><th>Observação</th><th>Valor</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="9"><b>${arr.length} corrida(s)</b></td><td><b>${fmtMoedaCorridas(total)}</b></td></tr></tfoot></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
}

let feriadosCorridasCache=[];
async function carregarFeriadosCorridas(){const r=await banco.from('corridas_feriados').select('*').order('data',{ascending:true});if(!r.error){feriadosCorridasCache=r.data||[];montarFeriadosCorridas();}}
async function adicionarFeriadoCorridas(){const data=document.getElementById('feriadoCorridasData').value,nome=document.getElementById('feriadoCorridasNome').value.trim();if(!data||!nome)return alert('Informe a data e o nome do feriado.');const r=await banco.from('corridas_feriados').upsert([{data,nome}],{onConflict:'data'});if(r.error)return alert(r.error.message);document.getElementById('feriadoCorridasNome').value='';await carregarFeriadosCorridas();await avaliarAlertasCorridas();}
async function excluirFeriadoCorridas(id){if(!confirm('Excluir este feriado?'))return;await banco.from('corridas_feriados').delete().eq('id',id);await carregarFeriadosCorridas();}
function montarFeriadosCorridas(){const tb=document.getElementById('tabelaFeriadosCorridas');if(!tb)return;tb.innerHTML=feriadosCorridasCache.map(x=>`<tr><td>${fmtDataCorridas(x.data)}</td><td>${escCorridas(x.nome)}</td><td><button class="btn vermelho" onclick="excluirFeriadoCorridas('${x.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="3">Nenhum feriado adicional cadastrado.</td></tr>';}
function ehFeriadoNacionalFixo(d){const md=`${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].includes(md);}
function ehDiaUtilCorridas(d){const wd=d.getDay();if(wd===0||wd===6)return false;if(ehFeriadoNacionalFixo(d))return false;const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return !feriadosCorridasCache.some(x=>String(x.data).slice(0,10)===iso);}
function dataAlertaMensalCorridas(ref=new Date()){let d=new Date(ref.getFullYear(),ref.getMonth(),3,12);while(!ehDiaUtilCorridas(d))d.setDate(d.getDate()+1);return d;}
async function avaliarAlertasCorridas(){
  if(!usuarioPodeAdministrarCorridas())return [];
  const ab=corridasAbertasCache.filter(x=>x.status==='aberta'&&!x.fechamento_id);const hoje=new Date();hoje.setHours(12,0,0,0);const devido=dataAlertaMensalCorridas(hoje);const primeiroMes=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
  const alertas=[];
  for(const e of corridasEntregadoresCache.filter(x=>x.ativo!==false)){
    const a=ab.filter(x=>String(x.entregador_id)===String(e.id));const qtd=a.length,total=a.reduce((s,x)=>s+Number(x.valor||0),0);
    if(e.alerta_quantidade && qtd>=Number(e.limite_quantidade||64)) alertas.push({tipo:'quantidade',entregador:e,texto:`${qtd} corridas abertas — limite ${e.limite_quantidade||64} atingido.`});
    if(e.alerta_valor && total>=Number(e.limite_valor||0)) alertas.push({tipo:'valor',entregador:e,texto:`${fmtMoedaCorridas(total)} em aberto — limite ${fmtMoedaCorridas(e.limite_valor)} atingido.`});
    if(e.alerta_mensal && hoje>=devido){const fechouMes=corridasFechamentosCache.some(f=>String(f.entregador_id)===String(e.id)&&String(f.data_fechamento).slice(0,10)>=primeiroMes);if(!fechouMes)alertas.push({tipo:'mensal',entregador:e,texto:`Fechamento mensal previsto para ${fmtDataCorridas(`${devido.getFullYear()}-${String(devido.getMonth()+1).padStart(2,'0')}-${String(devido.getDate()).padStart(2,'0')}`)}.`});}
  }
  renderAlertasCorridas(alertas); return alertas;
}
function renderAlertasCorridas(alertas){
  ['corridasAlertas','dashboardAlertasCorridas'].forEach(id=>{const box=document.getElementById(id);if(!box)return;box.innerHTML=alertas.length?alertas.map(a=>`<div class="corrida-alerta ${a.tipo}"><b>${a.tipo==='mensal'?'📅':a.tipo==='quantidade'?'🔢':'💰'} ${escCorridas(a.entregador.nome)}</b><span>${escCorridas(a.texto)}</span><small>Somente alerta — não bloqueia novos lançamentos.</small></div>`).join(''):'<div class="corrida-alerta-ok">✅ Nenhum fechamento exige atenção agora.</div>';});
  const badge=document.getElementById('badgeCorridasAlertas');if(badge){badge.textContent=alertas.length;badge.style.display=alertas.length?'inline-flex':'none';}
}
function atualizarDashboardCorridas(){
  if(usuarioEhEntregador())return;
  const agora=new Date(),ym=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
  const mes=corridasAbertasCache.filter(x=>String(x.data_corrida||'').startsWith(ym)&&x.status!=='cancelada');
  const total=mes.reduce((s,x)=>s+Number(x.valor||0),0);const aberto=corridasAbertasCache.filter(x=>x.status==='aberta'&&!x.fechamento_id).reduce((s,x)=>s+Number(x.valor||0),0);
  const elq=document.getElementById('dashCorridasMes');if(elq)elq.textContent=mes.length;const elv=document.getElementById('dashCorridasValor');if(elv)elv.textContent=fmtMoedaCorridas(total);const ela=document.getElementById('dashCorridasAberto');if(ela)ela.textContent=fmtMoedaCorridas(aberto);
  const grupos={};mes.forEach(x=>grupos[x.categoria||'Sem categoria']=(grupos[x.categoria||'Sem categoria']||0)+1);const entries=Object.entries(grupos);
  const pie=document.getElementById('corridasPizza');const leg=document.getElementById('corridasPizzaLegenda');if(pie&&leg){
    const cores=['#5a4fa3','#8c7bd6','#bdaddf','#6f63ae','#d9d0ee','#463b8a','#a698d5'];let acc=0;const tot=Math.max(1,mes.length);const partes=entries.map(([k,v],i)=>{const a=acc/tot*360;acc+=v;const b=acc/tot*360;return `${cores[i%cores.length]} ${a}deg ${b}deg`;});pie.style.background=entries.length?`conic-gradient(${partes.join(',')})`:'#ece9f4';leg.innerHTML=entries.map(([k,v],i)=>`<span><i style="background:${cores[i%cores.length]}"></i>${escCorridas(k)}: <b>${v}</b></span>`).join('')||'<span>Sem corridas no mês.</span>';
  }
  avaliarAlertasCorridas();
}

// Integração com cadastro de usuários
async function carregarEntregadoresParaUsuario(){
  const s=document.getElementById('novoUsuarioEntregador');if(!s||!banco)return;const r=await banco.from('corridas_entregadores').select('id,nome,categoria').eq('ativo',true).order('nome');if(r.error)return;s.innerHTML='<option value="">Entregador vinculado (somente perfil entregador)</option>'+(r.data||[]).map(x=>`<option value="${x.id}">${escCorridas(x.nome)} — ${escCorridas(x.categoria||'')}</option>`).join('');
}
function atualizarCamposUsuarioEntregador(){const tipo=document.getElementById('novoTipo')?.value;const s=document.getElementById('novoUsuarioEntregador');if(s)s.style.display=tipo==='entregador'?'block':'none';}

window.addEventListener('click',e=>{const box=document.getElementById('corridaSugestoes'),inp=document.getElementById('corridaEntregadorBusca');if(box&&inp&&!box.contains(e.target)&&e.target!==inp)box.style.display='none';});
