async function carregarRelatorios(silencioso = false){
  try{
    if(!silencioso) mostrarCarregando("Atualizando dados...");

    if(!bancosJaCarregados){
      await carregarBancos();
    }

    const resposta = await banco.from("boletos").select("*").order("id",{ascending:false});
    if(resposta.error){
      console.error("Erro ao carregar boletos:", resposta.error);
      mostrarToastSistema("Erro ao carregar", "Não foi possível buscar os relatórios agora. Tente novamente.");
      return;
    }

    todosBoletos = resposta.data || [];
    bancosRelatoriosAlterados.clear();
    montarTabela();
    montarHistorico();
    atualizarDashboard();
    carregarNotificacoes();
    sistemaJaCarregado = true;
  }catch(erro){
    console.error("Erro geral ao carregar relatórios:", erro);
    mostrarToastSistema("Erro no carregamento", "Confira sua internet e tente abrir novamente.");
  }finally{
    if(!silencioso) esconderCarregando();
  }
}

function montarSelectBanco(id, bancoAtual){
  let html = `<select id="banco_${id}" onchange="marcarBancoRelatorioAlterado('${id}')"><option value="">Selecione</option>`;
  listaBancos.forEach(b => html += `<option value="${b.nome}" ${b.nome === bancoAtual ? "selected" : ""}>${b.nome}</option>`);
  html += `</select>`;
  return html;
}

function montarTabela(){
  const tabela = document.getElementById("tabela");
  tabela.innerHTML = "";

  const podeSalvarEmLote = usuarioLogado && (usuarioLogado.tipo === "banco" || usuarioLogado.tipo === "admin");
  const cabecalhoSelecao = document.getElementById("cabecalhoSelecionarBanco");
  const barraLote = document.getElementById("barraSalvarBancosLote");
  if(cabecalhoSelecao) cabecalhoSelecao.style.display = podeSalvarEmLote ? "" : "none";
  if(barraLote) barraLote.classList.toggle("ativa", podeSalvarEmLote);

  const cabecalhoAcao=document.getElementById("cabecalhoAcaoRelatorios");
  const ocultarAcaoBanco=usuarioLogado && usuarioLogado.tipo==="banco";
  if(cabecalhoAcao) cabecalhoAcao.style.display=ocultarAcaoBanco ? "none" : "";

  const andamento = todosBoletos
    .filter(item => item.status !== "Finalizado")
    .sort((a,b) => valorParaNumero(b.valor || 0) - valorParaNumero(a.valor || 0));

  andamento.forEach(item => {
    let bancoCampo = item.banco || "";
    let observacaoCampo = item.observacao || "";
    let botoes = "";
    let nomeCampo = item.nome || "";
    let valorCampo = "R$ " + valorParaNumero(item.valor || 0).toLocaleString("pt-BR");

    if(usuarioLogado.tipo === "financeiro"){
      nomeCampo = `<input id="edit_nome_${item.id}" value="${item.nome || ""}" oninput="marcarEdicaoRelatorio()">`;
      valorCampo = `<input type="text" id="edit_valor_${item.id}" value="${valorParaInput(item.valor || 0)}" inputmode="decimal" oninput="mascaraValor(this);marcarEdicaoRelatorio()">`;
      botoes += `<button class="btn azul" onclick="editarRelatorio('${item.id}')">Editar</button>`;
      if(item.banco){ botoes += `<button class="btn roxo" onclick="finalizar('${item.id}')">Finalizar</button>`; }
      botoes += `<button class="btn vermelho" onclick="excluir('${item.id}')">Excluir</button>`;
    }

    if(usuarioLogado.tipo === "banco"){
      bancoCampo = montarSelectBanco(item.id, item.banco || "");
      observacaoCampo = `<input id="obs_${item.id}" value="${item.observacao || ""}" placeholder="Observação" oninput="marcarBancoRelatorioAlterado('${item.id}')">`;
      botoes = "";
    }

    if(usuarioLogado.tipo === "admin"){
      nomeCampo = `<input id="edit_nome_${item.id}" value="${item.nome || ""}" oninput="marcarEdicaoRelatorio()">`;
      valorCampo = `<input type="text" id="edit_valor_${item.id}" value="${valorParaInput(item.valor || 0)}" inputmode="decimal" oninput="mascaraValor(this);marcarEdicaoRelatorio()">`;
      bancoCampo = montarSelectBanco(item.id, item.banco || "");
      observacaoCampo = `<input id="obs_${item.id}" value="${item.observacao || ""}" placeholder="Observação" oninput="marcarBancoRelatorioAlterado('${item.id}')">`;
      botoes += `<button class="btn azul" onclick="editarRelatorio('${item.id}')">Editar</button>`;
      if(item.banco){ botoes += `<button class="btn roxo" onclick="finalizar('${item.id}')">Finalizar</button>`; }
      botoes += `<button class="btn vermelho" onclick="excluir('${item.id}')">Excluir</button>`;
    }

    const selecaoCampo = podeSalvarEmLote
      ? `<input type="checkbox" class="relatorio-check check-banco-lote" id="check_banco_${item.id}" data-id="${item.id}" onchange="atualizarSelecaoBancosRelatorio('${item.id}',this.checked)">`
      : "";

    tabela.innerHTML += `<tr id="linha_relatorio_${item.id}">
      <td style="${podeSalvarEmLote ? "" : "display:none;"}">${selecaoCampo}</td>
      <td>${nomeCampo}</td><td>${valorCampo}</td><td>${bancoCampo}</td><td>${observacaoCampo}</td>
      <td>${item.criado_por || ""}</td><td><span class="status andamento">Em andamento</span></td>
      <td style="${usuarioLogado && usuarioLogado.tipo === "banco" ? "display:none;" : ""}">${botoes}</td>
    </tr>`;
  });

  atualizarResumoRelatorios(andamento);
  atualizarContadorBancosLote();
}

function atualizarResumoRelatorios(andamento){
  const totalLancado = andamento.reduce((soma, item) => soma + valorParaNumero(item.valor || 0), 0);
  const totalLancadoEl = document.getElementById("totalLancadoRelatorio");
  const totalBancosEl = document.getElementById("totalAutorizadoBancos");

  if(totalLancadoEl) totalLancadoEl.innerHTML = formatarMoeda(totalLancado);
  if(!totalBancosEl) return;

  const totaisPorBanco = {};
  andamento.forEach(item => {
    if(item.banco){
      if(!totaisPorBanco[item.banco]) totaisPorBanco[item.banco] = 0;
      totaisPorBanco[item.banco] += valorParaNumero(item.valor || 0);
    }
  });

  const bancos = Object.keys(totaisPorBanco).sort();
  if(bancos.length === 0){
    totalBancosEl.innerHTML = `<div class="texto-vazio">Nenhum banco autorizado.</div>`;
    return;
  }

  totalBancosEl.innerHTML = `<ul>${bancos.map(nome => `<li><span>${nome}</span><b>${formatarMoeda(totaisPorBanco[nome])}</b></li>`).join("")}</ul>`;
}

function formatarValorDigitado(valor){
  valor = String(valor || "").replace(/R\$\s?/g, "").trim();
  valor = valor.replace(/[^0-9,]/g, "");

  const partes = valor.split(",");
  let inteiro = partes[0].replace(/\D/g, "");
  let centavos = partes.length > 1 ? partes.slice(1).join("").replace(/\D/g, "").slice(0, 2) : null;

  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if(centavos !== null){
    return inteiro + "," + centavos;
  }

  return inteiro;
}

function mascaraValor(input){
  if(!input) return;
  input.value = formatarValorDigitado(input.value);
}

function valorParaNumero(valor){
  if(typeof valor === "number"){
    return isNaN(valor) ? 0 : valor;
  }

  let texto = String(valor || "")
    .replace(/R\$\s?/g, "")
    .trim();

  if(!texto) return 0;

  // Quando o usuário digita no padrão brasileiro: 797,20 ou 1.050,20
  if(texto.includes(",")){
    texto = texto.replace(/\./g, "").replace(",", ".");
  }else{
    // Quando vem como milhar: 1.050 / 10.000 / 100.000
    // Mas preserva números decimais do banco, como 797.2
    const pareceMilhar = /^-?\d{1,3}(\.\d{3})+$/.test(texto);
    if(pareceMilhar){
      texto = texto.replace(/\./g, "");
    }
  }

  const numero = Number(texto);
  return isNaN(numero) ? 0 : numero;
}

