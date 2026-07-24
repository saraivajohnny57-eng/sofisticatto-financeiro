
/* =========================================================
   PAINEL LOGÍSTICO V11
   ========================================================= */
let logisticaDados={fila:[],pendencias:[],respostas:[]};

async function logisticaConsultaSegura(tabela,select="*",configurador=null){
  try{
    let q=banco.from(tabela).select(select);
    if(typeof configurador==="function") q=configurador(q);
    const r=await q;
    if(r.error) throw r.error;
    return r.data || [];
  }catch(e){
    console.warn(`Painel logístico: ${tabela}`,e?.message || e);
    return [];
  }
}

function logisticaTempo(data){
  if(!data)return "";
  const min=Math.max(0,Math.floor((Date.now()-new Date(data).getTime())/60000));
  if(min<60)return `${min} min`;
  if(min<1440)return `${Math.floor(min/60)}h`;
  return `${Math.floor(min/1440)} dia(s)`;
}

async function carregarPainelLogistico(){
  if(typeof bancoPronto==="function" && !bancoPronto())return;

  const hoje=new Date();
  hoje.setHours(0,0,0,0);

  const [cotacoes,boletos,envios,correios,pendencias,respostas]=await Promise.all([
    logisticaConsultaSegura("frete_cotacoes","id,numero,cliente_nome,status,prioridade,created_at,atualizado_em,total_solicitacoes",q=>q.not("status","in",'("autorizada","cancelada")').order("atualizado_em",{ascending:true})),
    logisticaConsultaSegura("boletos","*",q=>q.order("id",{ascending:true})),
    logisticaConsultaSegura("email_envios","id,cliente_nome,status,created_at",q=>q.in("status",["pendente","erro"]).order("created_at",{ascending:true})),
    logisticaConsultaSegura("correios_envios","id,cliente_nome,servico,created_at",q=>q.gte("created_at",hoje.toISOString())),
    logisticaConsultaSegura("painel_logistico_pendencias","*",q=>q.neq("status","concluida").order("prioridade",{ascending:false}).order("created_at",{ascending:true})),
    logisticaConsultaSegura("frete_cotacao_respostas","valor_frete,prazo,status,transportadora_id,frete_transportadoras(nome)")
  ]);

  const boletosAbertos = (boletos || []).filter(item =>
    String(item.status || "").trim().toLowerCase() !== "finalizado"
  );

  logisticaDados.pendencias=pendencias;
  logisticaDados.respostas=respostas;
  logisticaDados.fila=[];

  cotacoes.forEach(c=>{
    const status=c.status||"aguardando_retorno";
    logisticaDados.fila.push({
      tipo:"cotacao",icone:"🚛",prioridade:c.prioridade||"normal",
      titulo:`Cotação ${c.numero||""} — ${c.cliente_nome||"Cliente"}`,
      descricao:status.replaceAll("_"," "),
      tempo:logisticaTempo(c.atualizado_em||c.created_at),
      acao:`abrirCotacaoFrete('${c.id}');mostrarAbaEmail('cotacoes')`
    });
  });

  boletosAbertos.forEach(b=>logisticaDados.fila.push({
    tipo:"boleto",icone:"📄",prioridade:"normal",
    titulo:b.nome||"Boleto em aberto",
    descricao:`Valor: ${typeof moedaFrete==="function"?moedaFrete(b.valor||0):b.valor||""}`,
    tempo:logisticaTempo(b.created_at || b.data || b.data_criacao),acao:"mostrarSecao('relatorios')"
  }));

  envios.forEach(e=>logisticaDados.fila.push({
    tipo:"email",icone:"📧",prioridade:e.status==="erro"?"urgente":"normal",
    titulo:e.cliente_nome||"Envio de e-mail",
    descricao:e.status==="erro"?"Falha no envio":"Aguardando envio",
    tempo:logisticaTempo(e.created_at),acao:"mostrarAbaEmail('historico')"
  }));

  pendencias.forEach(p=>logisticaDados.fila.push({
    tipo:"manual",icone:"📌",prioridade:p.prioridade||"normal",
    titulo:p.titulo,descricao:[p.cliente,p.observacao].filter(Boolean).join(" — "),
    tempo:logisticaTempo(p.created_at),acao:`editarPendenciaLogistica('${p.id}')`
  }));

  const aguardando=cotacoes.filter(c=>["rascunho","solicitacao_enviada","aguardando_retorno"].includes(c.status)).length;
  const parcial=cotacoes.filter(c=>c.status==="retorno_parcial").length;
  document.getElementById("logisticaKpis").innerHTML=`
    <div class="logistica-kpi"><span>Cotações aguardando</span><b>${aguardando}</b></div>
    <div class="logistica-kpi"><span>Retorno parcial</span><b>${parcial}</b></div>
    <div class="logistica-kpi"><span>Boletos em aberto</span><b>${boletosAbertos.length}</b></div>
    <div class="logistica-kpi"><span>E-mails pendentes</span><b>${envios.length}</b></div>
    <div class="logistica-kpi"><span>Correios hoje</span><b>${correios.length}</b></div>
    <div class="logistica-kpi"><span>Pendências manuais</span><b>${pendencias.length}</b></div>`;

  montarFilaLogistica();
  montarRankingTransportadorasLogistica();
  montarPendenciasLogistica();
}

