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
  const nome_pagamento=(document.getElementById('entregadorNomePagamento')?.value||'').trim();
  const banco_pagamento=(document.getElementById('entregadorBanco')?.value||'').trim();
  const chave_pix=(document.getElementById('entregadorChavePix')?.value||'').trim();
  const observacoes=document.getElementById('entregadorObs').value.trim();
  const alerta_mensal=document.getElementById('alertaMensal').checked;
  const alerta_quantidade=document.getElementById('alertaQuantidade').checked;
  const limite_quantidade=Math.max(1,Number(document.getElementById('alertaQuantidadeLimite').value||64));
  const alerta_valor=document.getElementById('alertaValor').checked;
  const limite_valor=valorNumeroCorridas(document.getElementById('alertaValorLimite').value);
  if(!nome||!categoria)return alert('Informe o nome e a categoria do entregador.');
  if(alerta_valor && limite_valor<=0)return alert('Informe o limite em reais para o alerta por valor.');
  const payload={nome,telefone:telefone||null,categoria,placa:placa||null,nome_pagamento:nome_pagamento||null,banco_pagamento:banco_pagamento||null,chave_pix:chave_pix||null,observacoes:observacoes||null,alerta_mensal,alerta_quantidade,limite_quantidade,alerta_valor,limite_valor:alerta_valor?limite_valor:null,ativo:document.getElementById('entregadorAtivo').checked};
  const r=id?await banco.from('corridas_entregadores').update(payload).eq('id',id):await banco.from('corridas_entregadores').insert([payload]);
  if(r.error)return alert('Erro ao salvar entregador: '+r.error.message);
  alert(id?'Entregador atualizado.':'Entregador cadastrado.'); limparFormEntregador(); await carregarEntregadoresCorridas(); await avaliarAlertasCorridas();
}
function editarEntregadorCorridas(id){
  const x=corridasEntregadoresCache.find(e=>String(e.id)===String(id));if(!x)return;
  document.getElementById('entregadorEditId').value=x.id;document.getElementById('entregadorNome').value=x.nome||'';document.getElementById('entregadorTelefone').value=x.telefone||'';document.getElementById('entregadorCategoria').value=x.categoria||'';document.getElementById('entregadorPlaca').value=x.placa||'';if(document.getElementById('entregadorNomePagamento'))document.getElementById('entregadorNomePagamento').value=x.nome_pagamento||'';if(document.getElementById('entregadorBanco'))document.getElementById('entregadorBanco').value=x.banco_pagamento||'';if(document.getElementById('entregadorChavePix'))document.getElementById('entregadorChavePix').value=x.chave_pix||'';document.getElementById('entregadorObs').value=x.observacoes||'';document.getElementById('entregadorAtivo').checked=x.ativo!==false;document.getElementById('alertaMensal').checked=!!x.alerta_mensal;document.getElementById('alertaQuantidade').checked=!!x.alerta_quantidade;document.getElementById('alertaQuantidadeLimite').value=x.limite_quantidade||64;document.getElementById('alertaValor').checked=!!x.alerta_valor;document.getElementById('alertaValorLimite').value=x.limite_valor||'';
  document.getElementById('btnSalvarEntregador').textContent='Atualizar entregador'; window.scrollTo({top:document.getElementById('corridasAba_entregadores').offsetTop-20,behavior:'smooth'});
}
function limparFormEntregador(){
  ['entregadorEditId','entregadorNome','entregadorTelefone','entregadorPlaca','entregadorNomePagamento','entregadorBanco','entregadorChavePix','entregadorObs','alertaValorLimite'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('entregadorCategoria').value='Moto';document.getElementById('entregadorAtivo').checked=true;document.getElementById('alertaMensal').checked=false;document.getElementById('alertaQuantidade').checked=false;document.getElementById('alertaQuantidadeLimite').value=64;document.getElementById('alertaValor').checked=false;document.getElementById('btnSalvarEntregador').textContent='Cadastrar entregador';
}
function montarTabelaEntregadores(){
  const tb=document.getElementById('tabelaEntregadoresCorridas');if(!tb)return;
  tb.innerHTML=corridasEntregadoresCache.length?corridasEntregadoresCache.map(x=>{
    const regras=[]; if(x.alerta_mensal)regras.push('📅 Mensal');if(x.alerta_quantidade)regras.push(`🔢 ${x.limite_quantidade||64} corridas`);if(x.alerta_valor)regras.push(`💰 ${fmtMoedaCorridas(x.limite_valor)}`);
    return `<tr><td><b>${escCorridas(x.nome)}</b></td><td>${escCorridas(x.categoria||'—')}</td><td>${escCorridas(x.telefone||'—')}</td><td>${escCorridas(x.placa||'—')}</td><td>${regras.join('<br>')||'Sem alertas'}</td><td>${x.ativo!==false?'<span class="corridas-status ok">Ativo</span>':'<span class="corridas-status">Inativo</span>'}</td><td><button class="btn azul" onclick="editarEntregadorCorridas('${x.id}')">Editar</button></td></tr>`;
  }).join(''):'<tr><td colspan="7">Nenhum entregador cadastrado.</td></tr>';
}


async function editarCorridaLancada(id){
  if(!usuarioPodeAdministrarCorridas()) return alert('Seu usuário não pode editar corridas.');
  const x=corridasAbertasCache.find(c=>String(c.id)===String(id));
  if(!x) return alert('Corrida não encontrada.');
  if(x.status!=='aberta'||x.fechamento_id) return alert('Somente corridas em aberto podem ser editadas. Para uma corrida já fechada, primeiro exclua o fechamento para devolvê-la às corridas em aberto.');
  const retirada=prompt('Local de retirada:',x.retirada||''); if(retirada===null)return;
  const destino=prompt('Local de destino:',x.destino||''); if(destino===null)return;
  const observacao=prompt('Observação (opcional):',x.observacao||''); if(observacao===null)return;
  const volumeTxt=prompt('Volume (opcional):',x.volume??''); if(volumeTxt===null)return;
  const tipo=prompt('Tipo de mercadoria (opcional):',x.tipo_mercadoria||''); if(tipo===null)return;
  const valorTxt=prompt('Valor da corrida:',Number(x.valor||0).toFixed(2).replace('.',',')); if(valorTxt===null)return;
  const data=prompt('Data da corrida (AAAA-MM-DD):',x.data_corrida||''); if(data===null)return;
  const valor=valorNumeroCorridas(valorTxt);
  if(!retirada.trim()||!destino.trim()||!data.trim()||valor<=0)return alert('Retirada, destino, valor e data são obrigatórios.');
  const volume=String(volumeTxt).trim()?Math.max(1,parseInt(volumeTxt,10)||1):null;
  const r=await banco.from('corridas').update({retirada:retirada.trim(),destino:destino.trim(),observacao:observacao.trim()||null,volume,tipo_mercadoria:tipo.trim()||null,valor,data_corrida:data.trim()}).eq('id',id).eq('status','aberta').is('fechamento_id',null);
  if(r.error)return alert('Erro ao editar corrida: '+r.error.message);
  alert(`${codigoCorrida(x.numero_corrida)} atualizada com sucesso.`);
  await carregarCorridas(); await avaliarAlertasCorridas(); atualizarDashboardCorridas();
}
async function excluirCorridaLancada(id){
  if(!usuarioPodeAdministrarCorridas()) return alert('Seu usuário não pode excluir corridas.');
  const x=corridasAbertasCache.find(c=>String(c.id)===String(id));
  if(!x)return alert('Corrida não encontrada.');
  if(x.status!=='aberta'||x.fechamento_id)return alert('Somente corridas em aberto podem ser excluídas. Corridas de um fechamento ficam protegidas.');
  if(!confirm(`Excluir definitivamente a ${codigoCorrida(x.numero_corrida)}?\n\nEssa ação não poderá ser desfeita.`))return;
  const r=await banco.from('corridas').delete().eq('id',id).eq('status','aberta').is('fechamento_id',null);
  if(r.error)return alert('Erro ao excluir corrida: '+r.error.message);
  alert(`${codigoCorrida(x.numero_corrida)} excluída.`);
  await carregarCorridas(); await avaliarAlertasCorridas(); atualizarDashboardCorridas();
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
  tb.innerHTML=arr.length?arr.map(x=>`<tr><td><b>${codigoCorrida(x.numero_corrida)}</b></td><td class="corridas-acoes">${usuarioPodeAdministrarCorridas()&&x.status==='aberta'&&!x.fechamento_id?`<button class="btn azul" onclick="editarCorridaLancada('${x.id}')">✏️ Editar</button> <button class="btn vermelho" onclick="excluirCorridaLancada('${x.id}')">🗑️ Excluir</button>`:'—'}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${escCorridas(x.categoria||'—')}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'—')}</td><td><b>${fmtMoedaCorridas(x.valor)}</b></td><td><span class="corridas-status ${x.status==='fechada'?'fechado':x.status==='aberta'?'ok':''}">${escCorridas(x.status)}</span></td></tr>`).join(''):'<tr><td colspan="12">Nenhuma corrida encontrada.</td></tr>';
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
  tb.innerHTML=corridasFechamentosCache.length?corridasFechamentosCache.map(x=>`<tr><td><b>${codigoFechamento(x.numero_fechamento)}</b></td><td>${fmtDataCorridas(x.data_fechamento)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${fmtDataCorridas(x.periodo_inicio)} a ${fmtDataCorridas(x.periodo_fim)}</td><td>${x.qtd_corridas||0}</td><td><b>${fmtMoedaCorridas(x.valor_total)}</b></td><td><span class="corridas-status ${x.status_pagamento==='pago'?'ok':'fechado'}">${x.status_pagamento==='pago'?'Pago':'Fechado'}</span></td><td><button class="btn azul" onclick="abrirFechamentoCorridas('${x.id}')">Ver corridas</button> <button class="btn roxo" onclick="imprimirFechamentoCorridas('${x.id}')">🖨️ Imprimir</button>${usuarioPodeAdministrarCorridas()?` <button class="btn azul" onclick="editarFechamentoCorridas('${x.id}')">✏️ Editar</button> <button class="btn vermelho" onclick="excluirFechamentoCorridas('${x.id}')">🗑️ Excluir</button>`:''}${usuarioPodeAdministrarCorridas()&&x.status_pagamento!=='pago'?` <button class="btn verde" onclick="marcarFechamentoPago('${x.id}')">Marcar pago</button>`:''}</td></tr>`).join(''):'<tr><td colspan="8">Nenhum fechamento realizado.</td></tr>';
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

async function editarFechamentoCorridas(id){
  if(!usuarioPodeAdministrarCorridas())return;
  const f=corridasFechamentosCache.find(x=>String(x.id)===String(id)); if(!f)return;
  const obs=prompt(`Editar observação do ${codigoFechamento(f.numero_fechamento)}:`,f.observacao||'');
  if(obs===null)return;
  const atual=f.status_pagamento==='pago'?'pago':'fechado';
  const sit=prompt('Situação do fechamento: digite PAGO ou FECHADO',atual.toUpperCase());
  if(sit===null)return;
  const status=String(sit).trim().toLowerCase();
  if(!['pago','fechado'].includes(status))return alert('Situação inválida. Use PAGO ou FECHADO.');
  const payload={observacao:obs.trim()||null,status_pagamento:status,pago_em:status==='pago'?(f.pago_em||new Date().toISOString()):null};
  const r=await banco.from('corridas_fechamentos').update(payload).eq('id',id);
  if(r.error)return alert('Erro ao editar fechamento: '+r.error.message);
  await carregarFechamentosCorridas();
  alert(`${codigoFechamento(f.numero_fechamento)} atualizado com sucesso.`);
}
async function excluirFechamentoCorridas(id){
  if(!usuarioPodeAdministrarCorridas())return;
  const f=corridasFechamentosCache.find(x=>String(x.id)===String(id)); if(!f)return;
  const arr=await buscarCorridasFechamento(id);
  if(!confirm(`Excluir ${codigoFechamento(f.numero_fechamento)}?

As ${arr.length} corrida(s) deste fechamento NÃO serão apagadas. Elas voltarão para Corridas em aberto e poderão entrar em um novo fechamento.`))return;
  let r=await banco.rpc('excluir_fechamento_corridas',{p_fechamento_id:id});
  if(r.error){
    // Compatibilidade caso o SQL V110 ainda não tenha sido executado.
    const reabrir=await banco.from('corridas').update({fechamento_id:null,status:'aberta'}).eq('fechamento_id',id);
    if(reabrir.error)return alert(`Erro ao reabrir as corridas: ${reabrir.error.message}\n\nExecute o SQL V110 no Supabase.`);
    r=await banco.from('corridas_fechamentos').delete().eq('id',id);
    if(r.error)return alert('Erro ao excluir fechamento: '+r.error.message);
  }
  await Promise.all([carregarCorridas(),carregarFechamentosCorridas()]);
  atualizarPreviaFechamento(); await avaliarAlertasCorridas(); atualizarDashboardCorridas();
  alert(`${codigoFechamento(f.numero_fechamento)} excluído. As corridas voltaram para a lista em aberto.`);
}
async function imprimirFechamentoCorridas(id){
  const f=corridasFechamentosCache.find(x=>String(x.id)===String(id));if(!f)return;const arr=await buscarCorridasFechamento(id);imprimirDocumentoCorridas(f,arr);
}
function imprimirFechamentoModal(){const id=document.getElementById('modalFechamentoCorridas').dataset.id;if(id)imprimirFechamentoCorridas(id);}
function imprimirDocumentoCorridas(f,arr){
  const rows=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  const ent=corridasEntregadoresCache.find(e=>String(e.id)===String(f.entregador_id))||{};
  const nomePg=ent.nome_pagamento||f.entregador_nome||'';
  const bancoPg=ent.banco_pagamento||'';
  const pixPg=ent.chave_pix||'';
  const rodapePagamento=`<div class="pagamento"><div class="pag-titulo">Dados para pagamento</div><div class="pag-grid"><div><b>NOME</b><br>${escCorridas(nomePg||'—')}</div><div><b>CHAVE PIX</b><br>${escCorridas(pixPg||'—')}</div><div><b>BANCO</b><br>${escCorridas(bancoPg||'—')}</div><div><b>DATA PREVISTA PARA PAGAMENTO</b><br><span class="linha-data">____ / ____ / ________</span></div></div></div>`;
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${codigoFechamento(f.numero_fechamento)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#222;font-size:11px}h1{margin:0;color:#5a4fa3}h2{margin:4px 0 16px;font-size:13px;font-weight:normal}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.meta div{border:1px solid #ddd;padding:8px;border-radius:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;vertical-align:top}th{background:#f1eef9}tfoot td{font-weight:bold}.pagamento{margin-top:18px;border-top:2px solid #777;padding-top:10px;page-break-inside:avoid}.pag-titulo{font-size:12px;font-weight:bold;margin-bottom:7px}.pag-grid{display:grid;grid-template-columns:1.15fr 1.5fr 1.15fr 1.4fr;gap:14px}.pag-grid>div{min-height:35px}.linha-data{display:inline-block;margin-top:8px;font-size:13px;letter-spacing:1px}.assinaturas{display:flex;gap:60px;margin-top:34px}.ass{flex:1;border-top:1px solid #444;text-align:center;padding-top:6px}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1>Sofisticatto Cosméticos</h1><h2>Fechamento detalhado de corridas — ${codigoFechamento(f.numero_fechamento)}</h2><div class="meta"><div><b>Entregador</b><br>${escCorridas(f.entregador_nome)}</div><div><b>Período</b><br>${fmtDataCorridas(f.periodo_inicio)} a ${fmtDataCorridas(f.periodo_fim)}</div><div><b>Quantidade</b><br>${f.qtd_corridas}</div><div><b>Total</b><br>${fmtMoedaCorridas(f.valor_total)}</div></div>${f.observacao?`<p><b>Observação do fechamento:</b> ${escCorridas(f.observacao)}</p>`:''}<table><thead><tr><th>Corrida</th><th>Data</th><th>Volume</th><th>Mercadoria</th><th>Retirada</th><th>Destino</th><th>Observação</th><th>Valor</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="7">TOTAL</td><td>${fmtMoedaCorridas(f.valor_total)}</td></tr></tfoot></table>${rodapePagamento}<div class="assinaturas"><div class="ass">Responsável</div><div class="ass">Entregador</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
}
async function imprimirCorridasFiltradas(){
  const vis=[...document.querySelectorAll('#tabelaCorridas tr')]; if(!vis.length)return alert('Não há corridas para imprimir.');
  const ids=[]; // usa os mesmos filtros diretamente para preservar detalhes
  const busca=(document.getElementById('filtroCorridasBusca')?.value||'').toLowerCase(),st=document.getElementById('filtroCorridasStatus')?.value||'',eid=document.getElementById('filtroCorridasEntregador')?.value||'',ini=document.getElementById('filtroCorridasInicio')?.value||'',fim=document.getElementById('filtroCorridasFim')?.value||'';
  const arr=corridasAbertasCache.filter(x=>(!busca||[x.entregador_nome,x.retirada,x.destino,x.tipo_mercadoria,codigoCorrida(x.numero_corrida)].join(' ').toLowerCase().includes(busca))&&(!st||x.status===st)&&(!eid||String(x.entregador_id)===String(eid))&&(!ini||x.data_corrida>=ini)&&(!fim||x.data_corrida<=fim));
  const total=arr.reduce((s,x)=>s+Number(x.valor||0),0); const rows=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${escCorridas(x.entregador_nome)}</td><td>${escCorridas(x.categoria||'')}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  const idsEnt=[...new Set(arr.map(x=>String(x.entregador_id||'')))].filter(Boolean);
  const ent=idsEnt.length===1?corridasEntregadoresCache.find(e=>String(e.id)===idsEnt[0]):null;
  const rodape=ent?`<div class="pagamento"><b>Dados para pagamento</b><div class="pag-grid"><div><b>NOME</b><br>${escCorridas(ent.nome_pagamento||ent.nome||'—')}</div><div><b>CHAVE PIX</b><br>${escCorridas(ent.chave_pix||'—')}</div><div><b>BANCO</b><br>${escCorridas(ent.banco_pagamento||'—')}</div><div><b>DATA PREVISTA PARA PAGAMENTO</b><br>____ / ____ / ________</div></div></div>`:'';
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Corridas</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px Arial;color:#222}h1{color:#5a4fa3;margin:0}p{margin:4px 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px}th{background:#f1eef9}thead{display:table-header-group}tr{page-break-inside:avoid}.pagamento{margin-top:18px;border-top:2px solid #777;padding-top:10px;page-break-inside:avoid}.pag-grid{display:grid;grid-template-columns:1.15fr 1.5fr 1.15fr 1.4fr;gap:14px;margin-top:7px}</style></head><body><h1>Sofisticatto Cosméticos</h1><p>Relatório detalhado de corridas — ${new Date().toLocaleString('pt-BR')}</p><table><thead><tr><th>Corrida</th><th>Data</th><th>Entregador</th><th>Categoria</th><th>Volume</th><th>Mercadoria</th><th>Retirada</th><th>Destino</th><th>Observação</th><th>Valor</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="9"><b>${arr.length} corrida(s)</b></td><td><b>${fmtMoedaCorridas(total)}</b></td></tr></tfoot></table>${rodape}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
}


function abrirImpressaoDoisEntregadores(){
  if(!usuarioPodeAdministrarCorridas())return alert('Seu usuário não pode imprimir relatórios administrativos.');
  const ativos=corridasEntregadoresCache.filter(e=>e.ativo!==false);
  if(ativos.length<2)return alert('Cadastre pelo menos dois entregadores ativos para usar esta impressão.');
  let modal=document.getElementById('modalImpressaoDoisEntregadores');
  if(!modal){
    modal=document.createElement('div');
    modal.id='modalImpressaoDoisEntregadores';
    modal.style.cssText='position:fixed;inset:0;background:rgba(28,24,46,.58);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px';
    modal.innerHTML=`<div style="width:min(620px,96vw);background:#fff;border-radius:18px;padding:24px;box-shadow:0 18px 50px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0;color:#3c326e">Imprimir dois entregadores na mesma A4</h2><p style="color:#6f6783;margin:7px 0 18px">As corridas serão separadas pelo nome do entregador e nunca serão misturadas.</p></div><button class="btn" onclick="fecharImpressaoDoisEntregadores()">Fechar</button></div>
      <div class="corridas-grid" style="grid-template-columns:1fr 1fr">
        <div class="corridas-campo"><label>1º entregador *</label><select id="impDoisEnt1"></select></div>
        <div class="corridas-campo"><label>2º entregador *</label><select id="impDoisEnt2"></select></div>
      </div>
      <div style="background:#f6f4fb;border:1px solid #e2ddf3;border-radius:10px;padding:12px;margin-top:14px;color:#574f72;font-size:13px">Serão respeitados os filtros atuais de <b>busca, status e período</b>. O filtro de entregador da tela é ignorado porque você escolherá os dois nomes aqui.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn" onclick="fecharImpressaoDoisEntregadores()">Cancelar</button><button class="buscar" onclick="imprimirDoisEntregadoresMesmaFolha()">🖨️ Verificar e imprimir</button></div>
    </div>`;
    document.body.appendChild(modal);
  }
  const opts='<option value="">Selecione...</option>'+ativos.map(e=>`<option value="${e.id}">${escCorridas(e.nome)} — ${escCorridas(e.categoria||'')}</option>`).join('');
  modal.querySelector('#impDoisEnt1').innerHTML=opts;
  modal.querySelector('#impDoisEnt2').innerHTML=opts;
  modal.style.display='flex';
}
function fecharImpressaoDoisEntregadores(){const m=document.getElementById('modalImpressaoDoisEntregadores');if(m)m.style.display='none';}
function corridasParaImpressaoDoisEntregadores(entregadorId){
  const busca=(document.getElementById('filtroCorridasBusca')?.value||'').toLowerCase();
  const st=document.getElementById('filtroCorridasStatus')?.value||'';
  const ini=document.getElementById('filtroCorridasInicio')?.value||'';
  const fim=document.getElementById('filtroCorridasFim')?.value||'';
  return corridasAbertasCache.filter(x=>String(x.entregador_id)===String(entregadorId)&&(!busca||[x.entregador_nome,x.retirada,x.destino,x.tipo_mercadoria,codigoCorrida(x.numero_corrida)].join(' ').toLowerCase().includes(busca))&&(!st||x.status===st)&&(!ini||x.data_corrida>=ini)&&(!fim||x.data_corrida<=fim));
}
function htmlBlocoEntregadorA4(ent,arr){
  const total=arr.reduce((s,x)=>s+Number(x.valor||0),0);
  const rows=arr.map(x=>`<tr><td>${codigoCorrida(x.numero_corrida)}</td><td>${fmtDataCorridas(x.data_corrida)}</td><td>${x.volume?escCorridas(x.volume):'—'}</td><td>${escCorridas(x.tipo_mercadoria||'—')}</td><td>${escCorridas(x.retirada)}</td><td>${escCorridas(x.destino)}</td><td>${escCorridas(x.observacao||'—')}</td><td>${fmtMoedaCorridas(x.valor)}</td></tr>`).join('');
  return `<section class="entregador-bloco"><div class="entregador-titulo"><div><b>${escCorridas(ent.nome)}</b> <span>(${escCorridas(ent.categoria||'—')})</span></div><div><b>${arr.length} corrida(s) • ${fmtMoedaCorridas(total)}</b></div></div><table><thead><tr><th>Corrida</th><th>Data</th><th>Vol.</th><th>Mercadoria</th><th>Retirada</th><th>Destino</th><th>Observação</th><th>Valor</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="7"><b>TOTAL — ${escCorridas(ent.nome)}</b></td><td><b>${fmtMoedaCorridas(total)}</b></td></tr></tfoot></table><div class="pagamento-compacto"><div><b>NOME:</b> ${escCorridas(ent.nome_pagamento||ent.nome||'—')}</div><div><b>CHAVE PIX:</b> ${escCorridas(ent.chave_pix||'—')}</div><div><b>BANCO:</b> ${escCorridas(ent.banco_pagamento||'—')}</div><div><b>DATA PREVISTA:</b> ____ / ____ / ________</div></div></section>`;
}
async function imprimirDoisEntregadoresMesmaFolha(){
  const id1=document.getElementById('impDoisEnt1')?.value||'',id2=document.getElementById('impDoisEnt2')?.value||'';
  if(!id1||!id2)return alert('Selecione os dois entregadores.');
  if(String(id1)===String(id2))return alert('Selecione dois entregadores diferentes.');
  const e1=corridasEntregadoresCache.find(e=>String(e.id)===String(id1)),e2=corridasEntregadoresCache.find(e=>String(e.id)===String(id2));
  if(!e1||!e2)return alert('Não foi possível localizar os entregadores selecionados.');
  const a1=corridasParaImpressaoDoisEntregadores(id1),a2=corridasParaImpressaoDoisEntregadores(id2);
  if(!a1.length||!a2.length){const sem=[];if(!a1.length)sem.push(e1.nome);if(!a2.length)sem.push(e2.nome);return alert(`Não há corridas para imprimir, com os filtros atuais, para: ${sem.join(' e ')}.`);}
  const blocos=htmlBlocoEntregadorA4(e1,a1)+htmlBlocoEntregadorA4(e2,a2);
  const css=`body{font:9px Arial;color:#222;margin:0}h1{color:#5a4fa3;margin:0;font-size:20px}.sub{margin:2px 0 8px;color:#666}.entregador-bloco{margin-top:8px;page-break-inside:avoid}.entregador-bloco+ .entregador-bloco{border-top:2px solid #5a4fa3;padding-top:8px;margin-top:10px}.entregador-titulo{display:flex;justify-content:space-between;align-items:center;background:#f1eef9;padding:5px 7px;font-size:10px}.entregador-titulo span{font-weight:normal;color:#666}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbb;padding:3px 4px;vertical-align:top;word-wrap:break-word}th{background:#faf9fd}th:nth-child(1){width:8%}th:nth-child(2){width:9%}th:nth-child(3){width:5%}th:nth-child(4){width:11%}th:nth-child(5),th:nth-child(6){width:18%}th:nth-child(7){width:20%}th:nth-child(8){width:11%}.pagamento-compacto{display:grid;grid-template-columns:1.05fr 1.45fr 1fr 1.3fr;gap:8px;border:1px solid #bbb;border-top:0;padding:5px 6px;font-size:8.5px}.pagamento-compacto>div{overflow-wrap:anywhere}`;
  // Medição conservadora usando as mesmas dimensões aproximadas da área útil de uma A4 paisagem com margens de 10 mm.
  const med=document.createElement('div');med.style.cssText='position:fixed;left:-20000px;top:0;width:1046px;background:white;visibility:hidden;';med.innerHTML=`<style>${css}</style><h1>Sofisticatto Cosméticos</h1><div class="sub">Relatório de corridas — dois entregadores</div>${blocos}`;document.body.appendChild(med);
  const altura=med.scrollHeight;med.remove();
  const limite=680; // margem de segurança para diferenças entre navegador/impressora
  if(altura>limite){
    return alert(`Não cabe com segurança em uma única folha A4.\n\n${e1.nome}: ${a1.length} corrida(s)\n${e2.nome}: ${a2.length} corrida(s)\n\nReduza o período/filtros ou imprima os entregadores separadamente.`);
  }
  fecharImpressaoDoisEntregadores();
  const w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Corridas — ${escCorridas(e1.nome)} e ${escCorridas(e2.nome)}</title><style>@page{size:A4 landscape;margin:10mm}${css}</style></head><body><h1>Sofisticatto Cosméticos</h1><div class="sub">Corridas separadas por entregador • ${new Date().toLocaleString('pt-BR')}</div>${blocos}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
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