function valorParaInput(valor){
  return valorParaNumero(valor).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

function formatarMoeda(valor){
  return "R$ " + valorParaNumero(valor).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

function normalizarTexto(texto){
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatarDataInput(data){
  const d = new Date(data);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2,"0");
  const dia = String(d.getDate()).padStart(2,"0");
  return `${ano}-${mes}-${dia}`;
}

function inicioDoDia(data){
  const d = data instanceof Date ? new Date(data) : new Date(String(data).includes("T") ? data : String(data) + "T00:00:00");
  d.setHours(0,0,0,0);
  return d;
}

function filtrarPorPeriodo(lista, filtro, dataEspecifica, dataInicio, dataFim){
  const hoje = inicioDoDia(new Date());
  return lista.filter(item => {
    if(!item.data_finalizacao) return false;
    const dataItem = inicioDoDia(item.data_finalizacao);

    if(filtro === "todos") return true;

    if(filtro === "semana"){
      const semanaAtras = new Date(hoje);
      semanaAtras.setDate(hoje.getDate() - 7);
      return dataItem >= semanaAtras && dataItem <= hoje;
    }

    if(filtro === "mes"){
      return dataItem.getMonth() === hoje.getMonth() && dataItem.getFullYear() === hoje.getFullYear();
    }

    if(filtro === "ano"){
      return dataItem.getFullYear() === hoje.getFullYear();
    }

    if(filtro === "data"){
      if(!dataEspecifica) return true;
      const dataDigitada = inicioDoDia(dataEspecifica);
      return dataItem.getTime() === dataDigitada.getTime();
    }

    if(filtro === "periodo"){
      if(!dataInicio || !dataFim) return true;
      const inicio = inicioDoDia(dataInicio);
      const fim = inicioDoDia(dataFim);
      return dataItem >= inicio && dataItem <= fim;
    }

    return true;
  });
}

function atualizarAbasFiltro(prefixo, filtroAtual){
  ["semana","mes","ano","todos"].forEach(tipo => {
    const botao = document.getElementById(prefixo + "_" + tipo);
    if(botao){
      botao.classList.remove("ativo");
      if(tipo === filtroAtual) botao.classList.add("ativo");
    }
  });
}

function preencherDatasDashboard(inicio, fim){
  const inputInicio = document.getElementById("dataDashboardInicio");
  const inputFim = document.getElementById("dataDashboardFim");
  if(inputInicio) inputInicio.value = inicio || "";
  if(inputFim) inputFim.value = fim || "";
}

function setFiltroDashboard(tipo){
  filtroDashboard = tipo;
  dataDashboardEspecifica = "";
  dataDashboardInicio = "";
  dataDashboardFim = "";
  preencherDatasDashboard("", "");
  atualizarAbasFiltro("dash", filtroDashboard);
  atualizarDashboard();
}

function mostrarDashboardHoje(){
  const hoje = formatarDataInput(new Date());
  filtroDashboard = "data";
  dataDashboardEspecifica = hoje;
  dataDashboardInicio = hoje;
  dataDashboardFim = hoje;
  preencherDatasDashboard(hoje, hoje);
  atualizarAbasFiltro("dash", "");
  atualizarDashboard();
}

function buscarPeriodoDashboard(){
  const inicio = document.getElementById("dataDashboardInicio").value;
  const fim = document.getElementById("dataDashboardFim").value;

  if(!inicio || !fim){ alert("Escolha a data inicial e a data final"); return; }
  if(inicioDoDia(inicio) > inicioDoDia(fim)){ alert("A data inicial não pode ser maior que a data final"); return; }

  dataDashboardInicio = inicio;
  dataDashboardFim = fim;

  if(inicio === fim){
    filtroDashboard = "data";
    dataDashboardEspecifica = inicio;
  }else{
    filtroDashboard = "periodo";
    dataDashboardEspecifica = "";
  }

  atualizarAbasFiltro("dash", "");
  atualizarDashboard();
}


function setFiltroHistorico(tipo){
  filtroHistorico = tipo;
  dataHistoricoEspecifica = "";
  document.getElementById("dataHistorico").value = "";
  atualizarAbasFiltro("hist", filtroHistorico);
  montarHistorico();
}

function buscarDataHistorico(){
  const data = document.getElementById("dataHistorico").value;
  if(!data){ alert("Escolha uma data para buscar"); return; }
  filtroHistorico = "data";
  dataHistoricoEspecifica = data;
  atualizarAbasFiltro("hist", "");
  montarHistorico();
}

function buscarNomeHistorico(){
  filtroNomeHistorico = normalizarTexto(document.getElementById("buscaNomeHistorico").value);
  montarHistorico();
}

function limparBuscaNomeHistorico(){
  filtroNomeHistorico = "";
  document.getElementById("buscaNomeHistorico").value = "";
  montarHistorico();
}

function atualizarResumoHistoricoClientes(finalizados){
  const box = document.getElementById("resumoHistoricoClientes");
  if(!box) return;

  if(!filtroNomeHistorico){
    box.innerHTML = `<div class="resumo-card"><p>Resumo por Cliente</p><div class="texto-vazio">Digite um nome ou parte do nome para ver o total individual dos clientes pesquisados.</div></div>`;
    return;
  }

  if(finalizados.length === 0){
    box.innerHTML = `<div class="resumo-card"><p>Resumo por Cliente</p><div class="texto-vazio">Nenhum cliente encontrado com essa pesquisa.</div></div>`;
    return;
  }

  const clientes = {};

  finalizados.forEach(item => {
    const nomeOriginal = String(item.nome || "Cliente sem nome").trim() || "Cliente sem nome";
    const chave = normalizarTexto(nomeOriginal);
    const valor = valorParaNumero(item.valor || 0);
    const nomeBanco = item.banco || "Sem banco";

    if(!clientes[chave]){
      clientes[chave] = {nome:nomeOriginal,total:0,bancos:{}};
    }

    clientes[chave].total += valor;
    if(!clientes[chave].bancos[nomeBanco]) clientes[chave].bancos[nomeBanco] = 0;
    clientes[chave].bancos[nomeBanco] += valor;
  });

  const listaClientes = Object.values(clientes).sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalClientesHtml = listaClientes.map(cliente =>
    `<li><span>${cliente.nome}</span><b>${formatarMoeda(cliente.total)}</b></li>`
  ).join("");

  const totalBancosHtml = listaClientes.map(cliente => {
    const bancosHtml = Object.keys(cliente.bancos).sort().map(nomeBanco =>
      `<li><span>${nomeBanco}</span><b>${formatarMoeda(cliente.bancos[nomeBanco])}</b></li>`
    ).join("");

    return `<div style="margin-bottom:14px;"><b>${cliente.nome}</b><ul>${bancosHtml}</ul></div>`;
  }).join("");

  box.innerHTML = `
    <div class="resumo-card">
      <p>Total comprado por cliente pesquisado</p>
      <ul>${totalClientesHtml}</ul>
    </div>
    <div class="resumo-card">
      <p>Total por banco de cada cliente</p>
      ${totalBancosHtml}
    </div>
  `;
}

function montarHistorico(){
  const tabela = document.getElementById("tabelaHistorico");
  tabela.innerHTML = "";
  let finalizados = filtrarPorPeriodo(todosBoletos.filter(item => item.status === "Finalizado"), filtroHistorico, dataHistoricoEspecifica);

  if(filtroNomeHistorico){
    finalizados = finalizados.filter(item => normalizarTexto(item.nome).includes(filtroNomeHistorico));
  }

  atualizarResumoHistoricoClientes(finalizados);

  finalizados.forEach(item => {
    let botoes = "";
    if(usuarioLogado.tipo === "financeiro" || usuarioLogado.tipo === "admin"){
      botoes = `<button class="btn azul" onclick="editarHistorico('${item.id}')">Editar</button>`;
    }

    tabela.innerHTML += `<tr><td>${item.nome || ""}</td><td>${formatarMoeda(item.valor || 0)}</td><td>${item.banco || ""}</td><td>${item.observacao || ""}</td><td>${item.data_finalizacao ? new Date(item.data_finalizacao).toLocaleDateString("pt-BR") : ""}</td><td>${item.editado_por || ""}</td><td>${item.data_edicao ? new Date(item.data_edicao).toLocaleString("pt-BR") : ""}</td><td>${botoes}</td></tr>`;
  });

  atualizarAbasFiltro("hist", filtroHistorico);
}

function atualizarDashboard(){
  const finalizados = filtrarPorPeriodo(todosBoletos.filter(item => item.status === "Finalizado"), filtroDashboard, dataDashboardEspecifica, dataDashboardInicio, dataDashboardFim);
  let total = 0;
  let bancosGrafico = {};

  finalizados.forEach(item => {
    total += valorParaNumero(item.valor || 0);
    if(item.banco){
      if(!bancosGrafico[item.banco]) bancosGrafico[item.banco] = 0;
      bancosGrafico[item.banco] += valorParaNumero(item.valor || 0);
    }
  });

  let titulo = "Total Finalizado";
  if(filtroDashboard === "semana") titulo = "Total da Semana";
  if(filtroDashboard === "mes") titulo = "Total do Mês";
  if(filtroDashboard === "ano") titulo = "Total do Ano";
  if(filtroDashboard === "todos") titulo = "Total Geral Finalizado";
  if(filtroDashboard === "data") titulo = "Total de Hoje";
  if(filtroDashboard === "periodo") titulo = "Total do Período";

  document.getElementById("tituloTotal").innerHTML = titulo;
  document.getElementById("total").innerHTML = formatarMoeda(total);

  const labels = Object.keys(bancosGrafico);
  const valores = Object.values(bancosGrafico);
  const cores = labels.map(nomeBanco => {
    const encontrado = listaBancos.find(b => b.nome === nomeBanco);
    return encontrado?.cor || "#5a4fa3";
  });

  montarGraficoFallback(labels, valores, cores);

  if(typeof Chart === "undefined"){
    const canvas = document.getElementById("grafico");
    if(canvas) canvas.style.display = "none";
    atualizarAbasFiltro("dash", filtroDashboard);
    return;
  }

  const canvas = document.getElementById("grafico");
  if(canvas) canvas.style.display = "block";

  if(grafico) grafico.destroy();

  grafico = new Chart(document.getElementById("grafico"), {
    type:"bar",
    data:{labels:labels,datasets:[{label:"Total por banco",data:valores,backgroundColor:cores,borderColor:cores,borderWidth:1}]},
    options:{responsive:true,maintainAspectRatio:false}
  });

  atualizarAbasFiltro("dash", filtroDashboard);
}

function montarGraficoFallback(labels, valores, cores = []){
  const boxGrafico = document.querySelector(".grafico-box");
  if(!boxGrafico) return;

  let fallback = document.getElementById("graficoFallback");
  if(!fallback){
    fallback = document.createElement("div");
    fallback.id = "graficoFallback";
    fallback.className = "grafico-fallback";
    boxGrafico.appendChild(fallback);
  }

  if(labels.length === 0){
    fallback.innerHTML = `<div class="texto-vazio">Nenhum valor finalizado nesse período.</div>`;
    return;
  }

  const maior = Math.max(...valores, 1);
  fallback.innerHTML = labels.map((nome, i) => {
    const valor = valores[i] || 0;
    const largura = Math.max(4, Math.round((valor / maior) * 100));
    const cor = cores[i] || "#5a4fa3";
    return `<div class="grafico-linha"><div class="grafico-nome">${nome}</div><div class="grafico-barra"><div class="grafico-preenchido" style="width:${largura}%;background:${cor}"></div></div><div class="grafico-valor">${formatarMoeda(valor)}</div></div>`;
  }).join("");
}


function atualizarBotaoNotificacao(){
  const botao = document.getElementById("btnPermitirNotificacao");
  if(!botao) return;

  if(!("Notification" in window)){
    botao.innerHTML = "Notificação não suportada";
    botao.disabled = true;
    return;
  }

  if(Notification.permission === "granted"){
    botao.innerHTML = "Notificação ativada ✅";
    botao.disabled = true;
    return;
  }

  if(Notification.permission === "denied"){
    botao.innerHTML = "Notificação do Chrome bloqueada";
    botao.disabled = true;
    return;
  }

  botao.innerHTML = "Ativar notificação no Chrome";
  botao.disabled = false;
}

async function solicitarPermissaoNotificacao(){
  if(!("Notification" in window)){
    alert("Este navegador não suporta notificação.");
    return;
  }

  const permissao = await Notification.requestPermission();
  atualizarBotaoNotificacao();

  if(permissao === "granted"){
    notificarChrome("Sofisticatto Financeiro", "Notificações ativadas com sucesso.");
  }else{
    alert("A notificação não foi liberada. Verifique as permissões do Chrome.");
  }
}

function mostrarBalaoSistema(titulo, mensagem){
  const container = document.getElementById("toastContainer");
  if(!container) return;

  const item = document.createElement("div");
  item.className = "toast-notificacao";
  item.innerHTML = `<b>🔔 ${titulo}</b><span>${mensagem}</span><br><small>Agora</small>`;
  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(15px)";
    item.style.transition = ".25s";
    setTimeout(() => item.remove(), 300);
  }, 7000);
}