function montarFilaLogistica(){
  const box=document.getElementById("logisticaFila");if(!box)return;
  const filtro=document.getElementById("logisticaFiltroStatus")?.value||"";
  let lista=logisticaDados.fila;
  if(filtro==="urgente")lista=lista.filter(i=>["urgente","muito_urgente"].includes(i.prioridade));
  else if(filtro)lista=lista.filter(i=>i.tipo===filtro);

  box.innerHTML=lista.length?lista.slice(0,40).map(i=>`
    <div class="logistica-item ${i.prioridade}">
      <span class="logistica-icone">${i.icone}</span>
      <div><h3>${escaparHtmlEmail(i.titulo||"")}</h3><p>${escaparHtmlEmail(i.descricao||"")}</p><small>Em espera: ${i.tempo||"agora"}</small></div>
      <button class="btn azul" onclick="${i.acao}">Abrir</button>
    </div>`).join(""):'<div class="texto-vazio">Nenhum item nessa fila.</div>';
}

function montarRankingTransportadorasLogistica(){
  const box=document.getElementById("logisticaTransportadoras");if(!box)return;
  const mapa=new Map();
  logisticaDados.respostas.forEach(r=>{
    const nome=r.frete_transportadoras?.nome||"Sem transportadora";
    const atual=mapa.get(nome)||{nome,qtd:0,soma:0,autorizadas:0};
    if(Number(r.valor_frete)>0){atual.qtd++;atual.soma+=Number(r.valor_frete)}
    if(r.status==="autorizada")atual.autorizadas++;
    mapa.set(nome,atual);
  });
  const lista=[...mapa.values()].sort((a,b)=>b.autorizadas-a.autorizadas||b.qtd-a.qtd).slice(0,8);
  box.innerHTML=lista.length?lista.map((x,i)=>`
    <div class="logistica-rank-item">
      <span class="logistica-posicao">${i+1}</span>
      <div><b>${escaparHtmlEmail(x.nome)}</b><small>${x.qtd} resposta(s) • ${x.autorizadas} autorizada(s)</small></div>
      <strong>${x.qtd?moedaFrete(x.soma/x.qtd):"—"}</strong>
    </div>`).join(""):'<div class="texto-vazio">Ainda não há respostas de transportadoras.</div>';
}

function montarPendenciasLogistica(){
  const tbody=document.getElementById("logisticaTabelaPendencias");if(!tbody)return;
  tbody.innerHTML=logisticaDados.pendencias.length?logisticaDados.pendencias.map(p=>`
    <tr>
      <td>${p.prioridade==="muito_urgente"?"🔴 Muito urgente":p.prioridade==="urgente"?"🟠 Urgente":"Normal"}</td>
      <td>${escaparHtmlEmail(p.titulo||"")}</td>
      <td>${escaparHtmlEmail(p.cliente||"")}</td>
      <td>${escaparHtmlEmail(p.responsavel||"")}</td>
      <td>${p.lembrete_em?new Date(p.lembrete_em).toLocaleString("pt-BR"):"—"}</td>
      <td>${escaparHtmlEmail(p.status||"aberta")}</td>
      <td><button class="btn azul" onclick="editarPendenciaLogistica('${p.id}')">Editar</button><button class="btn verde" onclick="concluirPendenciaLogistica('${p.id}')">Concluir</button></td>
    </tr>`).join(""):'<tr><td colspan="7">Nenhuma pendência interna.</td></tr>';
}

function abrirNovaPendenciaLogistica(){
  ["logisticaPendenciaId","logisticaPendenciaTitulo","logisticaPendenciaCliente","logisticaPendenciaResponsavel","logisticaPendenciaLembrete","logisticaPendenciaObservacao"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=""});
  document.getElementById("logisticaPendenciaPrioridade").value="normal";
  document.getElementById("modalPendenciaLogistica").style.display="flex";
}
function fecharPendenciaLogistica(){document.getElementById("modalPendenciaLogistica").style.display="none"}

function editarPendenciaLogistica(id){
  const p=logisticaDados.pendencias.find(x=>String(x.id)===String(id));if(!p)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??""};
  set("logisticaPendenciaId",p.id);set("logisticaPendenciaTitulo",p.titulo);set("logisticaPendenciaCliente",p.cliente);
  set("logisticaPendenciaPrioridade",p.prioridade);set("logisticaPendenciaResponsavel",p.responsavel);
  set("logisticaPendenciaObservacao",p.observacao);
  if(p.lembrete_em)set("logisticaPendenciaLembrete",new Date(p.lembrete_em).toISOString().slice(0,16));
  document.getElementById("modalPendenciaLogistica").style.display="flex";
}

async function salvarPendenciaLogistica(){
  const id=document.getElementById("logisticaPendenciaId").value;
  const titulo=document.getElementById("logisticaPendenciaTitulo").value.trim();
  if(!titulo){alert("Informe o título.");return}
  const dados={
    titulo,cliente:document.getElementById("logisticaPendenciaCliente").value.trim(),
    prioridade:document.getElementById("logisticaPendenciaPrioridade").value,
    responsavel:document.getElementById("logisticaPendenciaResponsavel").value.trim(),
    lembrete_em:document.getElementById("logisticaPendenciaLembrete").value?new Date(document.getElementById("logisticaPendenciaLembrete").value).toISOString():null,
    observacao:document.getElementById("logisticaPendenciaObservacao").value.trim(),
    status:"aberta",criado_por:usuarioLogado?.login||null,atualizado_em:new Date().toISOString()
  };
  const r=id?await banco.from("painel_logistico_pendencias").update(dados).eq("id",id):await banco.from("painel_logistico_pendencias").insert([dados]);
  if(r.error){alert(r.error.message);return}
  fecharPendenciaLogistica();carregarPainelLogistico();
}

async function concluirPendenciaLogistica(id){
  const r=await banco.from("painel_logistico_pendencias").update({status:"concluida",concluida_em:new Date().toISOString(),atualizado_em:new Date().toISOString()}).eq("id",id);
  if(r.error)alert(r.error.message);else carregarPainelLogistico();
}

document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{
  if(document.getElementById("emailSubLogistica")?.classList.contains("ativa")) carregarPainelLogistico();
},900));