function mostrarToastSistema(titulo, mensagem){
  mostrarBalaoSistema(titulo, mensagem);
}

function notificarChrome(titulo, mensagem){
  mostrarBalaoSistema(titulo, mensagem);

  if(!("Notification" in window)) return;
  if(Notification.permission !== "granted") return;

  new Notification(titulo, {
    body: mensagem,
    tag: "sofisticatto-financeiro-" + Date.now(),
    requireInteraction: false
  });
}

function processarNotificacaoTempoReal(payload){
  if(!usuarioLogado || !sistemaJaCarregado || !payload || !payload.new) return;

  const novo = payload.new;
  const chaveEvento = `${payload.eventType}_${novo.id || "semid"}_${novo.status || ""}_${novo.banco || ""}_${novo.valor || ""}`;

  if(notificacoesRecebidas.has(chaveEvento)) return;
  notificacoesRecebidas.add(chaveEvento);
  setTimeout(() => notificacoesRecebidas.delete(chaveEvento), 30000);

  if(usuarioLogado.tipo === "banco"){
    if(payload.eventType === "INSERT" && novo.status !== "Finalizado" && !novo.banco){
      notificarChrome("Novo relatório lançado", `Cliente: ${novo.nome || "Sem nome"} | Valor: ${formatarMoeda(novo.valor || 0)}`);
    }

    if(payload.eventType === "UPDATE" && novo.status !== "Finalizado" && !novo.banco){
      notificarChrome("Relatório alterado", `Cliente: ${novo.nome || "Sem nome"} | Valor: ${formatarMoeda(novo.valor || 0)}`);
    }
  }

  if(usuarioLogado.tipo === "financeiro" || usuarioLogado.tipo === "admin"){
    if(payload.eventType === "UPDATE" && novo.status !== "Finalizado" && novo.banco){
      notificarChrome("Banco autorizado", `${novo.banco} autorizado para ${novo.nome || "cliente"} | Valor: ${formatarMoeda(novo.valor || 0)}`);
    }

    if(payload.eventType === "UPDATE" && novo.status === "Finalizado"){
      notificarChrome("Relatório finalizado", `${novo.nome || "cliente"} foi finalizado | Valor: ${formatarMoeda(novo.valor || 0)}`);
    }
  }
}
function carregarNotificacoes(){
  const lista = document.getElementById("listaNotificacoes");
  const contador = document.getElementById("contadorNotificacoes");
  if(!lista || !contador || !usuarioLogado) return;

  lista.innerHTML = "";
  let total = 0;

  if(usuarioLogado.tipo === "banco"){
    const pendentes = todosBoletos.filter(item => item.status !== "Finalizado" && !item.banco);
    total = pendentes.length;
    contador.innerHTML = total;
    lista.innerHTML = total > 0
      ? `<div class="notificacao-item" onclick="mostrarSecao('relatorios')">🔔 Existem <b>${total}</b> boletos aguardando banco.</div>`
      : `<div class="notificacao-item">Nenhum boleto aguardando banco.</div>`;
  }

  if(usuarioLogado.tipo === "financeiro" || usuarioLogado.tipo === "admin"){
    const aguardando = todosBoletos.filter(item => item.status !== "Finalizado" && item.banco);
    total = aguardando.length;
    contador.innerHTML = total;
    lista.innerHTML = total > 0
      ? `<div class="notificacao-item" onclick="mostrarSecao('relatorios')">🔔 Existem <b>${total}</b> boletos aguardando finalização.</div>`
      : `<div class="notificacao-item">Nenhum boleto aguardando finalização.</div>`;
  }
}

function obterClientesParaSugestaoRelatorio(){
  return emailClientes
    .filter(item => item && item.nome)
    .sort((a,b) => String(a.nome).localeCompare(String(b.nome),"pt-BR"));
}

function mostrarSugestoesClienteRelatorio(){
  const input = document.getElementById("nome");
  const lista = document.getElementById("listaSugestoesClienteRelatorio");
  if(!input || !lista) return;

  const termo = normalizarNomeEmail(input.value);
  const clientes = obterClientesParaSugestaoRelatorio();

  const encontrados = clientes
    .filter(item => !termo || normalizarNomeEmail(item.nome).includes(termo))
    .slice(0,15);

  if(!encontrados.length){
    lista.classList.remove("ativa");
    lista.innerHTML = "";
    return;
  }

  lista.innerHTML = encontrados.map(item => {
    const vendedora = emailVendedoras.find(v => v.id === item.vendedora_id);
    return `<div class="sugestao-item" onmousedown="selecionarSugestaoClienteRelatorio('${encodeURIComponent(item.nome)}')">
      <b>${escaparHtmlEmail(item.nome)}</b>
      <small>${escaparHtmlEmail(vendedora?.nome || "")}</small>
    </div>`;
  }).join("");

  lista.classList.add("ativa");
}

function selecionarSugestaoClienteRelatorio(nomeCodificado){
  const input = document.getElementById("nome");
  const lista = document.getElementById("listaSugestoesClienteRelatorio");
  if(!input) return;

  input.value = decodeURIComponent(nomeCodificado);
  input.focus();
  input.setSelectionRange(input.value.length,input.value.length);

  if(lista){
    lista.classList.remove("ativa");
    lista.innerHTML = "";
  }
}

document.addEventListener("click", evento => {
  const box = document.querySelector(".sugestoes-relatorio");
  const lista = document.getElementById("listaSugestoesClienteRelatorio");

  if(box && lista && !box.contains(evento.target)){
    lista.classList.remove("ativa");
  }
});

async function salvarRelatorio(){
  const nome = document.getElementById("nome").value.trim();
  const valorTexto = document.getElementById("valor").value.trim();
  const valor = valorParaNumero(valorTexto);

  if(!nome || !valorTexto){ alert("Preencha nome e valor"); return; }

  await banco.from("boletos").insert([{nome:nome,valor:valor,status:"Em andamento",banco:"",observacao:"",data_finalizacao:null,criado_por:usuarioLogado.login}]);
  mostrarBalaoSistema("Relatório lançado", "O usuário banco já pode ver esse novo relatório.");
  document.getElementById("nome").value = "";
  document.getElementById("valor").value = "";
  carregarRelatorios();
}


const bancosRelatoriosAlterados = new Set();

function marcarBancoRelatorioAlterado(id){
  marcarEdicaoRelatorio();
  bancosRelatoriosAlterados.add(String(id));

  const linha=document.getElementById("linha_relatorio_"+id);
  if(linha) linha.classList.add("relatorio-alterado");

  const check=document.getElementById("check_banco_"+id);
  if(check) check.checked=true;

  atualizarSelecaoBancosRelatorio(id,true);
}

function atualizarSelecaoBancosRelatorio(id,selecionado){
  const linha=document.getElementById("linha_relatorio_"+id);
  if(linha) linha.classList.toggle("relatorio-selecionado",!!selecionado);
  atualizarContadorBancosLote();
}

function checksBancosRelatorio(){
  return Array.from(document.querySelectorAll(".check-banco-lote"));
}

function atualizarContadorBancosLote(){
  const checks=checksBancosRelatorio();
  const selecionados=checks.filter(item=>item.checked).length;
  const contador=document.getElementById("quantidadeBancosSelecionados");
  const alterados=document.getElementById("quantidadeBancosAlterados");
  const marcarTodos=document.getElementById("marcarTodosBancos");
  const botao=document.getElementById("btnSalvarBancosLote");

  if(contador) contador.textContent=selecionados;
  if(alterados){
    alterados.textContent=bancosRelatoriosAlterados.size
      ? ` • ${bancosRelatoriosAlterados.size} alteração(ões) pendente(s)`
      : "";
  }
  if(marcarTodos){
    marcarTodos.checked=checks.length>0 && selecionados===checks.length;
    marcarTodos.indeterminate=selecionados>0 && selecionados<checks.length;
  }
  if(botao) botao.disabled=selecionados===0;
}

function alternarTodosBancosRelatorio(marcar){
  checksBancosRelatorio().forEach(check=>{
    check.checked=marcar;
    atualizarSelecaoBancosRelatorio(check.dataset.id,marcar);
  });
  atualizarContadorBancosLote();
}

function selecionarTodosBancosRelatorio(){
  alternarTodosBancosRelatorio(true);
}

function selecionarBancosAlterados(){
  checksBancosRelatorio().forEach(check=>{
    const marcar=bancosRelatoriosAlterados.has(String(check.dataset.id));
    check.checked=marcar;
    atualizarSelecaoBancosRelatorio(check.dataset.id,marcar);
  });
  atualizarContadorBancosLote();
}

function limparSelecaoBancosRelatorio(){
  alternarTodosBancosRelatorio(false);
}

async function salvarBancosSelecionados(){
  const selecionados=checksBancosRelatorio().filter(check=>check.checked);
  if(!selecionados.length){
    alert("Marque pelo menos um relatório.");
    return;
  }

  const registros=[];
  const semBanco=[];

  selecionados.forEach(check=>{
    const id=check.dataset.id;
    const bancoInput=document.getElementById("banco_"+id);
    const obsInput=document.getElementById("obs_"+id);
    const bancoSelecionado=bancoInput ? bancoInput.value : "";

    if(!bancoSelecionado){
      semBanco.push(id);
      return;
    }

    registros.push({
      id,
      banco:bancoSelecionado,
      observacao:obsInput ? obsInput.value : ""
    });
  });

  if(semBanco.length){
    alert(`${semBanco.length} relatório(s) selecionado(s) ainda estão sem banco. Selecione o banco antes de salvar.`);
    return;
  }

  const botao=document.getElementById("btnSalvarBancosLote");
  const textoOriginal=botao ? botao.textContent : "";
  if(botao){
    botao.disabled=true;
    botao.textContent=`Salvando ${registros.length}...`;
  }

  let salvos=0;
  const erros=[];

  try{
    const resultados=await Promise.all(registros.map(async registro=>{
      const resposta=await banco
        .from("boletos")
        .update({banco:registro.banco,observacao:registro.observacao})
        .eq("id",registro.id);

      return {registro,erro:resposta.error};
    }));

    resultados.forEach(resultado=>{
      if(resultado.erro){
        erros.push({id:resultado.registro.id,mensagem:resultado.erro.message});
      }else{
        salvos++;
        bancosRelatoriosAlterados.delete(String(resultado.registro.id));
      }
    });

    limparEdicaoRelatorio();

    if(erros.length){
      mostrarBalaoSistema(
        "Salvamento concluído parcialmente",
        `${salvos} relatório(s) salvo(s) e ${erros.length} com erro.`
      );
      console.error("Erros ao salvar bancos em lote:",erros);
    }else{
      mostrarBalaoSistema(
        "Bancos salvos",
        `${salvos} relatório(s) foram atualizados com sucesso.`
      );
    }

    await carregarRelatorios();
  }catch(erro){
    console.error("Erro ao salvar bancos em lote:",erro);
    alert("Não foi possível salvar os bancos selecionados.");
  }finally{
    if(botao){
      botao.disabled=false;
      botao.textContent=textoOriginal;
    }
    atualizarContadorBancosLote();
  }
}

async function salvarBanco(id){
  const bancoSelecionado = document.getElementById("banco_" + id).value;
  const observacao = document.getElementById("obs_" + id) ? document.getElementById("obs_" + id).value : "";

  if(!bancoSelecionado){ alert("Selecione um banco"); return; }

  await banco.from("boletos").update({banco:bancoSelecionado,observacao:observacao}).eq("id",id);
  limparEdicaoRelatorio();
  mostrarBalaoSistema("Banco salvo", "O financeiro já pode ver essa autorização.");
  carregarRelatorios();
}

async function finalizar(id){
  await banco.from("boletos").update({status:"Finalizado",data_finalizacao:new Date()}).eq("id",id);
  carregarRelatorios();
}

async function excluir(id){
  if(!confirm("Excluir relatório?")) return;
  await banco.from("boletos").delete().eq("id",id);
  carregarRelatorios();
}

async function editarRelatorio(id){
  const nomeInput = document.getElementById("edit_nome_" + id);
  const valorInput = document.getElementById("edit_valor_" + id);
  if(!nomeInput || !valorInput){ alert("Campos não encontrados"); return; }

  let dados = {nome:nomeInput.value,valor:valorParaNumero(valorInput.value)};

  if(usuarioLogado.tipo === "admin"){
    const bancoInput = document.getElementById("banco_" + id);
    const obsInput = document.getElementById("obs_" + id);
    dados.banco = bancoInput ? bancoInput.value : "";
    dados.observacao = obsInput ? obsInput.value : "";
  }

  await banco.from("boletos").update(dados).eq("id",id);
  limparEdicaoRelatorio();
  alert("Relatório atualizado!");
  carregarRelatorios();
}

async function editarHistorico(id){
  const item = todosBoletos.find(b => b.id == id);
  if(!item){ alert("Registro não encontrado"); return; }

  const novoNome = prompt("Nome do cliente:", item.nome || "");
  if(novoNome === null) return;
  const novoValor = prompt("Valor:", valorParaInput(item.valor || 0));
  if(novoValor === null) return;
  const novaObservacao = prompt("Observação:", item.observacao || "");
  if(novaObservacao === null) return;

  await banco.from("boletos").update({nome:novoNome,valor:valorParaNumero(novoValor),observacao:novaObservacao,editado_por:usuarioLogado.login,data_edicao:new Date()}).eq("id",id);
  alert("Histórico atualizado!");
  carregarRelatorios();
}

async function criarBanco(){
  const nome = document.getElementById("novoBanco").value.trim();
  const cor = document.getElementById("corBanco").value;
  if(!nome){ alert("Digite o nome do banco"); return; }

  await banco.from("bancos").insert([{nome:nome,cor:cor}]);
  document.getElementById("novoBanco").value = "";
  carregarRelatorios();
}

async function excluirBanco(id){
  if(!confirm("Excluir este banco?")) return;
  await banco.from("bancos").delete().eq("id",id);
  carregarRelatorios();
}

async function criarUsuario(){
  const login = document.getElementById("novoLogin").value.trim();
  const senha = document.getElementById("novaSenha").value.trim();
  const tipo = document.getElementById("novoTipo").value;

  if(!login || !senha){ alert("Preencha login e senha"); return; }

  await banco.from("usuarios").insert([{login:login,senha:senha,tipo:tipo}]);
  alert("Usuário criado!");
  document.getElementById("novoLogin").value = "";
  document.getElementById("novaSenha").value = "";
  carregarUsuarios();
}

async function carregarUsuarios(){
  if(!usuarioLogado || usuarioLogado.tipo !== "admin") return;

  const resposta = await banco.from("usuarios").select("*").order("login",{ascending:true});
  if(resposta.error) return;

  const tabela = document.getElementById("tabelaUsuarios");
  tabela.innerHTML = "";
  resposta.data.forEach(user => {
    tabela.innerHTML += `<tr><td>${user.login}</td><td>${user.tipo}</td></tr>`;
  });
}

function marcarEdicaoRelatorio(){
  formularioRelatorioAlterado = true;
}

function limparEdicaoRelatorio(){
  formularioRelatorioAlterado = false;
  atualizacaoPendenteEnquantoEdita = false;
}

function usuarioEstaEditandoRelatorio(){
  if(formularioRelatorioAlterado) return true;

  const ativo = document.activeElement;
  if(!ativo) return false;

  const id = ativo.id || "";
  const tag = (ativo.tagName || "").toLowerCase();

  // Protege principalmente o usuário banco enquanto ele está escolhendo banco/observação.
  if(id.startsWith("banco_") || id.startsWith("obs_") || id.startsWith("edit_nome_") || id.startsWith("edit_valor_")) return true;

  // Se estiver dentro da tabela de relatórios em andamento, não redesenha a tela no meio da digitação.
  const tabelaRelatorio = document.getElementById("tabela");
  if(tabelaRelatorio && tabelaRelatorio.contains(ativo) && (tag === "input" || tag === "select" || tag === "textarea")) return true;

  return false;
}

function deveAtualizarTelaPorTempoReal(payload){
  if(!usuarioLogado || !payload || !payload.new) return false;

  const novo = payload.new;
  const evento = payload.eventType;

  // Banco só precisa receber automaticamente quando o financeiro lançar um novo relatório
  // ou quando algum item sair/finalizar. Isso evita apagar o banco selecionado antes de salvar.
  if(usuarioLogado.tipo === "banco"){
    if(evento === "INSERT" && novo.status !== "Finalizado" && !novo.banco) return true;
    if(evento === "DELETE") return true;
    if(evento === "UPDATE" && novo.status === "Finalizado") return true;
    return false;
  }

  // Financeiro/admin precisa atualizar quando o banco salvar a autorização,
  // quando entrar relatório novo, finalizar, editar ou excluir.
  if(usuarioLogado.tipo === "financeiro" || usuarioLogado.tipo === "admin"){
    return evento === "INSERT" || evento === "UPDATE" || evento === "DELETE";
  }

  return false;
}

function atualizarTempoRealComDebounce(payload){
  if(!usuarioLogado) return;

  processarNotificacaoTempoReal(payload);

  if(!deveAtualizarTelaPorTempoReal(payload)) return;

  if(usuarioEstaEditandoRelatorio()){
    atualizacaoPendenteEnquantoEdita = true;
    mostrarBalaoSistema("Atualização recebida", "Tem alteração nova, mas a tela não foi atualizada para não apagar o que você está preenchendo.");
    return;
  }

  carregarRelatorios(true);
}

function iniciarSincronizacaoAutomatica(){
  // Desativado para não deixar o celular pesado.
  // A atualização instantânea fica pelo Realtime do Supabase.
}


function iniciarRealtime(){
  if(realtimeIniciado || !banco) return;
  realtimeIniciado = true;

  banco
  .channel("tempo-real")
  .on("postgres_changes",{event:"*",schema:"public",table:"boletos"},(payload) => {
    atualizarTempoRealComDebounce(payload);
  })
  .subscribe();
}

/* =========================================================
   GERADOR PROFISSIONAL DE RELATÓRIOS
   ========================================================= */
function dataHojeInputRelatorio(){
  return formatarDataInput(new Date());
}

function formatarDataBrRelatorio(valor){
  if(!valor) return "";
  const data = new Date(valor + (String(valor).includes("T") ? "" : "T12:00:00"));
  return isNaN(data) ? "" : data.toLocaleDateString("pt-BR");
}

function inicializarGeradorRelatorio(){
  const emissao = document.getElementById("gerDataEmissao");
  const saida = document.getElementById("gerDataSaida");
  if(emissao && !emissao.value) emissao.value = dataHojeInputRelatorio();
  if(saida && !saida.value) saida.value = dataHojeInputRelatorio();
  atualizarPreviaRelatorio();
  calcularVencimentosRelatorio();
}

function sincronizarTotalRelatorio(){
  const pedido = document.getElementById("gerValorPedido");
  const total = document.getElementById("gerValorTotal");
  if(total && pedido && !total.dataset.editadoManualmente){
    total.value = pedido.value;
  }
}

function normalizarDiasPrazoRelatorio(texto){
  return [...new Set(String(texto || "")
    .split(/[\/,;|\s-]+/)
    .map(item => parseInt(item,10))
    .filter(item => Number.isFinite(item) && item >= 0))]
    .sort((a,b) => a-b);
}

function calcularVencimentosRelatorio(){
  const dataSaida = document.getElementById("gerDataSaida")?.value;
  const prazoPersonalizado = document.getElementById("gerPrazoPersonalizado")?.value || "";
  const prazoId = document.getElementById("gerPrazo")?.value;
  const prazo = gerPrazosPagamento.find(item => item.id === prazoId);
  const dias = prazoPersonalizado.trim()
    ? normalizarDiasPrazoRelatorio(prazoPersonalizado)
    : (prazo?.dias || []);

  gerVencimentosCalculados = [];
  if(dataSaida && dias.length){
    const base = new Date(dataSaida + "T12:00:00");
    gerVencimentosCalculados = dias.map(dia => {
      const data = new Date(base);
      data.setDate(data.getDate() + Number(dia));
      return {dias:Number(dia),data:formatarDataInput(data)};
    });
  }

  const box = document.getElementById("gerVencimentos");
  if(box){
    box.innerHTML = gerVencimentosCalculados.length
      ? gerVencimentosCalculados.map(item => `<span class="relatorio-vencimento-chip">${item.dias} dias: ${formatarDataBrRelatorio(item.data)}</span>`).join("")
      : "Informe a data de saída e o prazo.";
  }
  atualizarPreviaRelatorio();
}

function aplicarFormaPagamentoRelatorio(){
  const id = document.getElementById("gerFormaPagamento")?.value;
  const forma = gerFormasPagamento.find(item => item.id === id);
  const campo = document.getElementById("gerFormaPersonalizada");
  if(campo && forma) campo.value = forma.descricao || forma.nome || "";
  atualizarPreviaRelatorio();
}

function aplicarPrazoRelatorio(){
  const id = document.getElementById("gerPrazo")?.value;
  const prazo = gerPrazosPagamento.find(item => item.id === id);
  const campo = document.getElementById("gerPrazoPersonalizado");
  if(campo) campo.value = prazo ? (prazo.dias || []).join("/") : "";
  calcularVencimentosRelatorio();
}

function obterSaudacaoRelatorio(){
  return obterSaudacaoAutomaticaEmail();
}

function escaparComQuebrasRelatorio(texto){
  return escaparHtmlEmail(texto || "").replace(/\n/g,"<br>");
}


function numeroPorExtensoRelatorio(numero){
  const unidades = ["ZERO","UM","DOIS","TRÊS","QUATRO","CINCO","SEIS","SETE","OITO","NOVE","DEZ",
    "ONZE","DOZE","TREZE","QUATORZE","QUINZE","DEZESSEIS","DEZESSETE","DEZOITO","DEZENOVE","VINTE",
    "VINTE E UM","VINTE E DOIS","VINTE E TRÊS","VINTE E QUATRO","VINTE E CINCO","VINTE E SEIS",
    "VINTE E SETE","VINTE E OITO","VINTE E NOVE","TRINTA","QUARENTA E CINCO","SESSENTA","NOVENTA"];
  const especiais = {30:"TRINTA",45:"QUARENTA E CINCO",60:"SESSENTA",90:"NOVENTA"};
  return especiais[numero] || unidades[numero] || String(numero);
}

function calcularDescontoRelatorio(){
  const total = valorParaNumero(document.getElementById("gerValorTotal")?.value || 0);
  const percentual = Number(document.getElementById("gerDescontoPercentual")?.value || 0);
  const valorComDesconto = percentual > 0 ? total - (total * percentual / 100) : total;
  const campo = document.getElementById("gerValorComDesconto");
  if(campo) campo.value = percentual > 0 ? valorParaInput(valorComDesconto) : "";
  atualizarPreviaRelatorio();
}

function mensagemPagamentoAutomaticaRelatorio(d){
  const forma = (d.forma_pagamento || "").trim();
  const dias = normalizarDiasPrazoRelatorio(d.prazo_texto);
  const vencimentos = gerVencimentosCalculados.map(x => formatarDataBrRelatorio(x.data));
  const formaMinuscula = normalizarTexto(forma);
  const formaDescricao = forma || "depósito, transferência bancária ou PIX";

  let linha1 = "";
  if(vencimentos.length === 1){
    linha1 = `Data limite para pagamento: ${vencimentos[0]} via ${formaDescricao}. Contas bancárias listadas abaixo.`;
  }else if(vencimentos.length > 1){
    linha1 = `Datas limite para pagamento: ${vencimentos.join(" - ")} via ${formaDescricao}.`;
  }else{
    linha1 = `Forma de pagamento: ${formaDescricao}.`;
  }

  let linha2 = "";
  if(d.desconto_percentual > 0 && dias.length){
    const maiorPrazo = Math.max(...dias);
    linha2 = `Favor observar a data limite para pagamento, pois pedidos com desconto de ${String(d.desconto_percentual).replace(".",",")}% à vista têm no máximo ${maiorPrazo} (${numeroPorExtensoRelatorio(maiorPrazo)}) dias para pagamento após a data de saída da mercadoria.`;
  }else if(dias.length === 1){
    linha2 = `Favor observar a data limite para pagamento: o prazo é de ${dias[0]} (${numeroPorExtensoRelatorio(dias[0])}) dias após a data de saída da mercadoria.`;
  }else if(dias.length > 1){
    linha2 = `Favor observar as datas de vencimento correspondentes aos prazos de ${dias.join("/")} dias após a data de saída da mercadoria.`;
  }else if(formaMinuscula.includes("vista")){
    linha2 = "Favor observar a data limite para pagamento à vista.";
  }

  return {linha1, linha2};
}

function dadosGeradorRelatorio(){
  const formaSelecionada = gerFormasPagamento.find(x => x.id === document.getElementById("gerFormaPagamento")?.value);
  const prazoSelecionado = gerPrazosPagamento.find(x => x.id === document.getElementById("gerPrazo")?.value);
  return {
    id:document.getElementById("gerRelatorioId")?.value || null,
    cliente:document.getElementById("gerCliente")?.value.trim() || "",
    numero_nf:document.getElementById("gerNumeroNf")?.value.trim() || "",
    numero_pedido:document.getElementById("gerNumeroPedido")?.value.trim() || "",
    valor_pedido:valorParaNumero(document.getElementById("gerValorPedido")?.value || 0),
    valor_total:valorParaNumero(document.getElementById("gerValorTotal")?.value || 0),
    desconto_percentual:Number(document.getElementById("gerDescontoPercentual")?.value || 0),
    valor_com_desconto:valorParaNumero(document.getElementById("gerValorComDesconto")?.value || 0),
    data_emissao:document.getElementById("gerDataEmissao")?.value || null,
    data_saida:document.getElementById("gerDataSaida")?.value || null,
    transportadora:document.getElementById("gerTransportadora")?.value.trim() || "",
    forma_pagamento_id:formaSelecionada?.id || null,
    forma_pagamento:document.getElementById("gerFormaPersonalizada")?.value.trim() || formaSelecionada?.nome || "",
    prazo_id:prazoSelecionado?.id || null,
    prazo_texto:document.getElementById("gerPrazoPersonalizado")?.value.trim() || (prazoSelecionado?.dias || []).join("/"),
    vencimentos:gerVencimentosCalculados.map(x => x.data),
    texto_introducao:document.getElementById("gerTextoIntroducao")?.value.trim() || "",
    observacao_pagamento:document.getElementById("gerObservacaoPagamento")?.value.trim() || "",
    dados_bancarios:document.getElementById("gerDadosBancarios")?.value || "",
    criado_por:usuarioLogado?.login || ""
  };
}

function atualizarPreviaRelatorio(){
  const folha = document.getElementById("gerFolhaRelatorio");
  if(!folha) return;

  const d = dadosGeradorRelatorio();
  const assinatura = emailAssinaturaAtiva || null;
  const vencimentosTexto = gerVencimentosCalculados.length
    ? gerVencimentosCalculados.map(x => formatarDataBrRelatorio(x.data)).join(" - ")
    : "A definir";

  const forma = d.forma_pagamento || "A definir";
  const prazo = d.prazo_texto ? ` (${escaparHtmlEmail(d.prazo_texto)} dias)` : "";
  const mensagemAutomatica = mensagemPagamentoAutomaticaRelatorio(d);
  const observacaoManual = d.observacao_pagamento || "";
  const logo = assinatura?.logo_url
    ? `<img class="relatorio-folha-logo" src="${escaparHtmlEmail(assinatura.logo_url)}" alt="Sofisticatto">`
    : `<div style="text-align:center;font-size:28px;font-style:italic;color:#5a4fa3;margin-bottom:28px;">Sofisticatto<br><small style="font-size:10px;letter-spacing:5px;">COSMÉTICOS</small></div>`;

  const assinaturaHtml = assinatura ? `
    <div class="relatorio-assinatura-doc">
      <p>Atenciosamente,</p>
      ${assinatura.logo_url ? `<img src="${escaparHtmlEmail(assinatura.logo_url)}" alt="Logo">` : ""}
      <br><strong>${escaparHtmlEmail(assinatura.nome_remetente || "")}</strong>
      ${assinatura.setor ? `<br>${escaparHtmlEmail(assinatura.setor)}` : ""}
      ${assinatura.telefone_1 ? `<br>Contato: ${escaparHtmlEmail(assinatura.telefone_1)}${assinatura.telefone_2 ? " ou "+escaparHtmlEmail(assinatura.telefone_2) : ""}` : ""}
      ${assinatura.whatsapp ? `<br>WhatsApp: ${escaparHtmlEmail(assinatura.whatsapp)}` : ""}
      ${assinatura.email_exibido ? `<br>E-mail: ${escaparHtmlEmail(assinatura.email_exibido)}` : ""}
      ${assinatura.site ? `<br>Site: ${escaparHtmlEmail(assinatura.site)}` : ""}
    </div>` : "";

  folha.innerHTML = `
    ${logo}
    <p><strong>${escaparHtmlEmail(obterSaudacaoRelatorio())} (${escaparHtmlEmail(d.cliente || "NOME DO CLIENTE")})</strong></p>
    <p>${escaparHtmlEmail(d.texto_introducao || "Segue em anexo Pedido e Nota Fiscal da compra efetuada.")}</p>
    <ul>
      <li><strong>Número da Nota Fiscal:</strong> ${escaparHtmlEmail(d.numero_nf || "—")}</li>
      <li><strong>Número do Pedido:</strong> ${escaparHtmlEmail(d.numero_pedido || "—")}</li>
      <li><strong>Valor do Pedido:</strong> ${formatarMoeda(d.valor_pedido)}</li>
      <li><strong>Valor Total dos Pedidos:</strong> ${formatarMoeda(d.valor_total)}</li>
      ${d.desconto_percentual > 0 ? `<li><strong>Valor Total com ${String(d.desconto_percentual).replace(".",",")}% de desconto para pagamento à vista:</strong> ${formatarMoeda(d.valor_com_desconto)}</li>` : ""}
      <li><strong>Data de Faturamento:</strong> ${formatarDataBrRelatorio(d.data_emissao) || "—"}</li>
      <li><strong>Data da saída:</strong> ${formatarDataBrRelatorio(d.data_saida) || "—"}</li>
      <li><strong>Transportadora:</strong> ${escaparHtmlEmail(d.transportadora || "—")}</li>
      <li><strong>Forma de pagamento:</strong> ${escaparHtmlEmail(forma)}${prazo}</li>
      <li>${escaparHtmlEmail(mensagemAutomatica.linha1)}</li>
      ${mensagemAutomatica.linha2 ? `<li>${escaparHtmlEmail(mensagemAutomatica.linha2)}</li>` : ""}
      ${observacaoManual ? `<li>${escaparHtmlEmail(observacaoManual)}</li>` : ""}
    </ul>
    <h3>BANCOS / CONTAS PARA DEPÓSITO:</h3>
    <div>${escaparComQuebrasRelatorio(d.dados_bancarios)}</div>
    ${assinaturaHtml}
  `;
}

function mostrarSugestoesGerador(){
  const input = document.getElementById("gerCliente");
  const lista = document.getElementById("gerSugestoesClientes");
  if(!input || !lista) return;
  const termo = normalizarNomeEmail(input.value);
  const encontrados = emailClientes
    .filter(x => !termo || normalizarNomeEmail(x.nome).includes(termo))
    .slice(0,15);

  if(!encontrados.length){
    lista.innerHTML = "";
    lista.classList.remove("ativa");
    return;
  }
  lista.innerHTML = encontrados.map(item => `
    <div class="relatorio-sugestao" onmousedown="selecionarClienteGerador('${encodeURIComponent(item.nome)}')">
      <b>${escaparHtmlEmail(item.nome)}</b>
      <small>${(item.emails || []).map(escaparHtmlEmail).join("; ") || "Sem e-mail cadastrado"}</small>
    </div>`).join("");
  lista.classList.add("ativa");
}

function selecionarClienteGerador(nome){
  const input = document.getElementById("gerCliente");
  const lista = document.getElementById("gerSugestoesClientes");
  input.value = decodeURIComponent(nome);
  lista.classList.remove("ativa");
  input.focus();
  input.setSelectionRange(input.value.length,input.value.length);
  atualizarPreviaRelatorio();
}

document.addEventListener("click", evento => {
  const box = document.querySelector("#emailSubGerador .relatorio-sugestoes");
  if(box && !box.contains(evento.target)){
    document.getElementById("gerSugestoesClientes")?.classList.remove("ativa");
  }
});

async function carregarConfiguracoesRelatorio(){
  if(!banco || !usuarioLogado || usuarioLogado.tipo !== "financeiro") return;
  const [formas,prazos] = await Promise.all([
    banco.from("email_formas_pagamento").select("*").eq("ativo",true).order("nome"),
    banco.from("email_prazos_pagamento").select("*").eq("ativo",true).order("nome")
  ]);

  if(!formas.error) gerFormasPagamento = formas.data || [];
  if(!prazos.error) gerPrazosPagamento = prazos.data || [];

  montarSelectsConfiguracaoRelatorio();
}

function montarSelectsConfiguracaoRelatorio(){
  const forma = document.getElementById("gerFormaPagamento");
  const prazo = document.getElementById("gerPrazo");
  if(forma){
    const atual = forma.value;
    forma.innerHTML = `<option value="">Selecione...</option>` + gerFormasPagamento.map(x => `<option value="${x.id}">${escaparHtmlEmail(x.nome)}</option>`).join("");
    if(gerFormasPagamento.some(x => x.id === atual)) forma.value = atual;
  }
  if(prazo){
    const atual = prazo.value;
    prazo.innerHTML = `<option value="">Selecione...</option>` + gerPrazosPagamento.map(x => `<option value="${x.id}">${escaparHtmlEmail(x.nome)}</option>`).join("");
    if(gerPrazosPagamento.some(x => x.id === atual)) prazo.value = atual;
  }

  const listaFormas = document.getElementById("gerListaFormas");
  const listaPrazos = document.getElementById("gerListaPrazos");
  if(listaFormas) listaFormas.innerHTML = gerFormasPagamento.map(x => `<span class="badge" style="margin:3px;">${escaparHtmlEmail(x.nome)}</span>`).join("") || "Nenhuma forma cadastrada.";
  if(listaPrazos) listaPrazos.innerHTML = gerPrazosPagamento.map(x => `<span class="badge" style="margin:3px;">${escaparHtmlEmail(x.nome)}</span>`).join("") || "Nenhum prazo cadastrado.";
}

async function cadastrarFormaPagamentoRelatorio(){
  const nome = document.getElementById("gerNovaFormaNome").value.trim();
  const descricao = document.getElementById("gerNovaFormaDescricao").value.trim();
  if(!nome){ alert("Informe o nome da forma de pagamento."); return; }
  const r = await banco.from("email_formas_pagamento").insert([{nome,descricao,ativo:true,criado_por:usuarioLogado.login}]);
  if(r.error){ alert("Erro ao cadastrar: "+r.error.message); return; }
  document.getElementById("gerNovaFormaNome").value = "";
  document.getElementById("gerNovaFormaDescricao").value = "";
  await carregarConfiguracoesRelatorio();
}

async function cadastrarPrazoRelatorio(){
  const nome = document.getElementById("gerNovoPrazoNome").value.trim();
  const dias = normalizarDiasPrazoRelatorio(document.getElementById("gerNovoPrazoDias").value);
  if(!nome || !dias.length){ alert("Informe o nome e pelo menos um número de dias."); return; }
  const r = await banco.from("email_prazos_pagamento").insert([{nome,dias,ativo:true,criado_por:usuarioLogado.login}]);
  if(r.error){ alert("Erro ao cadastrar: "+r.error.message); return; }
  document.getElementById("gerNovoPrazoNome").value = "";
  document.getElementById("gerNovoPrazoDias").value = "";
  await carregarConfiguracoesRelatorio();
}

async function salvarRelatorioCliente(){
  const d = dadosGeradorRelatorio();
  if(!d.cliente){ alert("Informe o nome do cliente."); return; }
  if(!d.data_saida){ alert("Informe a data de saída."); return; }

  const payload = {...d,atualizado_em:new Date().toISOString()};
  delete payload.id;
  const id = document.getElementById("gerRelatorioId").value;
  const r = id
    ? await banco.from("email_relatorios_clientes").update(payload).eq("id",id)
    : await banco.from("email_relatorios_clientes").insert([payload]);

  if(r.error){ alert("Erro ao salvar relatório: "+r.error.message); return; }
  alert("Relatório salvo com sucesso!");
  document.getElementById("gerRelatorioId").value = "";
  await carregarRelatoriosClientes();
}

async function carregarRelatoriosClientes(){
  if(!banco || !usuarioLogado || usuarioLogado.tipo !== "financeiro") return;
  const r = await banco.from("email_relatorios_clientes").select("*").order("created_at",{ascending:false}).limit(300);
  if(r.error){
    console.error("Erro ao carregar relatórios:",r.error);
    return;
  }
  gerRelatoriosSalvos = r.data || [];
  const tabela = document.getElementById("gerTabelaHistorico");
  if(!tabela) return;
  tabela.innerHTML = gerRelatoriosSalvos.length ? gerRelatoriosSalvos.map(x => `
    <tr>
      <td>${new Date(x.created_at).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEmail(x.cliente)}</td>
      <td>${escaparHtmlEmail(x.numero_nf || "")}</td>
      <td>${escaparHtmlEmail(x.numero_pedido || "")}</td>
      <td>${formatarMoeda(x.valor_total || 0)}</td>
      <td>${formatarDataBrRelatorio(x.data_saida)}</td>
      <td>${(x.vencimentos || []).map(formatarDataBrRelatorio).join("<br>")}</td>
      <td class="relatorio-historico-acoes">
        <button class="btn azul" onclick="editarRelatorioCliente('${x.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirRelatorioCliente('${x.id}')">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="8">Nenhum relatório salvo.</td></tr>`;
}

function editarRelatorioCliente(id){
  const x = gerRelatoriosSalvos.find(item => item.id === id);
  if(!x) return;
  document.getElementById("gerRelatorioId").value = x.id;
  document.getElementById("gerCliente").value = x.cliente || "";
  document.getElementById("gerNumeroNf").value = x.numero_nf || "";
  document.getElementById("gerNumeroPedido").value = x.numero_pedido || "";
  document.getElementById("gerValorPedido").value = valorParaInput(x.valor_pedido || 0);
  document.getElementById("gerValorTotal").value = valorParaInput(x.valor_total || 0);
  document.getElementById("gerDescontoPercentual").value = x.desconto_percentual || "";
  document.getElementById("gerValorComDesconto").value = x.desconto_percentual > 0 ? valorParaInput(x.valor_com_desconto || 0) : "";
  document.getElementById("gerDataEmissao").value = x.data_emissao || "";
  document.getElementById("gerDataSaida").value = x.data_saida || "";
  document.getElementById("gerTransportadora").value = x.transportadora || "";
  document.getElementById("gerFormaPagamento").value = x.forma_pagamento_id || "";
  document.getElementById("gerPrazo").value = x.prazo_id || "";
  document.getElementById("gerFormaPersonalizada").value = x.forma_pagamento || "";
  document.getElementById("gerPrazoPersonalizado").value = x.prazo_texto || "";
  document.getElementById("gerTextoIntroducao").value = x.texto_introducao || "";
  document.getElementById("gerObservacaoPagamento").value = x.observacao_pagamento || "";
  document.getElementById("gerDadosBancarios").value = x.dados_bancarios || "";
  calcularVencimentosRelatorio();
  atualizarPreviaRelatorio();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function excluirRelatorioCliente(id){
  if(!confirm("Excluir este relatório salvo?")) return;
  const r = await banco.from("email_relatorios_clientes").delete().eq("id",id);
  if(r.error){ alert("Erro ao excluir: "+r.error.message); return; }
  carregarRelatoriosClientes();
}

function limparGeradorRelatorio(){
  document.getElementById("gerRelatorioId").value = "";
  ["gerCliente","gerNumeroNf","gerNumeroPedido","gerValorPedido","gerValorTotal","gerDescontoPercentual","gerValorComDesconto","gerTransportadora","gerFormaPersonalizada","gerPrazoPersonalizado"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("gerFormaPagamento").value = "";
  document.getElementById("gerPrazo").value = "";
  document.getElementById("gerDataEmissao").value = dataHojeInputRelatorio();
  document.getElementById("gerDataSaida").value = dataHojeInputRelatorio();
  gerVencimentosCalculados = [];
  calcularVencimentosRelatorio();
  atualizarPreviaRelatorio();
}

function nomeArquivoRelatorio(){
  const cliente = (document.getElementById("gerCliente")?.value || "relatorio")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  return `RELATORIO_${cliente || "CLIENTE"}`;
}

async function carregarBibliotecaJsPdfRelatorio(){
  if(window.jspdf?.jsPDF) return;

  await new Promise((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca de PDF."));
    document.head.appendChild(script);
  });
}

async function imagemUrlParaDataUrlRelatorio(url){
  if(!url) return "";

  try{
    const resposta = await fetch(url,{cache:"no-store"});
    if(!resposta.ok) throw new Error("Imagem não encontrada");
    const blob = await resposta.blob();

    return await new Promise((resolve,reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.onerror = reject;
      leitor.readAsDataURL(blob);
    });
  }catch(erro){
    console.warn("Não foi possível incorporar a logo:",erro);
    return "";
  }
}

function conteudoTextoRelatorioExportacao(){
  atualizarPreviaRelatorio();

  const d = dadosGeradorRelatorio();
  const assinatura = emailAssinaturaAtiva || null;
  const mensagem = mensagemPagamentoAutomaticaRelatorio(d);
  const linhas = [];

  linhas.push(`${obterSaudacaoRelatorio()} (${d.cliente || "NOME DO CLIENTE"})`);
  linhas.push("");
  linhas.push(d.texto_introducao || "Segue em anexo Pedido e Nota Fiscal da compra efetuada.");
  linhas.push("");
  linhas.push(`Número da Nota Fiscal: ${d.numero_nf || "—"}`);
  linhas.push(`Número do Pedido: ${d.numero_pedido || "—"}`);
  linhas.push(`Valor do Pedido: ${formatarMoeda(d.valor_pedido)}`);
  linhas.push(`Valor Total dos Pedidos: ${formatarMoeda(d.valor_total)}`);

  if(d.desconto_percentual > 0){
    linhas.push(`Valor Total com ${String(d.desconto_percentual).replace(".",",")}% de desconto para pagamento à vista: ${formatarMoeda(d.valor_com_desconto)}`);
  }

  linhas.push(`Data de Faturamento: ${formatarDataBrRelatorio(d.data_emissao) || "—"}`);
  linhas.push(`Data da saída: ${formatarDataBrRelatorio(d.data_saida) || "—"}`);
  linhas.push(`Transportadora: ${d.transportadora || "—"}`);
  linhas.push(`Forma de pagamento: ${d.forma_pagamento || "A definir"}${d.prazo_texto ? ` (${d.prazo_texto} dias)` : ""}`);
  linhas.push(mensagem.linha1);

  if(mensagem.linha2) linhas.push(mensagem.linha2);
  if(d.observacao_pagamento) linhas.push(d.observacao_pagamento);

  linhas.push("");
  linhas.push("BANCOS / CONTAS PARA DEPÓSITO:");
  linhas.push("");
  String(d.dados_bancarios || "").split("\n").forEach(linha => linhas.push(linha));

  if(assinatura){
    linhas.push("");
    linhas.push("");
    linhas.push("Atenciosamente,");
    linhas.push(assinatura.nome_remetente || "");
    if(assinatura.setor) linhas.push(assinatura.setor);

    const contatos = [assinatura.telefone_1,assinatura.telefone_2].filter(Boolean);
    if(contatos.length) linhas.push(`Contatos: ${contatos.join(" ou ")}`);
    if(assinatura.whatsapp) linhas.push(`WhatsApp: ${assinatura.whatsapp}`);
    if(assinatura.email_exibido) linhas.push(`E-mail: ${assinatura.email_exibido}`);
    if(assinatura.site) linhas.push(`Site: ${assinatura.site}`);
  }

  return {dados:d,assinatura,linhas};
}

function htmlRelatorioExportacao(logoDataUrl=""){
  const {dados:d,assinatura} = conteudoTextoRelatorioExportacao();
  const mensagem = mensagemPagamentoAutomaticaRelatorio(d);

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="display:block;max-width:180px;max-height:90px;margin:0 auto 28px;">`
    : `<div style="text-align:center;color:#5a4fa3;font-size:28px;font-style:italic;margin-bottom:28px;">Sofisticatto<br><span style="font-size:10px;letter-spacing:5px;">COSMÉTICOS</span></div>`;

  const assinaturaHtml = assinatura ? `
    <div style="margin-top:32px;">
      <p>Atenciosamente,</p>
      <strong style="font-size:16px;">${escaparHtmlEmail(assinatura.nome_remetente || "")}</strong>
      ${assinatura.setor ? `<br>${escaparHtmlEmail(assinatura.setor)}` : ""}
      ${(assinatura.telefone_1 || assinatura.telefone_2) ? `<br>Contatos: ${[assinatura.telefone_1,assinatura.telefone_2].filter(Boolean).map(escaparHtmlEmail).join(" ou ")}` : ""}
      ${assinatura.whatsapp ? `<br>WhatsApp: ${escaparHtmlEmail(assinatura.whatsapp)}` : ""}
      ${assinatura.email_exibido ? `<br>E-mail: ${escaparHtmlEmail(assinatura.email_exibido)}` : ""}
      ${assinatura.site ? `<br>Site: ${escaparHtmlEmail(assinatura.site)}` : ""}
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page{size:A4;margin:14mm}
body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#171717}
.folha{box-sizing:border-box;width:100%;min-height:267mm;padding:12mm 14mm;border:2mm solid #c69af5;font-size:11pt;line-height:1.35}
p{margin:7px 0}ul{margin:8px 0 18px 22px}li{margin:4px 0}h3{font-size:12pt;text-decoration:underline;margin:20px 0 8px}
</style>
</head>
<body>
<div class="folha">
  ${logoHtml}
  <p><strong>${escaparHtmlEmail(obterSaudacaoRelatorio())} (${escaparHtmlEmail(d.cliente || "NOME DO CLIENTE")})</strong></p>
  <p>${escaparHtmlEmail(d.texto_introducao || "Segue em anexo Pedido e Nota Fiscal da compra efetuada.")}</p>
  <ul>
    <li><strong>Número da Nota Fiscal:</strong> ${escaparHtmlEmail(d.numero_nf || "—")}</li>
    <li><strong>Número do Pedido:</strong> ${escaparHtmlEmail(d.numero_pedido || "—")}</li>
    <li><strong>Valor do Pedido:</strong> ${formatarMoeda(d.valor_pedido)}</li>
    <li><strong>Valor Total dos Pedidos:</strong> ${formatarMoeda(d.valor_total)}</li>
    ${d.desconto_percentual > 0 ? `<li><strong>Valor Total com ${String(d.desconto_percentual).replace(".",",")}% de desconto para pagamento à vista:</strong> ${formatarMoeda(d.valor_com_desconto)}</li>` : ""}
    <li><strong>Data de Faturamento:</strong> ${formatarDataBrRelatorio(d.data_emissao) || "—"}</li>
    <li><strong>Data da saída:</strong> ${formatarDataBrRelatorio(d.data_saida) || "—"}</li>
    <li><strong>Transportadora:</strong> ${escaparHtmlEmail(d.transportadora || "—")}</li>
    <li><strong>Forma de pagamento:</strong> ${escaparHtmlEmail(d.forma_pagamento || "A definir")}${d.prazo_texto ? ` (${escaparHtmlEmail(d.prazo_texto)} dias)` : ""}</li>
    <li>${escaparHtmlEmail(mensagem.linha1)}</li>
    ${mensagem.linha2 ? `<li>${escaparHtmlEmail(mensagem.linha2)}</li>` : ""}
    ${d.observacao_pagamento ? `<li>${escaparHtmlEmail(d.observacao_pagamento)}</li>` : ""}
  </ul>
  <h3>BANCOS / CONTAS PARA DEPÓSITO:</h3>
  <div style="white-space:pre-line;">${escaparHtmlEmail(d.dados_bancarios || "")}</div>
  ${assinaturaHtml}
</div>
</body>
</html>`;
}

async function gerarDocumentoPdfRelatorio(){
  await carregarBibliotecaJsPdfRelatorio();

  const {jsPDF} = window.jspdf;
  const {assinatura,linhas} = conteudoTextoRelatorioExportacao();
  const doc = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});

  const margemX = 22;
  const larguraTexto = 166;
  const alturaPagina = 297;
  let y = 18;

  doc.setDrawColor(198,154,245);
  doc.setLineWidth(1.5);
  doc.rect(7,7,196,283);

  const logoDataUrl = await imagemUrlParaDataUrlRelatorio(assinatura?.logo_url || "");
  if(logoDataUrl){
    const formato = String(logoDataUrl).startsWith("data:image/png") ? "PNG" : "JPEG";
    doc.addImage(logoDataUrl,formato,77,14,56,24,undefined,"FAST");
    y = 46;
  }else{
    doc.setTextColor(90,79,163);
    doc.setFont("helvetica","italic");
    doc.setFontSize(23);
    doc.text("Sofisticatto",105,26,{align:"center"});
    doc.setFontSize(8);
    doc.text("C O S M É T I C O S",105,32,{align:"center"});
    doc.setTextColor(20,20,20);
    y = 44;
  }

  doc.setFont("helvetica","normal");
  doc.setFontSize(10.5);

  function novaPagina(){
    doc.addPage();
    doc.setDrawColor(198,154,245);
    doc.setLineWidth(1.5);
    doc.rect(7,7,196,283);
    y = 18;
  }

  for(const linhaOriginal of linhas){
    const linha = String(linhaOriginal ?? "");

    if(linha === ""){
      y += 4;
      continue;
    }

    const partes = doc.splitTextToSize(linha,larguraTexto);
    const alturaNecessaria = partes.length * 5.2;

    if(y + alturaNecessaria > alturaPagina - 18){
      novaPagina();
    }

    const negrito = /^(BANCOS \/ CONTAS|Número da|Valor |Data |Transportadora|Forma de pagamento|Atenciosamente)/i.test(linha);
    doc.setFont("helvetica",negrito ? "bold" : "normal");
    doc.text(partes,margemX,y);
    y += alturaNecessaria;
  }

  return doc;
}

async function baixarRelatorioPDF(){
  try{
    const doc = await gerarDocumentoPdfRelatorio();
    doc.save(nomeArquivoRelatorio()+".pdf");
  }catch(erro){
    console.error("Erro ao gerar PDF:",erro);
    alert("Não foi possível gerar o PDF: "+erro.message);
  }
}

async function adicionarRelatorioAoEnvio(){
  try{
    const cliente = document.getElementById("gerCliente")?.value.trim() || "";
    if(!cliente){
      alert("Informe o nome do cliente antes de adicionar o relatório ao envio.");
      return;
    }

    const doc = await gerarDocumentoPdfRelatorio();
    const blob = doc.output("blob");

    const numeroPedido = document.getElementById("gerNumeroPedido")?.value.trim();
    const numeroNf = document.getElementById("gerNumeroNf")?.value.trim();

    let descricao = "Relatorio";
    if(numeroPedido) descricao += `_Pedido_${numeroPedido}`;
    if(numeroNf) descricao += `_NF_${numeroNf}`;

    const nomeArquivo = `${cliente} - ${descricao}.pdf`;
    const arquivoPdf = new File([blob],nomeArquivo,{type:"application/pdf",lastModified:Date.now()});

    const chaveArquivo = chaveArquivoEmail(arquivoPdf);
    const jaExiste = emailArquivosSelecionados.some(item => chaveArquivoEmail(item) === chaveArquivo);

    if(!jaExiste){
      adicionarArquivosEmail([arquivoPdf]);
    }else{
      prepararEnviosEmail();
    }

    mostrarAbaEmail("preparar");

    mostrarAvisoEmail(
      jaExiste
        ? `O relatório de ${cliente} já estava na preparação de envio.`
        : `Relatório de ${cliente} adicionado à preparação de envio. Agora você pode acrescentar outros arquivos; eles serão unidos ao mesmo cliente.`,
      true
    );

    document.getElementById("emailSubPreparar")?.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(erro){
    console.error("Erro ao adicionar relatório ao envio:",erro);
    alert("Não foi possível adicionar o relatório ao envio: "+erro.message);
  }
}

async function baixarRelatorioWord(){
  try{
    atualizarPreviaRelatorio();

    const assinatura = emailAssinaturaAtiva || null;
    const logoDataUrl = await imagemUrlParaDataUrlRelatorio(assinatura?.logo_url || "");
    const conteudo = htmlRelatorioExportacao(logoDataUrl);

    const blob = new Blob(["\ufeff",conteudo],{
      type:"application/msword;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivoRelatorio()+".doc";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url),3000);
  }catch(erro){
    console.error("Erro ao gerar Word:",erro);
    alert("Não foi possível gerar o Word: "+erro.message);
  }
}

function imprimirRelatorioCliente(){
  const folha = document.getElementById("gerFolhaRelatorio");
  const janela = window.open("","_blank","width=900,height=900");
  janela.document.write(`<!DOCTYPE html><html><head><title>${nomeArquivoRelatorio()}</title><style>
    @page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}
    .relatorio-folha{box-sizing:border-box;width:210mm;min-height:297mm;padding:15mm 17mm;border:2mm solid #c69af5;font-size:11pt;line-height:1.35}
    .relatorio-folha-logo{display:block;max-width:50mm;max-height:25mm;object-fit:contain;margin:0 auto 8mm}
    h3{text-decoration:underline}li{margin:2mm 0}.relatorio-assinatura-doc{margin-top:10mm}.relatorio-assinatura-doc img{max-width:45mm}
  </style></head><body><div class="relatorio-folha">${folha.innerHTML}</div><script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
  janela.document.close();
}
