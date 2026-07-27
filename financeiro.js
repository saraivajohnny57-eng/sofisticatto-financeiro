const SUPABASE_URL = "https://drtgtwwsbxrmqcaabzcs.supabase.co";
const SUPABASE_KEY = "sb_publishable_h0Ep974nBED88dimAY0BGQ_KLqoQ7po";
let banco = null;
let realtimeIniciado = false;
let registroNotificacaoMobile = null;
let monitoramentoPerfilIntervalo = null;
let ultimaNotificacaoPerfilId = null;
let monitoramentoPerfilPreparado = false;


async function prepararNotificacaoMobile(){
  if(!("serviceWorker" in navigator)) return null;

  try{
    registroNotificacaoMobile=await navigator.serviceWorker.register(
      "/service-worker-notificacoes.js?v=2",
      {scope:"/"}
    );

    await registroNotificacaoMobile.update();
    registroNotificacaoMobile=await navigator.serviceWorker.ready;

    console.log("Service Worker de notificações ativo:",registroNotificacaoMobile.scope);
    return registroNotificacaoMobile;
  }catch(erro){
    console.warn("Não foi possível registrar o Service Worker de notificações:",erro);
    return null;
  }
}

let realtimeNotificacoesIniciado = false;
let notificacoesSistema = [];


function carregarSupabase(){
  return new Promise((resolve, reject) => {
    if(window.supabase){
      banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    script.onload = () => {
      if(window.supabase){
        banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        resolve();
      }else{
        reject(new Error("Supabase não carregou"));
      }
    };
    script.onerror = () => reject(new Error("Falha ao carregar Supabase"));
    document.head.appendChild(script);

    setTimeout(() => {
      if(!banco) reject(new Error("Tempo limite ao carregar Supabase"));
    }, 15000);
  });
}

function bancoPronto(){
  if(banco) return true;
  alert("O sistema ainda está conectando. Aguarde alguns segundos e tente novamente.");
  return false;
}

function mostrarCarregando(texto){
  const box = document.getElementById("carregandoSistema");
  if(!box) return;
  box.innerHTML = texto || "Carregando...";
  box.style.display = "block";
}

function esconderCarregando(){
  const box = document.getElementById("carregandoSistema");
  if(box) box.style.display = "none";
}

let usuarioLogado = null;
let grafico = null;
let listaBancos = [];
let todosBoletos = [];
let filtroDashboard = "data";
let filtroHistorico = "semana";
let dataDashboardEspecifica = formatarDataInput(new Date());
let dataDashboardInicio = formatarDataInput(new Date());
let dataDashboardFim = formatarDataInput(new Date());
let dataHistoricoEspecifica = "";
let filtroNomeHistorico = "";
let sistemaJaCarregado = false;
let timerAtualizacaoTempoReal = null;
let intervaloSincronizacao = null;
let bancosJaCarregados = false;
let notificacoesRecebidas = new Set();
let atualizacaoPendenteEnquantoEdita = false;
let formularioRelatorioAlterado = false;

async function entrar(){
  if(!bancoPronto()) return;
  const login = document.getElementById("login").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const resposta = await banco.from("usuarios").select("*").eq("login", login).eq("senha", senha).single();

  if(resposta.error || !resposta.data){
    alert("Login ou senha inválidos");
    return;
  }

  usuarioLogado = resposta.data;
  localStorage.setItem("usuarioLogado", JSON.stringify(usuarioLogado));
  iniciarSistema();
}

function iniciarSistema(){
  document.getElementById("loginTela").style.display = "none";
  document.getElementById("usuarioInfo").innerHTML = "Usuário: <b>" + usuarioLogado.login + "</b><br>Tipo: <b>" + usuarioLogado.tipo + "</b>";
  atualizarBotaoNotificacao();
  document.getElementById("btnAdmin").style.display = usuarioLogado.tipo === "admin" ? "block" : "none";
  document.getElementById("btnEnvioDocumentos").style.display = usuarioLogado.tipo === "financeiro" ? "block" : "none";
  document.getElementById("boxNovoRelatorio").style.display = usuarioLogado.tipo === "banco" ? "none" : "block";
  mostrarDashboardHoje();
  mostrarSecao("dashboard");
  carregarRelatorios();
  carregarUsuarios();

  if(usuarioLogado.tipo === "financeiro"){
    carregarVendedorasEmail().then(() => carregarClientesEmail()).catch(erro => {
      console.error("Não foi possível carregar a lista rápida de clientes:", erro);
    });
  }
}

function mostrarSecao(secao){
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("relatorios").style.display = "none";
  document.getElementById("historico").style.display = "none";
  document.getElementById("admin").style.display = "none";
  document.getElementById("envioDocumentos").style.display = "none";

  if(secao === "envioDocumentos" && (!usuarioLogado || usuarioLogado.tipo !== "financeiro")){
    alert("Somente o usuário Financeiro pode acessar esta área.");
    secao = "dashboard";
  }

  document.getElementById(secao).style.display = "block";
  if(secao === "envioDocumentos") carregarModuloEmail();
}

function sair(){ localStorage.removeItem("usuarioLogado"); location.reload(); }

async function carregarBancos(){
  const resposta = await banco.from("bancos").select("*").order("nome",{ascending:true});
  if(resposta.error) return;
  listaBancos = resposta.data || [];
  bancosJaCarregados = true;
  const tabela = document.getElementById("tabelaBancos");
  if(!tabela) return;
  tabela.innerHTML = "";
  listaBancos.forEach(item => {
    tabela.innerHTML += `<tr><td>${item.nome || ""}</td><td><div class="cor-box" style="background:${item.cor || "#5a4fa3"}"></div></td><td><button class="btn vermelho" onclick="excluirBanco('${item.id}')">Excluir</button></td></tr>`;
  });
}

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
  const botao=document.getElementById("btnNotificacao");
  if(!botao) return;

  const ativo=
    "Notification" in window &&
    Notification.permission==="granted" &&
    localStorage.getItem("sofisticatto_notificacoes_ativas")==="1";

  botao.textContent=ativo ? "Notificação ativada ✅" : "Ativar notificação";
  botao.classList.toggle("ativo",ativo);
}

async function solicitarPermissaoNotificacao(){
  if(!("Notification" in window)){
    alert("Este navegador não suporta notificações.");
    return;
  }

  try{
    const permissao=await Notification.requestPermission();

    if(permissao!=="granted"){
      localStorage.removeItem("sofisticatto_notificacoes_ativas");
      alert("A permissão de notificações não foi concedida.");
      atualizarBotaoNotificacao();
      return;
    }

    localStorage.setItem("sofisticatto_notificacoes_ativas","1");

    const registro=await prepararNotificacaoMobile();

    if(registro && registro.showNotification){
      await registro.showNotification("Sofisticatto Financeiro",{
        body:"Notificações ativadas neste dispositivo.",
        tag:"sofisticatto-teste",
        renotify:true,
        data:{url:"/"}
      });
    }else{
      new Notification("Sofisticatto Financeiro",{
        body:"Notificações ativadas neste dispositivo.",
        tag:"sofisticatto-teste"
      });
    }

    mostrarBalaoSistema(
      "Notificações ativadas",
      "Uma notificação de teste foi enviada para este dispositivo."
    );

    alert(
      "Notificações ativadas. Uma mensagem de teste foi enviada. " +
      "Caso ela não apareça, confira nas configurações do Android se o Chrome pode mostrar notificações."
    );

    atualizarBotaoNotificacao();
  }catch(erro){
    console.error("Erro ao ativar notificações:",erro);
    alert("Não foi possível ativar notificações neste dispositivo: "+(erro.message || erro));
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

async function notificarChrome(titulo,mensagem){
  if(!("Notification" in window)) return;
  if(Notification.permission!=="granted") return;
  if(localStorage.getItem("sofisticatto_notificacoes_ativas")!=="1") return;

  try{
    const registro=
      registroNotificacaoMobile ||
      await prepararNotificacaoMobile();

    if(registro && registro.showNotification){
      await registro.showNotification(titulo,{
        body:mensagem,
        tag:`sofisticatto-${Date.now()}`,
        renotify:true,
        data:{url:"/"}
      });
      return;
    }

    const notificacao=new Notification(titulo,{
      body:mensagem,
      tag:`sofisticatto-${Date.now()}`,
      renotify:true
    });

    notificacao.onclick=()=>{
      window.focus();
      mostrarSecao("relatorios");
      notificacao.close();
    };
  }catch(erro){
    console.warn("Não foi possível mostrar a notificação:",erro);
  }
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


async function sincronizarPerfilImediatamente(mostrarAvisos=true){
  if(!banco || !usuarioLogado) return;
  if(!["banco","financeiro","admin"].includes(usuarioLogado.tipo)) return;

  const perfilConsulta=usuarioLogado.tipo==="admin" ? "financeiro" : usuarioLogado.tipo;

  try{
    const resposta=await banco
      .from("notificacoes_sistema")
      .select("*")
      .eq("destinatario_tipo",perfilConsulta)
      .order("id",{ascending:false})
      .limit(20);

    if(resposta.error){
      console.warn("Falha ao consultar notificações do perfil:",resposta.error.message);
      return;
    }

    const registros=resposta.data || [];
    const maiorId=registros.length ? Number(registros[0].id) : 0;

    if(!monitoramentoPerfilPreparado){
      ultimaNotificacaoPerfilId=maiorId;
      monitoramentoPerfilPreparado=true;
      await carregarRelatorios(true);
      await carregarNotificacoesPersistentes();
      return;
    }

    const novas=registros
      .filter(item=>Number(item.id)>Number(ultimaNotificacaoPerfilId || 0))
      .sort((a,b)=>Number(a.id)-Number(b.id));

    if(novas.length){
      ultimaNotificacaoPerfilId=Math.max(...novas.map(item=>Number(item.id)));

      await carregarRelatorios(true);
      await carregarNotificacoesPersistentes();

      if(mostrarAvisos){
        for(const item of novas){
          await notificarChrome(
            item.titulo || "Sofisticatto Financeiro",
            item.mensagem || "Existe uma nova atualização."
          );
        }
      }
    }else{
      await carregarRelatorios(true);
    }
  }catch(erro){
    console.warn("Erro no monitoramento alternativo do perfil:",erro);
  }
}

function iniciarMonitoramentoPerfilFallback(){
  if(!usuarioLogado) return;
  if(!["banco","financeiro","admin"].includes(usuarioLogado.tipo)) return;

  if(monitoramentoPerfilIntervalo){
    clearInterval(monitoramentoPerfilIntervalo);
  }

  monitoramentoPerfilPreparado=false;
  sincronizarPerfilImediatamente(false);

  monitoramentoPerfilIntervalo=setInterval(()=>{
    sincronizarPerfilImediatamente(true);
  },4000);
}

document.addEventListener("visibilitychange",()=>{
  if(!document.hidden && usuarioLogado){
    sincronizarPerfilImediatamente(true);
  }
});

window.addEventListener("focus",()=>{
  if(usuarioLogado){
    sincronizarPerfilImediatamente(true);
  }
});

async function carregarNotificacoesPersistentes(){
  if(!banco || !usuarioLogado) return;

  try{
    const resposta=await banco
      .from("notificacoes_sistema")
      .select("*")
      .eq("destinatario_tipo",usuarioLogado.tipo==="admin" ? "financeiro" : usuarioLogado.tipo)
      .order("created_at",{ascending:false})
      .limit(30);

    if(resposta.error){
      console.warn("Tabela notificacoes_sistema ainda não disponível:",resposta.error.message);
      notificacoesSistema=[];
      carregarNotificacoes();
      return;
    }

    notificacoesSistema=resposta.data || [];
    carregarNotificacoes();
  }catch(erro){
    console.warn("Não foi possível carregar notificações persistentes:",erro);
  }
}

async function marcarNotificacoesComoLidas(){
  if(!banco || !usuarioLogado) return;

  const ids=notificacoesSistema
    .filter(item=>!item.lida)
    .map(item=>item.id);

  if(ids.length){
    const resposta=await banco
      .from("notificacoes_sistema")
      .update({lida:true,lida_em:new Date().toISOString()})
      .in("id",ids);

    if(resposta.error){
      console.warn("Não foi possível marcar notificações como lidas:",resposta.error.message);
    }
  }

  notificacoesSistema=notificacoesSistema.map(item=>({
    ...item,
    lida:true,
    lida_em:item.lida_em || new Date().toISOString()
  }));

  carregarNotificacoes();
}

function abrirRelatoriosPelaNotificacao(){
  mostrarSecao("relatorios");
  marcarNotificacoesComoLidas();
}

function iniciarRealtimeNotificacoes(){
  if(realtimeNotificacoesIniciado || !banco || !usuarioLogado) return;
  realtimeNotificacoesIniciado=true;

  banco
    .channel("notificacoes-sistema-"+usuarioLogado.tipo)
    .on(
      "postgres_changes",
      {
        event:"INSERT",
        schema:"public",
        table:"notificacoes_sistema",
        filter:`destinatario_tipo=eq.${usuarioLogado.tipo}`
      },
      payload=>{
        const nova=payload.new;
        if(!nova) return;

        notificacoesSistema=[
          nova,
          ...notificacoesSistema.filter(item=>item.id!==nova.id)
        ].slice(0,30);

        if(["banco","financeiro","admin"].includes(usuarioLogado.tipo)){
          ultimaNotificacaoPerfilId=Math.max(
            Number(ultimaNotificacaoPerfilId || 0),
            Number(nova.id || 0)
          );

          notificarChrome(
            nova.titulo || "Sofisticatto Financeiro",
            nova.mensagem || "Existe uma nova atualização."
          );

          carregarRelatorios(true);
          carregarNotificacoesPersistentes();
        }

        carregarNotificacoes();
      }
    )
    .subscribe(status=>{
      console.log("Realtime notificações:",status);
      if(status==="CHANNEL_ERROR" || status==="TIMED_OUT"){
        console.warn("Não foi possível iniciar o Realtime das notificações.");
      }
    });
}

function carregarNotificacoes(){
  const lista=document.getElementById("listaNotificacoes");
  const contador=document.getElementById("contadorNotificacoes");
  if(!lista || !contador || !usuarioLogado) return;

  const naoLidas=notificacoesSistema.filter(item=>!item.lida);
  let totalPendentes=0;
  let resumo="";

  if(usuarioLogado.tipo==="banco"){
    const pendentes=todosBoletos.filter(item=>item.status!=="Finalizado" && !item.banco);
    totalPendentes=pendentes.length;
    resumo=totalPendentes>0
      ? `Existem <b>${totalPendentes}</b> boletos aguardando banco.`
      : "Nenhum boleto aguardando banco.";
  }

  if(usuarioLogado.tipo==="financeiro" || usuarioLogado.tipo==="admin"){
    const aguardando=todosBoletos.filter(item=>item.status!=="Finalizado" && item.banco);
    totalPendentes=aguardando.length;
    resumo=totalPendentes>0
      ? `Existem <b>${totalPendentes}</b> boletos aguardando finalização.`
      : "Nenhum boleto aguardando finalização.";
  }

  contador.textContent=naoLidas.length || totalPendentes;

  const recentes=naoLidas.slice(0,4).map(item=>`
    <div class="notificacao-item notificacao-nova" onclick="abrirRelatoriosPelaNotificacao()">
      <b>${escaparHtmlEmail(item.titulo || "Notificação")}</b>
      <span>${escaparHtmlEmail(item.mensagem || "")}</span>
      <small>${item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "Agora"}</small>
    </div>
  `).join("");

  lista.innerHTML=`
    ${recentes}
    <div class="notificacao-item" onclick="abrirRelatoriosPelaNotificacao()">🔔 ${resumo}</div>
    ${naoLidas.length ? '<button type="button" class="btn-notificacao-lida" onclick="marcarNotificacoesComoLidas()">Marcar como lidas</button>' : ""}
  `;
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

  const resposta=await banco.from("boletos").insert([{
    nome:nome,
    valor:valor,
    status:"Em andamento",
    banco:"",
    observacao:"",
    data_finalizacao:null,
    criado_por:usuarioLogado.login
  }]);

  if(resposta.error){
    alert("Não foi possível salvar o boleto: "+resposta.error.message);
    return;
  }

  mostrarBalaoSistema("Boleto lançado","O usuário Banco receberá a notificação.");
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
  const item=todosBoletos.find(registro=>String(registro.id)===String(id));

  const resposta=await banco
    .from("boletos")
    .update({
      status:"Finalizado",
      data_finalizacao:new Date().toISOString(),
      editado_por:usuarioLogado?.login || null,
      data_edicao:new Date().toISOString()
    })
    .eq("id",id);

  if(resposta.error){
    alert("Não foi possível finalizar o boleto: "+resposta.error.message);
    return;
  }

  mostrarBalaoSistema(
    "Boleto finalizado",
    `${item?.nome || "Cliente"} foi finalizado e o usuário Banco será avisado.`
  );

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
   MÓDULO DE ENVIO DE DOCUMENTOS — SOMENTE FINANCEIRO
   ========================================================= */
let emailVendedoras = [];
let emailClientes = [];
let emailArquivosSelecionados = [];
let emailEnviosPreparados = [];
let emailModoAtual = "boleto";
let emailModuloCarregado = false;
let gerFormasPagamento = [];
let gerPrazosPagamento = [];
let gerRelatoriosSalvos = [];
let gerVencimentosCalculados = [];

let emailAssinaturas = [];
let emailAssinaturaAtiva = null;
let etiquetasHistorico = [];
let etiquetaPedidosFaixas = [];
let etiquetaQrInstancia = null;
const ETIQUETA_INSTAGRAM_URL = "https://www.instagram.com/sofisticatto.cosmeticos?igsh=NmFkdnRlaXZrMXNh";
let emailLogoTemporariaDataUrl = "";

function garantirFinanceiroEmail(){
  if(!usuarioLogado || usuarioLogado.tipo !== "financeiro"){
    alert("Somente o usuário Financeiro pode utilizar o envio de documentos.");
    return false;
  }
  return true;
}

function normalizarNomeEmail(texto){
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
}

function escaparHtmlEmail(texto){
  return String(texto ?? "").replace(/[&<>"']/g, caractere => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[caractere]));
}

function separarEmailsEmail(texto){
  return [...new Set(String(texto || "").split(/[;,\n]+/).map(item => item.trim()).filter(Boolean))];
}

function nomeClienteDoArquivoEmail(arquivo){
  const semExtensao = arquivo.name.replace(/\.[^.]+$/,"").trim();
  return semExtensao.includes(" - ") ? semExtensao.split(" - ")[0].trim() : semExtensao;
}

function arquivoCompativelModoEmail(arquivo){
  const nome = normalizarNomeEmail(arquivo.name);
  const extensao = arquivo.name.split(".").pop().toLowerCase();

  // Relatórios gerados dentro do sistema devem aparecer em qualquer modo,
  // para que possam ser enviados junto com boleto, NF, XML ou romaneio.
  if(nome.includes("RELATORIO") && extensao === "pdf"){
    return true;
  }

  if(emailModoAtual === "boleto"){
    return extensao === "pdf" && !/(NFE|NOTA FISCAL|XML|ROMANEIO)/.test(nome);
  }

  if(emailModoAtual === "completo"){
    return ["pdf","xml","doc","docx"].includes(extensao);
  }

  return ["pdf","xml","doc","docx"].includes(extensao) && !/BOLETO/.test(nome);
}

function obterSaudacaoAutomaticaEmail(){
  const hora = new Date().getHours();

  if(hora >= 6 && hora <= 11) return "Bom dia!";
  if(hora >= 12 && hora <= 17) return "Boa tarde!";
  return "Boa noite!";
}

function mensagemPadraoModoEmail(){
  if(emailModoAtual === "boleto"){
    return "Segue em anexo Boleto, por favor, confirmar o recebimento deste.";
  }

  if(emailModoAtual === "completo"){
    return "Segue em anexo Boleto, Relatório, NF e XML, por favor, confirmar o recebimento deste.";
  }

  return "Segue em anexo Romaneio, NF e XML, por favor, confirmar o recebimento deste.";
}

function obterMensagemPrincipalEmail(){
  const campo = document.getElementById("emailMensagemPrincipal");
  const texto = campo ? campo.value.trim() : "";
  return texto || mensagemPadraoModoEmail();
}

function textoCorpoEmail(){
  const saudacao = obterSaudacaoAutomaticaEmail();
  const mensagem = obterMensagemPrincipalEmail();
  return `${saudacao}\n${mensagem}\nObrigado.`;
}

function atualizarPreviaMensagemEmail(){
  const previa = document.getElementById("emailPreviaMensagem");
  if(!previa) return;

  previa.innerHTML = `
    <div style="margin:0 0 10px 0;">${escaparHtmlEmail(obterSaudacaoAutomaticaEmail())}</div>
    <div style="margin:0 0 10px 0;white-space:pre-line;">${escaparHtmlEmail(obterMensagemPrincipalEmail())}</div>
    <div style="margin:0;">Obrigado.</div>
  `;
}

function atualizarMensagemEmail(){
  atualizarPreviaMensagemEmail();
  prepararEnviosEmail();
}

function restaurarMensagemPadraoEmail(){
  const campo = document.getElementById("emailMensagemPrincipal");
  if(campo) campo.value = mensagemPadraoModoEmail();
  atualizarMensagemEmail();
}

function descricaoModoEmail(){
  if(emailModoAtual === "boleto") return "Boleto";
  if(emailModoAtual === "completo") return "Boleto / Relatório / NF / XML";
  return "Relatório / NF / XML";
}

async function carregarModuloEmail(){
  if(!garantirFinanceiroEmail() || !bancoPronto()) return;
  await Promise.all([carregarVendedorasEmail(), carregarClientesEmail(), carregarAssinaturasEmail(), carregarHistoricoEmail(), carregarConfiguracoesRelatorio(), carregarRelatoriosClientes()]);
  emailModuloCarregado = true;

  const campoMensagem = document.getElementById("emailMensagemPrincipal");
  if(campoMensagem && !campoMensagem.value.trim()){
    campoMensagem.value = mensagemPadraoModoEmail();
  }

  atualizarPreviaMensagemEmail();
  prepararEnviosEmail();
}

function mostrarAbaEmail(aba){
  if(!garantirFinanceiroEmail()) return;
  ["Logistica","Preparar","Gerador","Etiquetas","Correios","Cotacoes","Clientes","Vendedoras","Assinaturas","Historico"].forEach(nome => {
    document.getElementById("emailSub" + nome).classList.remove("ativa");
    document.getElementById("emailAba" + nome).classList.remove("ativo");
  });
  const mapa = {logistica:"Logistica",preparar:"Preparar",gerador:"Gerador",etiquetas:"Etiquetas",correios:"Correios",cotacoes:"Cotacoes",clientes:"Clientes",vendedoras:"Vendedoras",assinaturas:"Assinaturas",historico:"Historico"};
  const nome = mapa[aba];
  document.getElementById("emailSub" + nome).classList.add("ativa");
  document.getElementById("emailAba" + nome).classList.add("ativo");
  if(aba === "historico") carregarHistoricoEmail();
  if(aba === "assinaturas"){ carregarAssinaturasEmail(); atualizarPreviaAssinatura(); }
  if(aba === "gerador"){
    carregarConfiguracoesRelatorio();
    carregarRelatoriosClientes();
    inicializarGeradorRelatorio();
  }
  if(aba === "etiquetas"){
    inicializarModuloEtiquetas();
  }
  if(aba === "correios"){
    inicializarModuloCorreios();
  }
  if(aba === "cotacoes" && typeof inicializarModuloFretes === "function"){
    inicializarModuloFretes();
  }
  if(aba === "logistica" && typeof carregarPainelLogistico === "function"){
    carregarPainelLogistico();
  }
}


let correiosHistorico=[];

let correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"COSMÉTICOS",quantidade:1,valor:""}];

function montarItensCorreios(){
  const lista=document.getElementById("corItensLista");
  if(!lista) return;

  lista.innerHTML=correiosItens.map((item,indice)=>`
    <div class="cor-item-linha">
      <div>
        <label class="relatorio-label">Conteúdo ${indice+1}</label>
        <input value="${escaparHtmlEmail(item.conteudo || "")}"
          oninput="atualizarItemCorreios('${item.id}','conteudo',this.value)">
      </div>
      <div>
        <label class="relatorio-label">Quantidade</label>
        <input type="number" min="1" value="${Number(item.quantidade || 1)}"
          oninput="atualizarItemCorreios('${item.id}','quantidade',this.value)">
      </div>
      <div>
        <label class="relatorio-label">Valor (R$)</label>
        <input inputmode="decimal" value="${escaparHtmlEmail(item.valor || "")}" placeholder="0,00"
          oninput="atualizarItemCorreios('${item.id}','valor',this.value)">
      </div>
      <button type="button" onclick="removerItemCorreios('${item.id}')">Excluir</button>
    </div>`).join("");
}

function adicionarItemCorreios(){
  correiosItens.push({
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    conteudo:"",
    quantidade:1,
    valor:""
  });
  montarItensCorreios();
  atualizarCorreiosTudo();
}

function removerItemCorreios(id){
  if(correiosItens.length===1){
    correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"",quantidade:1,valor:""}];
  }else{
    correiosItens=correiosItens.filter(item=>item.id!==id);
  }
  montarItensCorreios();
  atualizarCorreiosTudo();
}

function atualizarItemCorreios(id,campo,valor){
  const item=correiosItens.find(item=>item.id===id);
  if(!item) return;
  item[campo]=campo==="quantidade" ? Math.max(1,Number(valor || 1)) : valor;
  atualizarCorreiosTudo();
}

function numeroCorreios(valor){
  const texto=String(valor || "").trim();
  if(!texto) return 0;
  return Number(texto.replace(/\./g,"").replace(",", ".")) || 0;
}

function totalCorreiosItens(){
  return correiosItens.reduce((total,item)=>total+(numeroCorreios(item.valor)*Number(item.quantidade || 1)),0);
}


const CORREIOS_AJUSTES_PADRAO={
  logo:0,qr:0,destino:0,endereco:0,bairro:0,cidade:0,cep:0,servico:0,remetente:0,declaracao:0
};
let correiosAjustesTamanho=carregarCorreiosTamanhos();

function carregarCorreiosTamanhos(){
  try{
    return {...CORREIOS_AJUSTES_PADRAO,...JSON.parse(localStorage.getItem("sofisticatto_correios_tamanhos") || "{}")};
  }catch{
    return {...CORREIOS_AJUSTES_PADRAO};
  }
}
function salvarCorreiosTamanhos(){
  localStorage.setItem("sofisticatto_correios_tamanhos",JSON.stringify(correiosAjustesTamanho));
}
function ajustarCorreiosTamanho(campo,delta){
  const limites={
    logo:[-80,120],qr:[-18,35],destino:[-8,20],endereco:[-6,16],bairro:[-6,16],
    cidade:[-6,16],cep:[-5,12],servico:[-12,30],remetente:[-5,15],declaracao:[-3,6]
  };
  const [min,max]=limites[campo] || [-20,20];
  correiosAjustesTamanho[campo]=Math.max(min,Math.min(max,Number(correiosAjustesTamanho[campo] || 0)+Number(delta)));
  salvarCorreiosTamanhos();
  montarItensCorreios();
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
}
function restaurarCorreiosTamanhos(){
  correiosAjustesTamanho={...CORREIOS_AJUSTES_PADRAO};
  salvarCorreiosTamanhos();
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
}
function atualizarCorreiosValoresAjuste(){
  const mapa={
    logo:"corAjLogo",qr:"corAjQr",destino:"corAjDestino",endereco:"corAjEndereco",
    bairro:"corAjBairro",cidade:"corAjCidade",cep:"corAjCep",servico:"corAjServico",
    remetente:"corAjRemetente",declaracao:"corAjDeclaracao"
  };
  Object.entries(mapa).forEach(([campo,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    const valor=Number(correiosAjustesTamanho[campo] || 0);
    el.textContent=valor===0 ? "Padrão" : `${valor>0?"+":""}${valor}`;
  });
}
function aplicarAjustesCorreiosEtiqueta(etiqueta,tipo){
  if(!etiqueta) return;
  const ajuste=correiosAjustesTamanho;

  const logo=etiqueta.querySelector(".cor-logo");
  if(logo){
    const largura=Math.max(120,220+Number(ajuste.logo || 0));
    const altura=Math.max(65,106+Math.round(Number(ajuste.logo || 0)*0.35));
    logo.style.setProperty("width",`${largura}px`,"important");
    logo.style.setProperty("max-width",`${largura}px`,"important");
    logo.style.setProperty("height",`${altura}px`,"important");
    logo.style.setProperty("max-height",`${altura}px`,"important");
    logo.style.setProperty("object-fit","contain","important");
  }

  const qr=etiqueta.querySelector(".etiqueta-qr");
  if(qr){
    const tamanho=Math.max(55,113+Number(ajuste.qr || 0));
    qr.style.setProperty("width",`${tamanho}px`,"important");
    qr.style.setProperty("height",`${tamanho}px`,"important");
    qr.style.setProperty("max-width",`${tamanho}px`,"important");
    qr.style.setProperty("max-height",`${tamanho}px`,"important");

    const qrImagem=qr.querySelector("canvas,img");
    if(qrImagem){
      qrImagem.style.setProperty("width",`${tamanho}px`,"important");
      qrImagem.style.setProperty("height",`${tamanho}px`,"important");
      qrImagem.style.setProperty("max-width",`${tamanho}px`,"important");
      qrImagem.style.setProperty("max-height",`${tamanho}px`,"important");
    }
  }

  const aplicarFonte=(seletor,base,campo,minimo=9)=>{
    const el=etiqueta.querySelector(seletor);
    if(!el) return;
    const tamanho=Math.max(minimo,base+Number(ajuste[campo] || 0));
    el.style.setProperty("font-size",`${tamanho}px`,"important");
  };

  aplicarFonte(".cor-destino",24,"destino",13);
  aplicarFonte(".cor-endereco",18,"endereco",11);
  aplicarFonte(".cor-bairro",18,"bairro",11);
  aplicarFonte(".cor-cidade",19,"cidade",11);
  aplicarFonte(".cor-cep",15,"cep",9);
  aplicarFonte(".cor-servico",72,"servico",36);
  aplicarFonte(".cor-rem-texto",23,"remetente",13);

  if(tipo==="declaracao"){
    const tamanho=Math.max(7,10+Number(ajuste.declaracao || 0));
    etiqueta.style.setProperty("font-size",`${tamanho}px`,"important");

    etiqueta.querySelectorAll(
      ".cor-dec-bens th,.cor-dec-bens td,.cor-dec-linha,.cor-dec-declaracao,.cor-dec-data,.cor-dec-texto-assinatura"
    ).forEach(item=>{
      item.style.setProperty("font-size","inherit","important");
    });
  }
}


function valorCampoCorreios(id){
  return document.getElementById(id)?.value.trim() || "";
}

function dadosCorreios(){
  return {
    cliente:valorCampoCorreios("corCliente"),
    endereco:valorCampoCorreios("corEndereco"),
    numero:valorCampoCorreios("corNumero"),
    complemento:valorCampoCorreios("corComplemento"),
    bairro:valorCampoCorreios("corBairro"),
    cep:valorCampoCorreios("corCep"),
    cidade:valorCampoCorreios("corCidade"),
    uf:valorCampoCorreios("corUf").toUpperCase(),
    documento:valorCampoCorreios("corDocumento"),
    servico:valorCampoCorreios("corServico") || "PAC",
    data_postagem:valorCampoCorreios("corData"),
    peso:valorCampoCorreios("corPeso"),
    rastreio:valorCampoCorreios("corRastreio").toUpperCase(),
    itens:correiosItens.map(item=>({...item})),
    conteudo:correiosItens.map(item=>item.conteudo).filter(Boolean).join(", "),
    quantidade:correiosItens.reduce((total,item)=>total+Number(item.quantidade || 0),0),
    valor_declarado:totalCorreiosItens(),
    remetente_nome:valorCampoCorreios("corRemNome"),
    remetente_endereco:valorCampoCorreios("corRemEndereco"),
    remetente_bairro:valorCampoCorreios("corRemBairro"),
    remetente_cep:valorCampoCorreios("corRemCep"),
    remetente_cidade:valorCampoCorreios("corRemCidade"),
    remetente_uf:valorCampoCorreios("corRemUf").toUpperCase(),
    remetente_documento:valorCampoCorreios("corRemDocumento")
  };
}

function montarLogoQrCorreios(container){
  container.innerHTML=`
    <img class="cor-logo" src="${escaparHtmlEmail(logoEtiquetaUrl() || "")}" alt="Sofisticatto" onerror="this.style.display='none'">

    <div class="etiqueta-qr-texto">
      <div class="insta-vertical">I<br>N<br>S<br>T<br>A</div>
      <div class="gram-horizontal">G&nbsp;R&nbsp;A&nbsp;M</div>
    </div>

    <div class="etiqueta-qr"></div>`;

  const alvo=container.querySelector(".etiqueta-qr");
  if(!alvo) return;

  // Usa exatamente a mesma função, o mesmo link, o mesmo tamanho
  // e o mesmo formato visual da aba Etiquetas.
  montarQrEtiqueta(alvo);
}

function montarEtiquetaDestinoCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corEtiquetaDestino");
  if(!box) return;

  montarLogoQrCorreios(box);
  const enderecoBase=String(d.endereco || "").trim();
  const numeroLimpo=String(d.numero || "").trim();
  const enderecoJaTemNumero=numeroLimpo && enderecoBase.toUpperCase().includes(numeroLimpo.toUpperCase());
  const endereco=[enderecoBase,enderecoJaTemNumero ? "" : numeroLimpo].filter(Boolean).join(", ");
  const enderecoCompleto=[endereco,d.complemento].filter(Boolean).join(" - ");
  box.insertAdjacentHTML("beforeend",`
    <div class="cor-destino"><span class="cor-destino-label">DESTINO:</span> <span class="cor-destino-nome">${escaparHtmlEmail(d.cliente || "DESTINATÁRIO")}</span></div>
    <div class="cor-endereco">${escaparHtmlEmail(enderecoCompleto)}</div>
    <div class="cor-bairro">${d.bairro ? "BAIRRO: "+escaparHtmlEmail(d.bairro) : ""}</div>
    <div class="cor-cidade">${escaparHtmlEmail([d.cidade,d.uf].filter(Boolean).join("/"))}</div>
    <div class="cor-barcode-area">
      <svg class="cor-barcode"></svg>
      <div class="cor-cep">${d.cep ? "CEP: "+escaparHtmlEmail(formatarCepEtiqueta(d.cep)) : ""}</div>
    </div>
    <div class="cor-servico">${escaparHtmlEmail(d.servico)}</div>`);
  const barcodeDestino=box.querySelector(".cor-barcode");
  if(barcodeDestino && window.JsBarcode){
    JsBarcode(barcodeDestino,(d.cep || "").replace(/\D/g,"") || "00000000",{
      format:"CODE128",
      displayValue:false,
      margin:0,
      height:42,
      width:1.6,
      background:"#ffffff",
      lineColor:"#000000"
    });
    barcodeDestino.setAttribute("preserveAspectRatio","xMidYMid meet");
    barcodeDestino.setAttribute("width","204");
    barcodeDestino.setAttribute("height","38");
  }
  aplicarAjustesCorreiosEtiqueta(box,"destino");
}

function montarEtiquetaRemetenteCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corEtiquetaRemetente");
  if(!box) return;

  montarLogoQrCorreios(box);
  box.insertAdjacentHTML("beforeend",`
    <div class="cor-rem-texto">
      <div class="cor-rem-label">REMETENTE:</div>
      <div>${escaparHtmlEmail(d.remetente_nome)}</div>
      <div>${escaparHtmlEmail(d.remetente_endereco)}</div>
      <div>${escaparHtmlEmail(d.remetente_bairro)}</div>
      <div>${escaparHtmlEmail([d.remetente_cidade,d.remetente_uf].filter(Boolean).join("/"))}</div>
    </div>
    <div class="cor-barcode-area">
      <svg class="cor-barcode"></svg>
      <div class="cor-cep">${d.remetente_cep ? "CEP: "+escaparHtmlEmail(formatarCepEtiqueta(d.remetente_cep)) : ""}</div>
    </div>
    <div class="cor-servico">${escaparHtmlEmail(d.servico)}</div>`);
  const barcodeRemetente=box.querySelector(".cor-barcode");
  if(barcodeRemetente && window.JsBarcode){
    JsBarcode(barcodeRemetente,(d.remetente_cep || "").replace(/\D/g,"") || "74550470",{
      format:"CODE128",
      displayValue:false,
      margin:0,
      height:42,
      width:1.6,
      background:"#ffffff",
      lineColor:"#000000"
    });
    barcodeRemetente.setAttribute("preserveAspectRatio","xMidYMid meet");
    barcodeRemetente.setAttribute("width","204");
    barcodeRemetente.setAttribute("height","38");
  }
  aplicarAjustesCorreiosEtiqueta(box,"remetente");
}

function dataExtensoCorreios(valor){
  const data=valor ? new Date(valor+"T12:00:00") : new Date();
  return {
    dia:String(data.getDate()).padStart(2,"0"),
    mes:data.toLocaleDateString("pt-BR",{month:"long"}),
    ano:String(data.getFullYear())
  };
}

function montarDeclaracaoCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corDeclaracao");
  if(!box) return;
  const data=dataExtensoCorreios(d.data_postagem);
  const enderecoDest=[d.endereco,d.numero,d.complemento].filter(Boolean).join(", ");
  box.innerHTML=`
    <h1>DECLARAÇÃO DE CONTEÚDO</h1>
    <div class="cor-dec-duplo">
      <div class="cor-dec-box">
        <div class="cor-dec-titulo">REMETENTE</div>
        <div class="cor-dec-linha"><b>NOME:</b> ${escaparHtmlEmail(d.remetente_nome)}</div>
        <div class="cor-dec-linha"><b>ENDEREÇO:</b> ${escaparHtmlEmail(d.remetente_endereco)}</div>
        <div class="cor-dec-linha">${escaparHtmlEmail(d.remetente_bairro)}</div>
        <div class="cor-dec-linha"><b>CIDADE:</b> ${escaparHtmlEmail(d.remetente_cidade)} &nbsp; <b>UF:</b> ${escaparHtmlEmail(d.remetente_uf)}</div>
        <div class="cor-dec-linha"><b>CEP:</b> ${escaparHtmlEmail(d.remetente_cep)} &nbsp; <b>CPF/CNPJ:</b> ${escaparHtmlEmail(d.remetente_documento)}</div>
      </div>
      <div class="cor-dec-box">
        <div class="cor-dec-titulo">DESTINATÁRIO</div>
        <div class="cor-dec-linha"><b>NOME:</b> ${escaparHtmlEmail(d.cliente)}</div>
        <div class="cor-dec-linha"><b>ENDEREÇO:</b> ${escaparHtmlEmail(enderecoDest)}</div>
        <div class="cor-dec-linha">${escaparHtmlEmail(d.bairro)}</div>
        <div class="cor-dec-linha"><b>CIDADE:</b> ${escaparHtmlEmail(d.cidade)} &nbsp; <b>UF:</b> ${escaparHtmlEmail(d.uf)}</div>
        <div class="cor-dec-linha"><b>CEP:</b> ${escaparHtmlEmail(d.cep)} &nbsp; <b>CPF/CNPJ:</b> ${escaparHtmlEmail(d.documento)}</div>
      </div>
    </div>

    <table class="cor-dec-bens">
      <colgroup><col style="width:8%"><col style="width:50%"><col style="width:18%"><col style="width:24%"></colgroup>
      <thead><tr><th>ITEM</th><th>CONTEÚDO</th><th>QTD.</th><th>VALOR (R$)</th></tr></thead>
      <tbody>
        ${d.itens.map((item,indice)=>`
          <tr>
            <td style="text-align:center;">${String(indice+1).padStart(2,"0")}</td>
            <td>${escaparHtmlEmail(item.conteudo || "")}</td>
            <td style="text-align:center;">${Number(item.quantidade || 0)}</td>
            <td style="text-align:center;font-size:8.5px;">${item.valor ? "R$ "+numeroCorreios(item.valor).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : ""}</td>
          </tr>`).join("")}
        ${Array.from({length:Math.max(0,10-d.itens.length)},()=>'<tr><td></td><td></td><td></td><td></td></tr>').join("")}
        <tr>
          <td colspan="2" style="text-align:right;font-weight:700;">TOTAIS</td>
          <td style="text-align:center;font-weight:700;">${d.quantidade}</td>
          <td style="text-align:center;font-weight:700;font-size:8.5px;">R$ ${totalCorreiosItens().toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        </tr>
        <tr><td colspan="3" style="text-align:right;font-weight:700;">PESO TOTAL (kg)</td><td style="text-align:center;font-weight:700;">${escaparHtmlEmail(d.peso || "")}</td></tr>
      </tbody>
    </table>

    <div class="cor-dec-declaracao">
      <div style="text-align:center;font-weight:900;letter-spacing:4px;margin-bottom:9px;">DECLARAÇÃO</div>
      Declaro que não me enquadro no conceito de contribuinte previsto no art. 4º da Lei Complementar nº 87/1996, uma vez que não realizo, com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria, ainda que se iniciem no exterior, ou estou dispensado da emissão da nota fiscal por força da legislação tributária vigente, responsabilizando-me, nos termos da lei e a quem de direito, por informações inverídicas.<br><br>
      Declaro ainda que não estou postando conteúdo inflamável, explosivo, causador de combustão espontânea, tóxico, corrosivo, gás ou qualquer outro conteúdo que constitua perigo, conforme o art. 13 da Lei Postal nº 6.538/78.
      <div class="cor-dec-assinatura">
        <div class="cor-dec-data">
          ${escaparHtmlEmail(d.remetente_cidade)}, ${data.dia} de ${escaparHtmlEmail(data.mes)} de ${data.ano}
        </div>
        <div class="cor-dec-assinar">
          <div class="cor-dec-linha-assinatura"></div>
          <div class="cor-dec-texto-assinatura">Assinatura do Declarante/Remetente</div>
        </div>
      </div>
    </div>
    <div style="border:2px solid #111;margin-top:6px;padding:8px;"><b>OBSERVAÇÃO:</b><br>Constitui crime contra a ordem tributária suprimir ou reduzir tributo, ou contribuição social e qualquer acessório (Lei 8.137/90 Art. 1º, V).</div>`;
  aplicarAjustesCorreiosEtiqueta(box,"declaracao");
}

async function atualizarCorreiosTudo(){
  try{
    await carregarBibliotecasEtiqueta();
  }catch(erro){
    console.error("Não foi possível carregar as bibliotecas das etiquetas:",erro);
  }
  montarEtiquetaDestinoCorreios();
  montarEtiquetaRemetenteCorreios();
  montarDeclaracaoCorreios();
}

function mostrarPreviewCorreios(tipo){
  ["Destino","Remetente","Declaracao"].forEach(nome=>{
    document.getElementById("corPreview"+nome)?.classList.remove("ativo");
    document.getElementById("corTab"+nome)?.classList.remove("ativo");
  });
  const nome={destino:"Destino",remetente:"Remetente",declaracao:"Declaracao"}[tipo];
  document.getElementById("corPreview"+nome)?.classList.add("ativo");
  document.getElementById("corTab"+nome)?.classList.add("ativo");
}

function preencherListaClientesCorreios(){
  const lista=document.getElementById("corClientesLista");
  if(!lista) return;
  lista.innerHTML=emailClientes.map(item=>`<option value="${escaparHtmlEmail(item.nome || "")}"></option>`).join("");
}

function preencherCorreiosPeloCliente(){
  const nome=decodificarEntidadesXml(valorCampoCorreios("corCliente"));
  const nomeNormalizado=normalizarNomeEmail(nome);

  let cliente=emailClientes.find(item=>
    normalizarNomeEmail(decodificarEntidadesXml(item.nome || ""))===nomeNormalizado
  );

  if(!cliente){
    cliente=emailClientes.find(item=>{
      const cadastro=normalizarNomeEmail(decodificarEntidadesXml(item.nome || ""));
      return cadastro.includes(nomeNormalizado) || nomeNormalizado.includes(cadastro);
    });
  }

  if(!cliente){
    alert("Cliente não encontrado no cadastro. Verifique o nome digitado ou cadastre o cliente primeiro.");
    return;
  }

  document.getElementById("corCliente").value=decodificarEntidadesXml(cliente.nome || nome);
  document.getElementById("corEndereco").value=cliente.endereco || "";
  document.getElementById("corNumero").value=cliente.numero || "";
  document.getElementById("corComplemento").value=cliente.complemento || "";
  document.getElementById("corBairro").value=cliente.bairro || "";
  document.getElementById("corCep").value=formatarCepEtiqueta(cliente.cep || "");
  document.getElementById("corCidade").value=cliente.cidade || "";
  document.getElementById("corUf").value=(cliente.uf || "").toUpperCase();
  document.getElementById("corDocumento").value=cliente.cpf_cnpj || cliente.cnpj || cliente.cpf || "";

  atualizarCorreiosTudo();

  const possuiEndereco=!!(
    cliente.endereco || cliente.bairro || cliente.cep || cliente.cidade || cliente.uf
  );

  if(!possuiEndereco){
    alert("O cliente foi encontrado, mas ainda não possui endereço logístico cadastrado.");
  }else{
    mostrarAvisoEmail("Dados do cliente preenchidos com sucesso.",true);
  }
}

function inicializarModuloCorreios(){
  preencherListaClientesCorreios();
  const data=document.getElementById("corData");
  if(data && !data.value) data.value=new Date().toISOString().slice(0,10);
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
  carregarHistoricoCorreios();

  // A assinatura, a logo e a biblioteca do QR podem carregar depois da abertura.
  setTimeout(atualizarCorreiosTudo,600);
}

function clonarElementoCorreiosParaImpressao(elemento){
  const clone=elemento.cloneNode(true);

  // Converte canvas em imagem para não desaparecer na impressão.
  const canvasesOriginais=elemento.querySelectorAll("canvas");
  const canvasesClone=clone.querySelectorAll("canvas");

  canvasesOriginais.forEach((canvas,indice)=>{
    const correspondente=canvasesClone[indice];
    if(!correspondente) return;

    try{
      const imagem=document.createElement("img");
      imagem.src=canvas.toDataURL("image/png");
      imagem.alt="QR Code";
      imagem.style.display="block";
      imagem.style.width="100%";
      imagem.style.height="100%";
      imagem.style.objectFit="contain";
      correspondente.replaceWith(imagem);
    }catch(erro){
      console.error("Erro ao preparar canvas para impressão:",erro);
    }
  });

  return clone;
}

function estilosImpressaoCorreios(tipo){
  const base=`
    *{box-sizing:border-box}
    html,body{
      margin:0!important;
      padding:0!important;
      background:#fff!important;
      color:#000!important;
      width:100%!important;
      min-height:100%!important;
      overflow:visible!important;
      -webkit-print-color-adjust:exact!important;
      print-color-adjust:exact!important;
    }
    body{
      display:block!important;
      visibility:visible!important;
    }
    body *{
      visibility:visible!important;
    }
    img,svg,canvas{
      visibility:visible!important;
      opacity:1!important;
    }
  `;

  if(tipo==="etiqueta"){
    return base+`
      @page{size:150mm 100mm;margin:0}
      .correios-etiqueta{
        position:relative!important;
        display:block!important;
        width:150mm!important;
        height:100mm!important;
        min-width:150mm!important;
        min-height:100mm!important;
        max-width:150mm!important;
        max-height:100mm!important;
        margin:0!important;
        padding:0!important;
        overflow:hidden!important;
        background:#fff!important;
        color:#000!important;
        font-family:Arial,sans-serif!important;
        transform:none!important;
        box-shadow:none!important;
        border-radius:0!important;
      }
      .cor-logo{
        position:absolute!important;
        left:48mm!important;
        top:5mm!important;
        width:58mm!important;
        height:28mm!important;
        object-fit:contain!important;
      }
      .etiqueta-qr-texto{
        position:absolute!important;
        right:14mm!important;
        top:7mm!important;
        width:31mm!important;
        height:27mm!important;
        font-weight:900!important;
        color:#000!important;
        line-height:1!important;
        z-index:7!important;
      }
      .insta-vertical{
        position:absolute!important;
        left:0!important;
        top:0!important;
        width:6mm!important;
        font-size:4mm!important;
        line-height:1.08!important;
        text-align:center!important;
      }
      .gram-horizontal{
        position:absolute!important;
        left:0!important;
        bottom:0!important;
        width:31mm!important;
        font-size:4mm!important;
        letter-spacing:1.05mm!important;
        white-space:nowrap!important;
      }
      .etiqueta-qr{
        position:absolute!important;
        right:16mm!important;
        top:8mm!important;
        width:22mm!important;
        height:22mm!important;
        overflow:hidden!important;
        background:#fff!important;
        z-index:6!important;
      }
      .etiqueta-qr img,.etiqueta-qr canvas{
        width:100%!important;
        height:100%!important;
        display:block!important;
        object-fit:contain!important;
      }
      .cor-destino{
        position:absolute!important;
        left:7mm!important;
        top:37mm!important;
        width:116mm!important;
        min-height:8mm!important;
        max-height:12mm!important;
        overflow:hidden!important;
        font-weight:900!important;
        line-height:1.08!important;
        white-space:normal!important;
        word-break:normal!important;
      }
      .cor-destino-label{
        font-weight:900!important;
        margin-right:1.5mm!important;
      }
      .cor-destino-nome{
        font-weight:900!important;
      }
      .cor-endereco{
        position:absolute!important;
        left:7mm!important;
        top:52mm!important;
        width:112mm!important;
        max-height:10mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.12!important;
        white-space:normal!important;
        word-break:break-word!important;
      }
      .cor-bairro{
        position:absolute!important;
        left:7mm!important;
        top:63mm!important;
        width:112mm!important;
        max-height:7mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.08!important;
        white-space:nowrap!important;
        text-overflow:ellipsis!important;
      }
      .cor-cidade{
        position:absolute!important;
        left:7mm!important;
        top:68mm!important;
        width:112mm!important;
        max-height:6mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.05!important;
        white-space:nowrap!important;
        text-overflow:ellipsis!important;
      }
      .cor-rem-texto{
        position:absolute!important;
        left:8mm!important;
        top:34mm!important;
        width:87mm!important;
        max-height:43mm!important;
        font-size:6mm!important;
        line-height:1.45!important;
        overflow:hidden!important;
      }
      .cor-rem-label{font-size:4mm!important;font-weight:700!important}
      .cor-barcode-area{
        position:absolute!important;
        left:3mm!important;
        right:auto!important;
        bottom:3mm!important;
        width:57mm!important;
        height:17mm!important;
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        justify-content:flex-end!important;
        background:#fff!important;
        z-index:6!important;
        overflow:visible!important;
      }
      .cor-barcode{
        position:static!important;
        display:block!important;
        width:54mm!important;
        height:10mm!important;
        max-width:54mm!important;
        max-height:10mm!important;
        margin:0!important;
        background:#fff!important;
        overflow:visible!important;
      }
      .cor-cep{
        position:static!important;
        width:54mm!important;
        margin-top:1mm!important;
        text-align:center!important;
        font-weight:900!important;
        line-height:1!important;
        white-space:nowrap!important;
      }
      .cor-servico{
        position:absolute!important;
        right:3mm!important;
        left:auto!important;
        bottom:8mm!important;
        width:auto!important;
        min-width:46mm!important;
        max-width:72mm!important;
        padding:0 1mm!important;
        text-align:right!important;
        font-weight:900!important;
        line-height:1!important;
        z-index:3!important;
        white-space:nowrap!important;
        overflow:visible!important;
      }
    `;
  }

  return base+`
    @page{size:A4 portrait;margin:8mm}
    .correios-declaracao{
      display:block!important;
      width:194mm!important;
      max-width:194mm!important;
      min-height:281mm!important;
      margin:0 auto!important;
      padding:5mm!important;
      overflow:hidden!important;
      background:#fff!important;
      color:#000!important;
      font-family:Arial,sans-serif!important;
      box-shadow:none!important;
      border-radius:0!important;
      transform:none!important;
    }
    .correios-declaracao h1{
      text-align:center!important;
      border:2px solid #111!important;
      padding:8px!important;
      margin:0 0 6px!important;
      font-size:20px!important;
    }
    .cor-dec-duplo{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
    }
    .cor-dec-box{border:2px solid #111!important;padding:0!important}
    .cor-dec-box+.cor-dec-box{border-left:0!important}
    .cor-dec-titulo{
      text-align:center!important;
      font-weight:900!important;
      letter-spacing:4px!important;
      border-bottom:1px solid #111!important;
      padding:5px!important;
    }
    .cor-dec-linha{
      min-height:23px!important;
      border-bottom:1px solid #111!important;
      padding:5px!important;
    }
    .cor-dec-linha:last-child{border-bottom:0!important}
    .cor-dec-bens{
      width:100%!important;
      max-width:100%!important;
      table-layout:fixed!important;
      border-collapse:collapse!important;
      margin-top:6px!important;
    }
    .cor-dec-bens th,.cor-dec-bens td{
      border:1px solid #111!important;
      padding:3px 2px!important;
      height:24px!important;
      font-size:inherit!important;
      line-height:1.1!important;
      overflow:hidden!important;
      word-break:break-word!important;
      white-space:normal!important;
    }
    .cor-dec-bens th{text-align:center!important}
    .cor-dec-declaracao{
      border:2px solid #111!important;
      margin-top:6px!important;
      padding:10px!important;
      line-height:1.35!important;
      text-align:justify!important;
    }
    .cor-dec-assinatura{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
      gap:20px!important;
      margin-top:28px!important;
      align-items:start!important;
    }
    .cor-dec-data{text-align:left!important;padding-top:2px!important}
    .cor-dec-assinar{text-align:center!important}
    .cor-dec-linha-assinatura{
      border-top:1px solid #111!important;
      width:100%!important;
      margin-bottom:4px!important;
    }
    .cor-dec-texto-assinatura{
      font-size:9px!important;
      line-height:1.2!important;
    }
  `;
}

async function esperarImagensCorreios(container){
  const imagens=Array.from(container.querySelectorAll("img"));
  await Promise.all(imagens.map(imagem=>{
    if(imagem.complete && imagem.naturalWidth>0) return Promise.resolve();

    return new Promise(resolve=>{
      const finalizar=()=>resolve();
      imagem.addEventListener("load",finalizar,{once:true});
      imagem.addEventListener("error",finalizar,{once:true});
      setTimeout(finalizar,3000);
    });
  }));
}

async function abrirJanelaImpressaoCorreios(elemento,tipo,titulo){
  const janela=window.open("","_blank","width=1050,height=780");
  if(!janela){
    alert("Permita pop-ups para imprimir.");
    return;
  }

  const clone=clonarElementoCorreiosParaImpressao(elemento);
  const css=estilosImpressaoCorreios(tipo);

  janela.document.open();
  janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
</head>
<body></body>
</html>`);
  janela.document.close();

  janela.document.body.appendChild(janela.document.importNode(clone,true));

  await esperarImagensCorreios(janela.document.body);
  await new Promise(resolve=>{
    janela.requestAnimationFrame(()=>{
      janela.requestAnimationFrame(()=>{
        setTimeout(resolve,900);
      });
    });
  });

  janela.focus();
  janela.print();
}

async function imprimirEtiquetaCorreios(tipo){
  await atualizarCorreiosTudo();

  const id=tipo==="destino" ? "corEtiquetaDestino" : "corEtiquetaRemetente";
  const elemento=document.getElementById(id);

  if(!elemento){
    alert("Não foi possível localizar a etiqueta para impressão.");
    return;
  }

  await abrirJanelaImpressaoCorreios(
    elemento,
    "etiqueta",
    tipo==="destino" ? "Etiqueta do Destinatário" : "Etiqueta do Remetente"
  );
}

async function imprimirDeclaracaoCorreios(){
  await atualizarCorreiosTudo();

  const elemento=document.getElementById("corDeclaracao");
  if(!elemento){
    alert("Não foi possível localizar a Declaração de Conteúdo.");
    return;
  }

  const declaracaoParaImprimir=elemento.cloneNode(true);
  const tamanhoAtual=Math.max(
    7,
    10 + Number(correiosAjustesTamanho.declaracao || 0)
  );

  declaracaoParaImprimir.style.fontSize=`${tamanhoAtual}px`;

  declaracaoParaImprimir.querySelectorAll(
    ".cor-dec-bens th,.cor-dec-bens td,.cor-dec-linha,.cor-dec-declaracao,.cor-dec-data,.cor-dec-texto-assinatura"
  ).forEach(item=>{
    item.style.fontSize="inherit";
  });

  await abrirJanelaImpressaoCorreios(
    declaracaoParaImprimir,
    "declaracao",
    "Declaração de Conteúdo"
  );
}

async function imprimirPacoteCorreios(){
  await imprimirEtiquetaCorreios("destino");
  await new Promise(resolve=>setTimeout(resolve,700));
  await imprimirEtiquetaCorreios("remetente");
  await new Promise(resolve=>setTimeout(resolve,700));
  await imprimirDeclaracaoCorreios();
}

async function salvarEnvioCorreios(){
  if(!bancoPronto()) return;
  const d=dadosCorreios();
  if(!d.cliente || !d.endereco || !d.cep || !d.cidade || !d.uf){
    alert("Preencha cliente, endereço, CEP, cidade e UF.");
    return;
  }
  const resposta=await banco.from("correios_envios").insert([{
    cliente_nome:d.cliente,endereco:d.endereco,numero:d.numero,complemento:d.complemento,
    bairro:d.bairro,cep:d.cep,cidade:d.cidade,uf:d.uf,cpf_cnpj:d.documento,
    servico:d.servico,data_postagem:d.data_postagem,peso_kg:d.peso ? Number(String(d.peso).replace(",",".")) : null,
    codigo_rastreio:d.rastreio,conteudo:d.conteudo,quantidade:d.quantidade,
    valor_declarado:d.valor_declarado ? Number(String(d.valor_declarado).replace(".","").replace(",",".")) : null,
    criado_por:usuarioAtual?.username || null
  }]).select().single();
  if(resposta.error){alert("Erro ao salvar postagem: "+resposta.error.message);return;}
  mostrarAvisoEmail("Postagem dos Correios salva com sucesso.",true);
  carregarHistoricoCorreios();
}

async function carregarHistoricoCorreios(){
  if(!bancoPronto()) return;
  const resposta=await banco.from("correios_envios").select("*").order("created_at",{ascending:false}).limit(200);
  if(resposta.error){console.error(resposta.error);return;}
  correiosHistorico=resposta.data || [];
  const tbody=document.getElementById("corTabelaHistorico");
  if(!tbody) return;
  tbody.innerHTML=correiosHistorico.length ? correiosHistorico.map(item=>`
    <tr>
      <td>${formatarDataHoraEmail(item.data_postagem || item.created_at)}</td>
      <td>${escaparHtmlEmail(item.cliente_nome || "")}</td>
      <td>${escaparHtmlEmail(item.cep || "")}</td>
      <td>${escaparHtmlEmail(item.servico || "")}</td>
      <td>${item.peso_kg ?? ""}</td>
      <td>${escaparHtmlEmail(item.codigo_rastreio || "")}</td>
      <td>
        <button class="btn azul" onclick="reutilizarEnvioCorreios('${item.id}')">Usar</button>
        <button class="btn vermelho" onclick="excluirEnvioCorreios('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="7">Nenhuma postagem salva.</td></tr>';
}

function reutilizarEnvioCorreios(id){
  const item=correiosHistorico.find(reg=>reg.id===id);
  if(!item) return;
  const mapa={
    corCliente:item.cliente_nome,corEndereco:item.endereco,corNumero:item.numero,
    corComplemento:item.complemento,corBairro:item.bairro,corCep:item.cep,
    corCidade:item.cidade,corUf:item.uf,corDocumento:item.cpf_cnpj,
    corServico:item.servico,corData:item.data_postagem,corPeso:item.peso_kg,
    corRastreio:item.codigo_rastreio
  };
  Object.entries(mapa).forEach(([idCampo,valor])=>{const el=document.getElementById(idCampo);if(el)el.value=valor ?? "";});
  correiosItens=[{
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    conteudo:item.conteudo || "COSMÉTICOS",
    quantidade:Number(item.quantidade || 1),
    valor:item.valor_declarado ? Number(item.valor_declarado).toLocaleString("pt-BR",{minimumFractionDigits:2}) : ""
  }];
  montarItensCorreios();
  atualizarCorreiosTudo();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function excluirEnvioCorreios(id){
  if(!confirm("Excluir esta postagem do histórico?")) return;
  const resposta=await banco.from("correios_envios").delete().eq("id",id);
  if(resposta.error){alert(resposta.error.message);return;}
  carregarHistoricoCorreios();
}

function limparCorreios(){
  ["corCliente","corEndereco","corNumero","corComplemento","corBairro","corCep","corCidade","corUf",
   "corDocumento","corPeso","corRastreio","corValor"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("corServico").value="PAC";
  correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"COSMÉTICOS",quantidade:1,valor:""}];
  montarItensCorreios();
  document.getElementById("corData").value=new Date().toISOString().slice(0,10);
  atualizarCorreiosTudo();
}

function selecionarModoEmail(modo){
  emailModoAtual = modo;
  ["Boleto","Completo","SemBoleto"].forEach(nome => document.getElementById("emailModo" + nome).classList.remove("ativo"));
  const id = modo === "boleto" ? "emailModoBoleto" : modo === "completo" ? "emailModoCompleto" : "emailModoSemBoleto";
  document.getElementById(id).classList.add("ativo");

  const campo = document.getElementById("emailMensagemPrincipal");
  if(campo) campo.value = mensagemPadraoModoEmail();

  atualizarPreviaMensagemEmail();
  prepararEnviosEmail();
}

async function carregarVendedorasEmail(){
  if(!garantirFinanceiroEmail()) return;
  const resposta = await banco.from("email_vendedoras").select("*").order("nome",{ascending:true});
  if(resposta.error){
    console.error("Erro ao carregar vendedoras:", resposta.error);
    return;
  }
  emailVendedoras = resposta.data || [];
  montarTabelaVendedorasEmail();
  montarSelectVendedorasEmail();
  if(typeof preencherSelectVendedoraImportacao==="function") preencherSelectVendedoraImportacao();
}

function montarTabelaVendedorasEmail(){
  const tabela = document.getElementById("emailTabelaVendedoras");
  if(!tabela) return;
  tabela.innerHTML = emailVendedoras.length ? emailVendedoras.map(item => `
    <tr>
      <td>${escaparHtmlEmail(item.nome)}</td>
      <td>${escaparHtmlEmail(item.email)}</td>
      <td>${escaparHtmlEmail(item.whatsapp || "")}</td>
      <td>
        <button class="btn azul" onclick="editarVendedoraEmail('${item.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirVendedoraEmail('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="4">Nenhuma vendedora cadastrada.</td></tr>`;
}

function montarSelectVendedorasEmail(){
  const select = document.getElementById("emailClienteVendedora");
  if(!select) return;
  const atual = select.value;
  select.innerHTML = `<option value="">Selecione a vendedora</option>` + emailVendedoras.map(item =>
    `<option value="${item.id}">${escaparHtmlEmail(item.nome)}</option>`
  ).join("");
  if(emailVendedoras.some(item => item.id === atual)) select.value = atual;
  atualizarEmailVendedoraAutomatico();
}

function atualizarEmailVendedoraAutomatico(){
  const item = emailVendedoras.find(v => v.id === document.getElementById("emailClienteVendedora").value);
  document.getElementById("emailVendedoraAutomatico").value = item?.email || "";
}

async function salvarVendedoraEmail(){
  if(!garantirFinanceiroEmail()) return;
  const id = document.getElementById("emailVendedoraId").value;
  const nome = document.getElementById("emailVendedoraNome").value.trim();
  const email = document.getElementById("emailVendedoraEmail").value.trim();
  const whatsapp = document.getElementById("emailVendedoraWhatsapp").value.trim();

  if(!nome){ alert("Informe o nome da vendedora."); return; }

  const dados = {nome,email,whatsapp,atualizado_em:new Date().toISOString()};
  const resposta = id
    ? await banco.from("email_vendedoras").update(dados).eq("id",id)
    : await banco.from("email_vendedoras").insert([{...dados,criado_por:usuarioLogado.login}]);

  if(resposta.error){ alert("Erro ao salvar vendedora: " + resposta.error.message); return; }
  cancelarEdicaoVendedoraEmail();
  await carregarVendedorasEmail();
  await carregarClientesEmail();
}

function editarVendedoraEmail(id){
  if(!garantirFinanceiroEmail()) return;
  const item = emailVendedoras.find(v => v.id === id);
  if(!item) return;
  document.getElementById("emailVendedoraId").value = item.id;
  document.getElementById("emailVendedoraNome").value = item.nome || "";
  document.getElementById("emailVendedoraEmail").value = item.email || "";
  document.getElementById("emailVendedoraWhatsapp").value = item.whatsapp || "";
  document.getElementById("emailCancelarVendedora").style.display = "inline-block";
  mostrarAbaEmail("vendedoras");
}

function cancelarEdicaoVendedoraEmail(){
  document.getElementById("emailVendedoraId").value = "";
  document.getElementById("emailVendedoraNome").value = "";
  document.getElementById("emailVendedoraEmail").value = "";
  document.getElementById("emailVendedoraWhatsapp").value = "";
  document.getElementById("emailCancelarVendedora").style.display = "none";
}

async function excluirVendedoraEmail(id){
  if(!garantirFinanceiroEmail() || !confirm("Excluir esta vendedora?")) return;
  const resposta = await banco.from("email_vendedoras").delete().eq("id",id);
  if(resposta.error){
    alert("Não foi possível excluir. Verifique se existem clientes vinculados a esta vendedora.");
    return;
  }
  await carregarVendedorasEmail();
}

async function carregarClientesEmail(){
  if(!garantirFinanceiroEmail()) return;
  const resposta = await banco.from("email_clientes").select("*").order("nome",{ascending:true});
  if(resposta.error){
    console.error("Erro ao carregar clientes de e-mail:", resposta.error);
    return;
  }
  emailClientes = resposta.data || [];
  montarTabelaClientesEmail();
  if(typeof montarClientesFrete === 'function') montarClientesFrete();
  prepararEnviosEmail();
}

function montarTabelaClientesEmail(lista = emailClientes){
  const tabela = document.getElementById("emailTabelaClientes");
  if(!tabela) return;

  tabela.innerHTML = lista.length ? lista.map(item => {
    const vendedora = emailVendedoras.find(v => v.id === item.vendedora_id);
    return `<tr>
      <td>${escaparHtmlEmail(item.nome)}</td>
      <td>${escaparHtmlEmail(item.cpf_cnpj || "")}</td>
      <td>${(item.emails || []).map(escaparHtmlEmail).join("<br>")}</td>
      <td>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/"))}</td>
      <td>${escaparHtmlEmail(vendedora?.nome || "")}</td>
      <td>${escaparHtmlEmail(vendedora?.email || "")}</td>
      <td>
        <button class="btn azul" onclick="editarClienteEmail('${item.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirClienteEmail('${item.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="7">Nenhum cliente encontrado.</td></tr>`;
}

function filtrarTabelaClientesEmail(){
  const busca = normalizarNomeEmail(document.getElementById("emailBuscaCliente")?.value || "");

  if(!busca){
    montarTabelaClientesEmail(emailClientes);
    return;
  }

  const filtrados = emailClientes.filter(item => {
    const vendedora = emailVendedoras.find(v => v.id === item.vendedora_id);
    const texto = [
      item.nome,
      item.cpf_cnpj || "",
      ...(item.emails || []),
      item.endereco || "",
      item.numero || "",
      item.complemento || "",
      item.bairro || "",
      item.cep || "",
      item.cidade || "",
      item.uf || "",
      item.transportadora_preferencial || "",
      item.observacao_logistica || "",
      vendedora?.nome || "",
      vendedora?.email || ""
    ].join(" ");

    return normalizarNomeEmail(texto).includes(busca);
  });

  montarTabelaClientesEmail(filtrados);
}

function limparBuscaClienteEmail(){
  const campo = document.getElementById("emailBuscaCliente");
  if(campo) campo.value = "";
  montarTabelaClientesEmail(emailClientes);
}

async function salvarClienteEmail(){
  if(!garantirFinanceiroEmail()) return;
  const id = document.getElementById("emailClienteId").value;
  const nome = document.getElementById("emailClienteNome").value.trim();
  const cpf_cnpj = document.getElementById("emailClienteCpfCnpj")?.value.trim() || "";
  const emails = separarEmailsEmail(document.getElementById("emailClienteEmails").value);
  const vendedora_id = document.getElementById("emailClienteVendedora").value;

  if(!nome || !vendedora_id){
    alert("Preencha o nome e selecione a vendedora. O e-mail do cliente pode ficar vazio.");
    return;
  }

  const endereco = document.getElementById("emailClienteEndereco")?.value.trim() || "";
  const numero = document.getElementById("emailClienteNumero")?.value.trim() || "";
  const complemento = document.getElementById("emailClienteComplemento")?.value.trim() || "";
  const bairro = document.getElementById("emailClienteBairro")?.value.trim() || "";
  const cep = document.getElementById("emailClienteCep")?.value.trim() || "";
  const cidade = document.getElementById("emailClienteCidade")?.value.trim() || "";
  const uf = document.getElementById("emailClienteUf")?.value.trim().toUpperCase() || "";
  const transportadora_preferencial = document.getElementById("emailClienteTransportadora")?.value.trim() || "";
  const observacao_logistica = document.getElementById("emailClienteObservacaoLogistica")?.value.trim() || "";

  const dados = {
    nome,cpf_cnpj,emails,vendedora_id,endereco,numero,complemento,bairro,cep,cidade,uf,
    transportadora_preferencial,observacao_logistica,
    ativo:true,atualizado_em:new Date().toISOString()
  };
  const resposta = id
    ? await banco.from("email_clientes").update(dados).eq("id",id)
    : await banco.from("email_clientes").insert([{...dados,criado_por:usuarioLogado.login}]);

  if(resposta.error){ alert("Erro ao salvar cliente: " + resposta.error.message); return; }
  cancelarEdicaoClienteEmail();
  await carregarClientesEmail();
}

function editarClienteEmail(id){
  if(!garantirFinanceiroEmail()) return;
  const item = emailClientes.find(c => c.id === id);
  if(!item) return;
  document.getElementById("emailClienteId").value = item.id;
  document.getElementById("emailClienteNome").value = item.nome || "";
  document.getElementById("emailClienteCpfCnpj").value = item.cpf_cnpj || "";
  document.getElementById("emailClienteEmails").value = (item.emails || []).join("; ");
  document.getElementById("emailClienteEndereco").value = item.endereco || "";
  document.getElementById("emailClienteNumero").value = item.numero || "";
  document.getElementById("emailClienteComplemento").value = item.complemento || "";
  document.getElementById("emailClienteBairro").value = item.bairro || "";
  document.getElementById("emailClienteCep").value = item.cep || "";
  document.getElementById("emailClienteCidade").value = item.cidade || "";
  document.getElementById("emailClienteUf").value = item.uf || "";
  document.getElementById("emailClienteTransportadora").value = item.transportadora_preferencial || "";
  document.getElementById("emailClienteObservacaoLogistica").value = item.observacao_logistica || "";
  document.getElementById("emailClienteVendedora").value = item.vendedora_id || "";
  atualizarEmailVendedoraAutomatico();
  document.getElementById("emailCancelarCliente").style.display = "inline-block";
  mostrarAbaEmail("clientes");
}

function cancelarEdicaoClienteEmail(){
  document.getElementById("emailClienteId").value = "";
  document.getElementById("emailClienteNome").value = "";
  document.getElementById("emailClienteCpfCnpj").value = "";
  document.getElementById("emailClienteEmails").value = "";
  ["emailClienteEndereco","emailClienteNumero","emailClienteComplemento","emailClienteBairro",
   "emailClienteCep","emailClienteCidade","emailClienteUf","emailClienteTransportadora",
   "emailClienteObservacaoLogistica"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
  document.getElementById("emailClienteVendedora").value = "";
  document.getElementById("emailVendedoraAutomatico").value = "";
  document.getElementById("emailCancelarCliente").style.display = "none";
}

async function excluirClienteEmail(id){
  if(!garantirFinanceiroEmail() || !confirm("Excluir este cliente?")) return;
  const resposta = await banco.from("email_clientes").delete().eq("id",id);
  if(resposta.error){ alert("Erro ao excluir cliente: " + resposta.error.message); return; }
  await carregarClientesEmail();
}


async function carregarAssinaturasEmail(){
  if(!garantirFinanceiroEmail() || !banco) return;
  const resposta = await banco.from("email_assinaturas").select("*").order("created_at",{ascending:true});
  if(resposta.error){ console.error("Erro ao carregar assinaturas:",resposta.error); return; }
  emailAssinaturas = resposta.data || [];
  emailAssinaturaAtiva = emailAssinaturas.find(item => item.ativo) || emailAssinaturas[0] || null;
  montarTabelaAssinaturasEmail();
  if(emailAssinaturaAtiva && !document.getElementById("emailAssinaturaId").value){ preencherFormularioAssinatura(emailAssinaturaAtiva); }
  atualizarPreviaAssinatura();
}

function preencherFormularioAssinatura(item){
  document.getElementById("emailAssinaturaId").value=item?.id||"";
  document.getElementById("emailAssinaturaNome").value=item?.nome_remetente||"";
  document.getElementById("emailAssinaturaSetor").value=item?.setor||"";
  document.getElementById("emailAssinaturaTelefone1").value=item?.telefone_1||"";
  document.getElementById("emailAssinaturaTelefone2").value=item?.telefone_2||"";
  document.getElementById("emailAssinaturaWhatsapp").value=item?.whatsapp||"";
  document.getElementById("emailAssinaturaEmail").value=item?.email_exibido||"";
  document.getElementById("emailAssinaturaSite").value=item?.site||"";
  emailLogoTemporariaDataUrl=item?.logo_url||"";
  const img=document.getElementById("emailLogoAtual");
  if(emailLogoTemporariaDataUrl){img.src=emailLogoTemporariaDataUrl;img.style.display="block"}else{img.style.display="none"}
  atualizarPreviaAssinatura();
}

function previsualizarLogoAssinatura(evento){
  const arquivo=evento.target.files?.[0]; if(!arquivo)return;
  if(arquivo.size>2*1024*1024){alert("A logo deve ter no máximo 2 MB.");evento.target.value="";return;}
  const leitor=new FileReader(); leitor.onload=()=>{emailLogoTemporariaDataUrl=String(leitor.result);const img=document.getElementById("emailLogoAtual");img.src=emailLogoTemporariaDataUrl;img.style.display="block";atualizarPreviaAssinatura()}; leitor.readAsDataURL(arquivo);
}

async function enviarLogoAssinaturaStorage(){
  const arquivo=document.getElementById("emailAssinaturaLogo").files?.[0];
  if(!arquivo) return emailLogoTemporariaDataUrl || null;
  const extensao=(arquivo.name.split(".").pop()||"png").toLowerCase();
  const caminho=`assinatura/logo-${Date.now()}.${extensao}`;
  const envio=await banco.storage.from("email-assinaturas").upload(caminho,arquivo,{upsert:false,contentType:arquivo.type});
  if(envio.error) throw new Error("Erro ao enviar logo: "+envio.error.message);
  return banco.storage.from("email-assinaturas").getPublicUrl(caminho).data.publicUrl;
}

function dadosFormularioAssinatura(){return{
  nome_remetente:document.getElementById("emailAssinaturaNome").value.trim(),setor:document.getElementById("emailAssinaturaSetor").value.trim(),telefone_1:document.getElementById("emailAssinaturaTelefone1").value.trim(),telefone_2:document.getElementById("emailAssinaturaTelefone2").value.trim(),whatsapp:document.getElementById("emailAssinaturaWhatsapp").value.trim(),email_exibido:document.getElementById("emailAssinaturaEmail").value.trim(),site:document.getElementById("emailAssinaturaSite").value.trim()};}

async function salvarAssinaturaEmail(){
  if(!garantirFinanceiroEmail())return;
  const id=document.getElementById("emailAssinaturaId").value; const dados=dadosFormularioAssinatura();
  if(!dados.nome_remetente){alert("Informe o nome de quem está enviando.");return;}
  try{
    dados.logo_url=await enviarLogoAssinaturaStorage(); dados.atualizado_em=new Date().toISOString();
    if(!emailAssinaturas.length) dados.ativo=true;
    const resposta=id?await banco.from("email_assinaturas").update(dados).eq("id",id):await banco.from("email_assinaturas").insert([{...dados,ativo:!emailAssinaturas.length,criado_por:usuarioLogado.login}]);
    if(resposta.error)throw resposta.error;
    alert("Assinatura salva com sucesso."); cancelarEdicaoAssinaturaEmail(); await carregarAssinaturasEmail();
  }catch(erro){alert("Erro ao salvar assinatura: "+(erro.message||erro));}
}

function montarTabelaAssinaturasEmail(){
  const tabela=document.getElementById("emailTabelaAssinaturas");if(!tabela)return;
  tabela.innerHTML=emailAssinaturas.length?emailAssinaturas.map(item=>`<tr><td>${item.ativo?'<span class="status finalizado">Ativa</span>':'—'}</td><td>${escaparHtmlEmail(item.nome_remetente||"")}</td><td>${escaparHtmlEmail(item.setor||"")}</td><td>${[item.telefone_1,item.telefone_2,item.whatsapp].filter(Boolean).map(escaparHtmlEmail).join("<br>")}</td><td>${!item.ativo?`<button class="btn verde" onclick="ativarAssinaturaEmail('${item.id}')">Ativar</button>`:""}<button class="btn azul" onclick="editarAssinaturaEmail('${item.id}')">Editar</button><button class="btn vermelho" onclick="excluirAssinaturaEmail('${item.id}')">Excluir</button></td></tr>`).join(""):'<tr><td colspan="5">Nenhuma assinatura cadastrada.</td></tr>';
}

async function ativarAssinaturaEmail(id){if(!garantirFinanceiroEmail())return;await banco.from("email_assinaturas").update({ativo:false}).neq("id",id);const r=await banco.from("email_assinaturas").update({ativo:true}).eq("id",id);if(r.error)alert(r.error.message);await carregarAssinaturasEmail();}
function editarAssinaturaEmail(id){const item=emailAssinaturas.find(x=>x.id===id);if(!item)return;preencherFormularioAssinatura(item);document.getElementById("emailCancelarAssinatura").style.display="inline-block";mostrarAbaEmail("assinaturas")}
async function excluirAssinaturaEmail(id){if(!confirm("Excluir esta assinatura?"))return;const item=emailAssinaturas.find(x=>x.id===id);if(item?.ativo){alert("Ative outra assinatura antes de excluir esta.");return;}const r=await banco.from("email_assinaturas").delete().eq("id",id);if(r.error)alert(r.error.message);await carregarAssinaturasEmail()}
function cancelarEdicaoAssinaturaEmail(){document.getElementById("emailAssinaturaId").value="";["emailAssinaturaNome","emailAssinaturaSetor","emailAssinaturaTelefone1","emailAssinaturaTelefone2","emailAssinaturaWhatsapp","emailAssinaturaEmail","emailAssinaturaSite"].forEach(id=>document.getElementById(id).value="");document.getElementById("emailAssinaturaLogo").value="";emailLogoTemporariaDataUrl="";document.getElementById("emailLogoAtual").style.display="none";document.getElementById("emailCancelarAssinatura").style.display="none";atualizarPreviaAssinatura()}

function assinaturaFormularioOuAtiva(){const d=dadosFormularioAssinatura();return{...emailAssinaturaAtiva,...d,logo_url:emailLogoTemporariaDataUrl||emailAssinaturaAtiva?.logo_url||""}}
function htmlAssinaturaEmail(assinatura=emailAssinaturaAtiva){if(!assinatura)return"";const linha=v=>v?`<div style="line-height:1.5;color:#222;">${escaparHtmlEmail(v)}</div>`:"";return`<div style="margin-top:28px;font-family:Arial,sans-serif;color:#222;">${assinatura.logo_url?`<img src="${escaparHtmlEmail(assinatura.logo_url)}" alt="Sofisticatto Cosméticos" style="display:block;max-width:220px;max-height:110px;object-fit:contain;margin:0 0 22px 0;">`:""}<div style="font-size:20px;font-weight:700;color:#111;">${escaparHtmlEmail(assinatura.nome_remetente||"")}</div>${assinatura.setor?`<div style="margin:3px 0 9px;color:#222;">${escaparHtmlEmail(assinatura.setor)}</div>`:""}${linha(assinatura.telefone_1)}${linha(assinatura.telefone_2)}${assinatura.whatsapp?linha("WhatsApp: "+assinatura.whatsapp):""}${linha(assinatura.email_exibido)}${linha(assinatura.site)}</div>`}
function montarHtmlCompletoEmail(corpo){
  const linhas = String(corpo || "").split("\n");
  const saudacao = linhas.shift() || obterSaudacaoAutomaticaEmail();
  const agradecimento = linhas.pop() || "Obrigado.";
  const mensagem = linhas.join("\n").trim();

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.45;">
    <div style="margin:0 0 10px 0;">${escaparHtmlEmail(saudacao)}</div>
    <div style="margin:0 0 10px 0;white-space:pre-line;">${escaparHtmlEmail(mensagem)}</div>
    <div style="margin:0;">${escaparHtmlEmail(agradecimento)}</div>
    ${htmlAssinaturaEmail()}
  </div>`;
}
function atualizarPreviaAssinatura(){const box=document.getElementById("emailPreviaAssinatura");if(!box)return;box.innerHTML=`<div style="margin-bottom:22px;">Bom dia!<br><br>Segue em anexo Boleto, por favor, confirmar o recebimento deste.<br><br>Obrigado.</div>${htmlAssinaturaEmail(assinaturaFormularioOuAtiva())||'<div style="color:#999;">Preencha os dados para visualizar a assinatura.</div>'}`}

function chaveArquivoEmail(arquivo){
  return `${normalizarNomeEmail(arquivo.name)}_${arquivo.size}_${arquivo.lastModified || 0}`;
}

function adicionarArquivosEmail(novosArquivos){
  const mapa = new Map();

  emailArquivosSelecionados.forEach(arquivo => {
    mapa.set(chaveArquivoEmail(arquivo),arquivo);
  });

  [...novosArquivos].forEach(arquivo => {
    mapa.set(chaveArquivoEmail(arquivo),arquivo);
  });

  emailArquivosSelecionados = [...mapa.values()];
  prepararEnviosEmail();
}

function prepararEnviosEmail(){
  const tabela = document.getElementById("emailTabelaPrevia");
  if(!tabela) return;

  const arquivosValidos = emailArquivosSelecionados.filter(arquivoCompativelModoEmail);
  const grupos = new Map();

  arquivosValidos.forEach(arquivo => {
    const nome = nomeClienteDoArquivoEmail(arquivo);
    const chave = normalizarNomeEmail(nome);
    if(!grupos.has(chave)) grupos.set(chave,{nome,arquivos:[]});
    grupos.get(chave).arquivos.push(arquivo);
  });

  emailEnviosPreparados = [...grupos.values()].map(grupo => {
    const cliente = emailClientes.find(item => normalizarNomeEmail(item.nome) === normalizarNomeEmail(grupo.nome) && item.ativo !== false);
    const vendedora = cliente ? emailVendedoras.find(item => item.id === cliente.vendedora_id) : null;
    return {
      clienteNome:grupo.nome,
      cliente,
      vendedora,
      para:(cliente?.emails || []).length ? (cliente.emails || []) : (vendedora?.email ? [vendedora.email] : []),
      cc:(cliente?.emails || []).length && vendedora?.email ? [vendedora.email] : [],
      assunto:grupo.nome,
      corpo:textoCorpoEmail(),
      arquivos:grupo.arquivos,
      status:cliente && vendedora?.email ? "pronto" : "pendente",
      somenteVendedora:!!cliente && !(cliente.emails || []).length && !!vendedora?.email
    };
  });

  document.getElementById("emailQtdSelecionados").innerHTML = emailArquivosSelecionados.length + " arquivo(s)";
  document.getElementById("emailKpiArquivos").innerHTML = arquivosValidos.length;
  document.getElementById("emailKpiClientes").innerHTML = emailEnviosPreparados.length;
  document.getElementById("emailKpiProntos").innerHTML = emailEnviosPreparados.filter(item => item.status === "pronto").length;
  document.getElementById("emailKpiPendentes").innerHTML = emailEnviosPreparados.filter(item => item.status !== "pronto").length;

  tabela.innerHTML = emailEnviosPreparados.length ? emailEnviosPreparados.map((item,indice) => `
    <tr>
      <td><b>${escaparHtmlEmail(item.clienteNome)}</b><br><small>${escaparHtmlEmail(item.assunto)}</small></td>
      <td>${item.para.length ? item.para.map(escaparHtmlEmail).join("<br>") : "—"}</td>
      <td>${item.cc.length ? item.cc.map(escaparHtmlEmail).join("<br>") : "—"}</td>
      <td class="email-arquivos">${item.arquivos.map(arquivo => `• ${escaparHtmlEmail(arquivo.name)} <small>(${(arquivo.size/1024).toFixed(0)} KB)</small>`).join("<br>")}</td>
      <td class="${item.status === "pronto" ? "email-status-ok" : "email-status-erro"}">${item.status === "pronto" ? (item.somenteVendedora ? "Pronto — somente vendedora" : "Pronto") : "Cliente/vendedora não cadastrado"}</td>
      <td>${item.status === "pronto"
        ? `<button class="btn verde" onclick="enviarEmailIndividual(${indice},this)">Enviar</button>`
        : `<button class="btn azul" onclick="cadastrarClientePendenteEmail('${encodeURIComponent(item.clienteNome)}')">Cadastrar</button>`}
      </td>
    </tr>`).join("") : `<tr><td colspan="6">Nenhum arquivo compatível com o tipo escolhido.</td></tr>`;
}

function cadastrarClientePendenteEmail(nomeCodificado){
  mostrarAbaEmail("clientes");
  document.getElementById("emailClienteNome").value = decodeURIComponent(nomeCodificado);
  document.getElementById("emailClienteEmails").focus();
}

function limparArquivosEmail(){
  emailArquivosSelecionados = [];
  document.getElementById("emailArquivos").value = "";
  prepararEnviosEmail();
}

function arquivoParaBase64Email(arquivo){
  return new Promise((resolve,reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function montarPayloadEmail(item){
  return {
    remetente:"faturamento@sofisticatto1.com.br",
    para:item.para,
    cc:item.cc,
    assunto:item.assunto,
    texto:item.corpo,
    html:montarHtmlCompletoEmail(item.corpo),
    cliente_id:item.cliente?.id || null,
    enviado_por:usuarioLogado.login,
    tipo_envio:emailModoAtual,
    anexos:await Promise.all(item.arquivos.map(async arquivo => ({
      nome:arquivo.name,
      tipo:arquivo.type || "application/octet-stream",
      conteudo_base64:await arquivoParaBase64Email(arquivo)
    })))
  };
}

async function registrarHistoricoEmail(item,status,erro=""){
  const resposta = await banco.from("email_envios").insert([{
    cliente_id:item.cliente?.id || null,
    cliente_nome:item.clienteNome,
    tipo_envio:emailModoAtual,
    assunto:item.assunto,
    corpo_email:item.corpo,
    destinatarios:item.para,
    copia:item.cc,
    quantidade_anexos:item.arquivos.length,
    nomes_arquivos:item.arquivos.map(arquivo => arquivo.name),
    status,
    erro:erro || null,
    enviado_por:usuarioLogado.login,
    enviado_em:status === "enviado" ? new Date().toISOString() : null
  }]).select().single();

  if(resposta.error) console.error("Erro ao registrar histórico de e-mail:",resposta.error);
}

async function executarEnvioEmail(item){
  const payload = await montarPayloadEmail(item);
  const resposta = await fetch(`/api/enviar-email`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });

  const texto = await resposta.text();
  if(!resposta.ok) throw new Error(texto || "Falha no serviço de envio.");
  return texto;
}

function mostrarAvisoEmail(mensagem,sucesso=false){
  const aviso = document.getElementById("emailAvisoEnvio");
  aviso.innerHTML = escaparHtmlEmail(mensagem);
  aviso.className = "email-aviso" + (sucesso ? " email-sucesso" : "");
  aviso.style.display = "block";
}

async function enviarEmailIndividual(indice,botao){
  if(!garantirFinanceiroEmail()) return;
  const item = emailEnviosPreparados[indice];
  if(!item || item.status !== "pronto") return;

  const textoOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = "Enviando...";

  try{
    await executarEnvioEmail(item);
    await registrarHistoricoEmail(item,"enviado");
    item.status = "enviado";
    botao.innerHTML = "Enviado";
    botao.className = "btn verde";
    mostrarAvisoEmail(`E-mail de ${item.clienteNome} enviado com sucesso.`,true);
    carregarHistoricoEmail();
  }catch(erro){
    await registrarHistoricoEmail(item,"erro",erro.message);
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
    mostrarAvisoEmail(`Erro ao enviar para ${item.clienteNome}: ${erro.message}`);
  }
}

async function enviarTodosEmails(){
  if(!garantirFinanceiroEmail()) return;
  const prontos = emailEnviosPreparados.filter(item => item.status === "pronto");
  if(!prontos.length){ mostrarAvisoEmail("Nenhum envio está pronto."); return; }
  if(!confirm(`Enviar ${prontos.length} e-mail(s) agora?`)) return;

  let enviados = 0;
  const erros = [];

  for(const item of prontos){
    try{
      await executarEnvioEmail(item);
      await registrarHistoricoEmail(item,"enviado");
      item.status = "enviado";
      enviados++;
    }catch(erro){
      await registrarHistoricoEmail(item,"erro",erro.message);
      erros.push(`${item.clienteNome}: ${erro.message}`);
    }
  }

  prepararEnviosEmail();
  carregarHistoricoEmail();
  mostrarAvisoEmail(erros.length
    ? `${enviados} enviado(s). Falhas: ${erros.join(" | ")}`
    : `${enviados} e-mail(s) enviado(s) com sucesso.`,erros.length === 0);
}

async function carregarHistoricoEmail(){
  if(!garantirFinanceiroEmail() || !banco) return;
  const resposta = await banco.from("email_envios").select("*").order("created_at",{ascending:false}).limit(300);
  if(resposta.error){
    console.error("Erro ao carregar histórico de e-mails:",resposta.error);
    return;
  }

  const tabela = document.getElementById("emailTabelaHistorico");
  if(!tabela) return;
  tabela.innerHTML = (resposta.data || []).length ? resposta.data.map(item => `
    <tr>
      <td>${new Date(item.created_at).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEmail(item.cliente_nome || "")}</td>
      <td>${escaparHtmlEmail(item.tipo_envio || "")}</td>
      <td>${(item.destinatarios || []).map(escaparHtmlEmail).join("<br>")}</td>
      <td>${(item.copia || []).map(escaparHtmlEmail).join("<br>")}</td>
      <td class="email-arquivos">${(item.nomes_arquivos || []).map(nome => "• " + escaparHtmlEmail(nome)).join("<br>")}</td>
      <td class="${item.status === "enviado" ? "email-status-ok" : "email-status-erro"}">${escaparHtmlEmail(item.status || "")}${item.erro ? "<br><small>"+escaparHtmlEmail(item.erro)+"</small>" : ""}</td>
      <td>${escaparHtmlEmail(item.enviado_por || "")}</td>
    </tr>`).join("") : `<tr><td colspan="8">Nenhum envio registrado.</td></tr>`;
}

/* Seleção e arraste de arquivos */
document.addEventListener("change",evento => {
  if(evento.target && evento.target.id === "emailArquivos"){
    adicionarArquivosEmail(evento.target.files);
    evento.target.value = "";
  }
});

document.addEventListener("DOMContentLoaded",() => {
  const area = document.getElementById("emailDrop");
  if(!area) return;

  ["dragenter","dragover"].forEach(nomeEvento => area.addEventListener(nomeEvento,evento => {
    evento.preventDefault();
    evento.stopPropagation();
    area.classList.add("arrastando");
  }));

  ["dragleave","drop"].forEach(nomeEvento => area.addEventListener(nomeEvento,evento => {
    evento.preventDefault();
    evento.stopPropagation();
    area.classList.remove("arrastando");
  }));

  area.addEventListener("drop",evento => {
    adicionarArquivosEmail(evento.dataTransfer.files);
  });
});



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
  janela.document.write(`<!DOCTYPE html><html><head><title>${nomeArquivoRelatorio()}</title>
</head><body><div class="relatorio-folha">${folha.innerHTML}</div><script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
  janela.document.close();
}


/* =========================================================
   ETIQUETAS DE ENTREGA 150 × 100 MM
   ========================================================= */
async function carregarBibliotecasEtiqueta(){
  const promessas = [];

  if(!window.QRCode){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar QR Code."));
      document.head.appendChild(script);
    }));
  }

  if(!window.JsBarcode){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar código de barras."));
      document.head.appendChild(script);
    }));
  }

  if(!window.html2canvas){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar gerador de imagem."));
      document.head.appendChild(script);
    }));
  }

  if(!window.jspdf?.jsPDF){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar gerador de PDF."));
      document.head.appendChild(script);
    }));
  }

  await Promise.all(promessas);
}

async function inicializarModuloEtiquetas(){
  if(!garantirFinanceiroEmail()) return;

  try{
    await carregarBibliotecasEtiqueta();
    await carregarHistoricoEtiquetas();
    montarListaFaixasPedidoEtiqueta();
    atualizarValoresAjustesEtiqueta();
    atualizarPreviewEtiqueta();
  }catch(erro){
    console.error("Erro no módulo de etiquetas:",erro);
    alert(erro.message);
  }
}


const ETQ_AJUSTES_PADRAO={
  destino:0,endereco:0,bairro:0,cep:0,cidade:0,nf:0,volume:0,chave:0,
  logo:0,qr:0,barcodeLargura:0,barcodeAltura:0
};
let etqAjustesTamanho=carregarTamanhosEtiqueta();

function carregarTamanhosEtiqueta(){
  try{
    return {...ETQ_AJUSTES_PADRAO,...JSON.parse(localStorage.getItem("sofisticatto_etiqueta_tamanhos") || "{}")};
  }catch{
    return {...ETQ_AJUSTES_PADRAO};
  }
}

function salvarTamanhosEtiqueta(){
  localStorage.setItem("sofisticatto_etiqueta_tamanhos",JSON.stringify(etqAjustesTamanho));
}

function ajustarTamanhoEtiqueta(campo,delta){
  const limites={
    destino:[-10,24],endereco:[-10,24],bairro:[-10,24],cep:[-10,24],
    cidade:[-10,24],nf:[-10,24],volume:[-10,24],chave:[-5,12],
    logo:[-100,100],qr:[-35,40],barcodeLargura:[-160,120],barcodeAltura:[-20,50]
  };
  const [min,max]=limites[campo] || [-50,50];
  etqAjustesTamanho[campo]=Math.max(min,Math.min(max,Number(etqAjustesTamanho[campo] || 0)+Number(delta)));
  salvarTamanhosEtiqueta();
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewEtiqueta();
}

function restaurarTamanhosEtiqueta(){
  etqAjustesTamanho={...ETQ_AJUSTES_PADRAO};
  salvarTamanhosEtiqueta();
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewEtiqueta();
}

function atualizarValoresAjustesEtiqueta(){
  const mapa={
    destino:"etqValDestino",endereco:"etqValEndereco",bairro:"etqValBairro",
    cep:"etqValCep",cidade:"etqValCidade",nf:"etqValNf",volume:"etqValVolume",
    chave:"etqValChave",logo:"etqValLogo",qr:"etqValQr",
    barcodeLargura:"etqValBarcodeLargura",barcodeAltura:"etqValBarcodeAltura"
  };
  Object.entries(mapa).forEach(([campo,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    const valor=Number(etqAjustesTamanho[campo] || 0);
    el.textContent=valor===0 ? "Padrão" : `${valor>0?"+":""}${valor}`;
  });

  const transp=document.getElementById("etqValTransportadora");
  const seletorTransp=document.getElementById("etqTransportadoraFonte");
  if(transp && seletorTransp){
    transp.textContent=seletorTransp.value==="auto" ? "Automático" : seletorTransp.value;
  }
}

function aplicarAjustesTamanhoEtiqueta(etiqueta){
  if(!etiqueta) return;

  const campos=[
    ["destino",".etiqueta-destino",23],
    ["endereco",".etiqueta-endereco",18],
    ["bairro",".etiqueta-bairro",18],
    ["cep",".etiqueta-cep",17],
    ["cidade",".etiqueta-cidade",18],
    ["nf",".etiqueta-nf",22],
    ["volume",".etiqueta-volume",22],
    ["chave",".etiqueta-chave",10]
  ];

  campos.forEach(([campo,seletor,tamanhoPadrao])=>{
    const elemento=etiqueta.querySelector(seletor);
    if(!elemento) return;

    // Usa sempre o tamanho padrão fixo como base.
    // Isso impede que o ajuste seja somado novamente toda vez que
    // qualquer outro botão atualizar a prévia.
    const ajuste=Number(etqAjustesTamanho[campo] || 0);
    elemento.style.fontSize=`${Math.max(7,tamanhoPadrao+ajuste)}px`;
  });

  const logo=etiqueta.querySelector(".etiqueta-logo");
  if(logo){
    const base=264;
    const largura=Math.max(120,base+Number(etqAjustesTamanho.logo || 0));
    logo.style.width=`${largura}px`;
    logo.style.maxWidth=`${largura}px`;
    logo.style.height="117px";
    logo.style.maxHeight="117px";
    logo.style.objectFit="contain";
  }

  const qr=etiqueta.querySelector(".etiqueta-qr");
  if(qr){
    const tamanho=Math.max(45,83+Number(etqAjustesTamanho.qr || 0));
    qr.style.width=`${tamanho}px`;
    qr.style.height=`${tamanho}px`;
    const imagem=qr.querySelector("canvas,img");
    if(imagem){
      imagem.style.width=`${tamanho}px`;
      imagem.style.height=`${tamanho}px`;
    }
  }

  const barcode=etiqueta.querySelector(".etiqueta-barcode");
  if(barcode){
    const larguraBase=454;
    const largura=Math.max(250,Math.min(490,larguraBase+Number(etqAjustesTamanho.barcodeLargura || 0)));
    const altura=Math.max(16,34+Number(etqAjustesTamanho.barcodeAltura || 0));

    barcode.style.width=`${largura}px`;
    barcode.style.height=`${altura}px`;

    // Centraliza o código de barras dentro da área útil da etiqueta.
    const larguraEtiqueta=etiqueta.getBoundingClientRect().width || 567;
    const areaUtilEsquerda=19;   // aproximadamente 5 mm
    const areaUtilDireita=95;    // reserva para a transportadora
    const centroUtil=(areaUtilEsquerda + (larguraEtiqueta-areaUtilDireita))/2;

    barcode.style.left=`${Math.max(0,centroUtil-(largura/2))}px`;
    barcode.style.right="auto";

    const chave=etiqueta.querySelector(".etiqueta-chave");
    if(chave){
      chave.style.width=`${largura}px`;
      chave.style.left=barcode.style.left;
      chave.style.right="auto";
    }
  }
}

function dadosEtiquetaFormulario(){
  return {
    cliente:document.getElementById("etqCliente")?.value.trim() || "",
    endereco:document.getElementById("etqEndereco")?.value.trim().toUpperCase() || "",
    bairro:document.getElementById("etqBairro")?.value.trim().toUpperCase() || "",
    cep:document.getElementById("etqCep")?.value.trim() || "",
    cidade:document.getElementById("etqCidade")?.value.trim().toUpperCase() || "",
    uf:document.getElementById("etqUf")?.value.trim().toUpperCase() || "",
    numero_nf:document.getElementById("etqNf")?.value.trim() || "",
    quantidade_volumes:Math.max(1,parseInt(document.getElementById("etqVolumes")?.value || "1",10) || 1),
    transportadora:document.getElementById("etqTransportadora")?.value.trim().toUpperCase() || "",
    transportadora_duas_linhas:document.getElementById("etqTransportadoraDuasLinhas")?.checked || false,
    transportadora_fonte:document.getElementById("etqTransportadoraFonte")?.value || "auto",
    pedidos_faixas:etiquetaPedidosFaixas.map(item=>({...item})),
    ajustes_tamanho:{...etqAjustesTamanho},
    chave_nfe:(document.getElementById("etqChave")?.value || "").replace(/\D/g,"").slice(0,44)
  };
}

function formatarCepEtiquetaCampo(campo){
  const numeros=String(campo.value || "").replace(/\D/g,"").slice(0,8);
  campo.value=numeros.length>5 ? `${numeros.slice(0,5)}-${numeros.slice(5)}` : numeros;
}

function formatarCepEtiqueta(valor){
  const numeros=String(valor || "").replace(/\D/g,"").slice(0,8);
  return numeros.length===8 ? `${numeros.slice(0,5)}-${numeros.slice(5)}` : (valor || "");
}

function formatarNfEtiqueta(valor){
  const numero=String(valor || "").replace(/\D/g,"");
  if(!numero) return "—";
  return numero.replace(/\B(?=(\d{3})+(?!\d))/g,".");
}

function formatarVolumeEtiqueta(atual,total){
  const tamanho=Math.max(2,String(total).length);
  return `${String(atual).padStart(tamanho,"0")} / ${String(total).padStart(tamanho,"0")}`;
}

function logoEtiquetaUrl(){
  return emailAssinaturaAtiva?.logo_url || "";
}

function montarQrEtiqueta(elemento){
  if(!window.QRCode || !elemento) return;
  elemento.innerHTML="";
  new QRCode(elemento,{
    text:ETIQUETA_INSTAGRAM_URL,
    width:112,
    height:112,
    colorDark:"#000000",
    colorLight:"#ffffff",
    correctLevel:QRCode.CorrectLevel.M
  });
}

function montarBarcodeEtiqueta(elemento,chave){
  if(!window.JsBarcode || !elemento) return;
  elemento.innerHTML="";
  if(!chave){
    elemento.setAttribute("viewBox","0 0 500 80");
    elemento.innerHTML='<text x="250" y="45" text-anchor="middle" font-size="22">CHAVE DA NF-E</text>';
    return;
  }
  JsBarcode(elemento,chave,{
    format:"CODE128",
    displayValue:false,
    margin:0,
    height:38,
    width:1.12,
    background:"#ffffff",
    lineColor:"#000000"
  });
}

function quebrarTransportadoraEmDuasLinhas(texto){
  const nome=String(texto || "").trim();
  if(!nome) return [""];

  const palavras=nome.split(/\s+/);
  if(palavras.length===1){
    const meio=Math.ceil(nome.length/2);
    return [nome.slice(0,meio),nome.slice(meio)];
  }

  let melhor=[nome,""];
  let menorDiferenca=Infinity;

  for(let i=1;i<palavras.length;i++){
    const primeira=palavras.slice(0,i).join(" ");
    const segunda=palavras.slice(i).join(" ");
    const diferenca=Math.abs(primeira.length-segunda.length);

    if(diferenca<menorDiferenca){
      menorDiferenca=diferenca;
      melhor=[primeira,segunda];
    }
  }

  return melhor;
}

function tamanhoFonteTransportadora(texto,duasLinhas){
  const tamanho=String(texto || "").replace(/\s+/g,"").trim().length;

  if(duasLinhas){
    if(tamanho>32) return "3.8mm";
    if(tamanho>24) return "4.5mm";
    if(tamanho>18) return "5.2mm";
    if(tamanho>12) return "6mm";
    return "7mm";
  }

  if(tamanho<=5) return "8.5mm";
  if(tamanho<=7) return "6.2mm";
  if(tamanho<=9) return "5.1mm";
  if(tamanho<=12) return "4.1mm";
  if(tamanho<=16) return "3.4mm";
  if(tamanho<=22) return "2.9mm";
  return "2.5mm";
}

function fonteTransportadoraEscolhida(texto,duasLinhas){
  const seletor=document.getElementById("etqTransportadoraFonte");
  const valor=seletor?.value || "auto";

  if(valor!=="auto"){
    return valor.endsWith("px") ? valor : `${valor}px`;
  }

  return tamanhoFonteTransportadora(texto,duasLinhas);
}

function ajustarFonteTransportadora(delta){
  const seletor=document.getElementById("etqTransportadoraFonte");
  if(!seletor) return;

  let atual;
  if(seletor.value==="auto"){
    const automatico=tamanhoFonteTransportadora(
      document.getElementById("etqTransportadora")?.value || "",
      document.getElementById("etqTransportadoraDuasLinhas")?.checked || false
    );
    atual=Math.round(parseFloat(automatico) * 3.7795275591);
  }else{
    atual=parseFloat(seletor.value);
  }

  atual=Math.max(12,Math.min(72,atual+delta));
  atual=Math.round(atual);

  let opcao=[...seletor.options].find(item=>parseFloat(item.value)===atual);
  if(!opcao){
    opcao=document.createElement("option");
    opcao.value=`${atual}px`;
    opcao.textContent=`${atual}px`;
    seletor.appendChild(opcao);
  }

  seletor.value=opcao.value;
  atualizarPreviewEtiqueta();
}


function pedidoParaVolumeEtiqueta(volume,faixas=etiquetaPedidosFaixas){
  const numero=Number(volume);
  return (faixas || []).find(item=>numero>=Number(item.inicio) && numero<=Number(item.fim)) || null;
}

function fonteAutomaticaPedidoEtiqueta(texto){
  const tamanho=String(texto || "").length;
  return tamanho>18 ? 13 : tamanho>14 ? 15 : tamanho>10 ? 17 : 20;
}

function ajustarFontePedidoEtiqueta(elemento,texto,fonte="auto"){
  if(!elemento) return;
  const tamanhoPx=fonte && fonte!=="auto"
    ? Math.max(12,Math.min(72,Number(fonte) || 24))
    : fonteAutomaticaPedidoEtiqueta(texto);
  elemento.style.fontSize=`${tamanhoPx}px`;
}

function definirOpcaoFontePedido(select,valor){
  if(!select) return;
  const normalizado=valor==="auto" ? "auto" : String(Math.max(12,Math.min(72,Number(valor) || 24)));
  let opcao=[...select.options].find(item=>item.value===normalizado);
  if(!opcao && normalizado!=="auto"){
    opcao=document.createElement("option");
    opcao.value=normalizado;
    opcao.textContent=`${normalizado}px`;
    select.appendChild(opcao);
  }
  select.value=normalizado;
}

function ajustarFonteNovaFaixaPedido(delta){
  const select=document.getElementById("etqPedidoFonte");
  if(!select) return;
  let atual=select.value==="auto"
    ? fonteAutomaticaPedidoEtiqueta(document.getElementById("etqPedidoNome")?.value || "")
    : Number(select.value);
  atual=Math.max(12,Math.min(72,atual+delta));
  definirOpcaoFontePedido(select,atual);
}

function ajustarFonteFaixaPedido(id,delta){
  const item=etiquetaPedidosFaixas.find(faixa=>faixa.id===id);
  if(!item) return;
  let atual=item.fonte==="auto" || !item.fonte
    ? fonteAutomaticaPedidoEtiqueta(item.nome)
    : Number(item.fonte);
  atual=Math.max(12,Math.min(72,atual+delta));
  item.fonte=String(atual);
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}

function montarListaFaixasPedidoEtiqueta(){
  const lista=document.getElementById("etqPedidosLista");
  if(!lista) return;

  lista.innerHTML=etiquetaPedidosFaixas.length
    ? etiquetaPedidosFaixas
        .slice()
        .sort((a,b)=>a.inicio-b.inicio)
        .map(item=>`
          <div class="etiqueta-pedido-item">
            <strong>${escaparHtmlEmail(item.nome)}</strong>
            <span>VOL ${String(item.inicio).padStart(2,"0")}–${String(item.fim).padStart(2,"0")}</span>
            <span>${item.fonte && item.fonte!=="auto" ? escaparHtmlEmail(item.fonte)+"px" : "Automático"}</span>
            <div class="pedido-fonte-acoes">
              <button type="button" onclick="ajustarFonteFaixaPedido('${item.id}',-2)">A−</button>
              <button type="button" onclick="ajustarFonteFaixaPedido('${item.id}',2)">A+</button>
            </div>
            <button type="button" onclick="removerFaixaPedidoEtiqueta('${item.id}')">Excluir</button>
          </div>`).join("")
    : '<small style="color:#7d73bd;">Nenhuma identificação adicionada.</small>';
}

function adicionarFaixaPedidoEtiqueta(){
  const nome=(document.getElementById("etqPedidoNome")?.value || "").trim().toUpperCase();
  const inicio=parseInt(document.getElementById("etqPedidoInicio")?.value || "0",10);
  const fim=parseInt(document.getElementById("etqPedidoFim")?.value || "0",10);
  const fonte=document.getElementById("etqPedidoFonte")?.value || "auto";
  const total=Math.max(1,parseInt(document.getElementById("etqVolumes")?.value || "1",10));

  if(!nome){
    alert("Informe o nome ou a identificação do pedido.");
    return;
  }
  if(!inicio || !fim || inicio<1 || fim<inicio){
    alert("Informe uma faixa de volumes válida. Exemplo: do volume 1 até o volume 5.");
    return;
  }
  if(fim>total){
    alert(`O volume final não pode ser maior que a quantidade total de volumes (${total}).`);
    return;
  }

  const conflito=etiquetaPedidosFaixas.find(item=>inicio<=item.fim && fim>=item.inicio);
  if(conflito){
    alert(`Essa faixa coincide com ${conflito.nome}, volumes ${conflito.inicio} a ${conflito.fim}.`);
    return;
  }

  etiquetaPedidosFaixas.push({
    id:`faixa_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    nome,
    inicio,
    fim,
    fonte
  });

  document.getElementById("etqPedidoNome").value="";
  document.getElementById("etqPedidoInicio").value="";
  document.getElementById("etqPedidoFim").value="";
  document.getElementById("etqPedidoFonte").value="auto";
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}

function removerFaixaPedidoEtiqueta(id){
  etiquetaPedidosFaixas=etiquetaPedidosFaixas.filter(item=>item.id!==id);
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}


function atualizarPreviewsFaixasEtiqueta(){
  const secao=document.getElementById("etqFaixasPreview");
  const grid=document.getElementById("etqFaixasPreviewGrid");
  if(!secao || !grid) return;

  const d=dadosEtiquetaFormulario();
  const faixas=(d.pedidos_faixas || []).slice().sort((a,b)=>Number(a.inicio)-Number(b.inicio));

  if(!faixas.length){
    secao.style.display="none";
    grid.innerHTML="";
    return;
  }

  secao.style.display="block";
  grid.innerHTML="";

  faixas.forEach(faixa=>{
    const volume=Math.max(1,Number(faixa.inicio) || 1);
    const card=document.createElement("div");
    card.className="etiqueta-faixa-card";

    const titulo=document.createElement("div");
    titulo.className="etiqueta-faixa-titulo";
    titulo.textContent=`${faixa.nome} — volumes ${String(faixa.inicio).padStart(2,"0")} a ${String(faixa.fim).padStart(2,"0")}`;

    const wrap=document.createElement("div");
    wrap.className="etiqueta-mini-wrap";
    wrap.appendChild(criarElementoEtiqueta(d,volume));

    card.appendChild(titulo);
    card.appendChild(wrap);
    grid.appendChild(card);
  });
}



let enderecoXmlPendenteEtiqueta=null;
let resolverEscolhaEnderecoEtiqueta=null;

function formatarEnderecoEscolhaEtiqueta(dados){
  const enderecoNumero=[dados.endereco,dados.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,dados.complemento].filter(Boolean).join(" - ");
  return [
    enderecoCompleto,
    dados.bairro ? `Bairro: ${dados.bairro}` : "",
    dados.cep ? `CEP: ${formatarCepEtiqueta(dados.cep)}` : "",
    [dados.cidade,dados.uf].filter(Boolean).join("/")
  ].filter(Boolean).map(escaparHtmlEmail).join("<br>") || "Endereço não informado.";
}

function cadastroPossuiEnderecoLogistico(cliente){
  return !!(cliente && (cliente.endereco || cliente.bairro || cliente.cep || cliente.cidade || cliente.uf));
}

function limparNovoEnderecoEtiqueta(){
  ["novoEtqEndereco","novoEtqNumero","novoEtqComplemento","novoEtqBairro",
   "novoEtqCep","novoEtqCidade","novoEtqUf"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
}

function alternarNovoEnderecoEtiqueta(){
  const opcao=document.querySelector('input[name="enderecoEtiquetaEscolhido"]:checked')?.value;
  const box=document.getElementById("novoEnderecoEtiquetaBox");
  if(box) box.style.display=opcao==="novo" ? "block" : "none";
}

function dadosNovoEnderecoEtiqueta(){
  return {
    endereco:document.getElementById("novoEtqEndereco")?.value.trim() || "",
    numero:document.getElementById("novoEtqNumero")?.value.trim() || "",
    complemento:document.getElementById("novoEtqComplemento")?.value.trim() || "",
    bairro:document.getElementById("novoEtqBairro")?.value.trim() || "",
    cep:document.getElementById("novoEtqCep")?.value.trim() || "",
    cidade:document.getElementById("novoEtqCidade")?.value.trim() || "",
    uf:document.getElementById("novoEtqUf")?.value.trim().toUpperCase() || ""
  };
}

function abrirEscolhaEnderecoEtiqueta(cliente,dadosXml){
  return new Promise(resolve=>{
    enderecoXmlPendenteEtiqueta={cliente,dadosXml};
    resolverEscolhaEnderecoEtiqueta=resolve;

    document.getElementById("enderecoCadastradoPrevia").innerHTML=
      formatarEnderecoEscolhaEtiqueta({
        endereco:cliente.endereco || "",
        numero:cliente.numero || "",
        complemento:cliente.complemento || "",
        bairro:cliente.bairro || "",
        cep:cliente.cep || "",
        cidade:cliente.cidade || "",
        uf:cliente.uf || ""
      });

    document.getElementById("enderecoXmlPrevia").innerHTML=
      formatarEnderecoEscolhaEtiqueta(dadosXml);

    document.querySelectorAll('input[name="enderecoEtiquetaEscolhido"]').forEach(item=>{
      item.checked=item.value==="cadastrado";
    });

    limparNovoEnderecoEtiqueta();
    alternarNovoEnderecoEtiqueta();
    document.getElementById("modalEscolherEnderecoEtiqueta").style.display="flex";
  });
}

function cancelarEscolhaEnderecoEtiqueta(){
  document.getElementById("modalEscolherEnderecoEtiqueta").style.display="none";
  if(resolverEscolhaEnderecoEtiqueta) resolverEscolhaEnderecoEtiqueta(null);
  resolverEscolhaEnderecoEtiqueta=null;
  enderecoXmlPendenteEtiqueta=null;
}

async function confirmarEscolhaEnderecoEtiqueta(substituirCadastro){
  const tipo=document.querySelector('input[name="enderecoEtiquetaEscolhido"]:checked')?.value || "cadastrado";
  const pendente=enderecoXmlPendenteEtiqueta;

  if(!pendente){
    cancelarEscolhaEnderecoEtiqueta();
    return;
  }

  let dadosEscolhidos;

  if(tipo==="cadastrado"){
    dadosEscolhidos={
      endereco:pendente.cliente.endereco || "",
      numero:pendente.cliente.numero || "",
      complemento:pendente.cliente.complemento || "",
      bairro:pendente.cliente.bairro || "",
      cep:pendente.cliente.cep || "",
      cidade:pendente.cliente.cidade || "",
      uf:pendente.cliente.uf || ""
    };
  }else if(tipo==="xml"){
    dadosEscolhidos={...pendente.dadosXml};
  }else{
    dadosEscolhidos=dadosNovoEnderecoEtiqueta();

    if(!dadosEscolhidos.endereco || !dadosEscolhidos.cidade || !dadosEscolhidos.uf){
      alert("Para cadastrar outro endereço, informe pelo menos Endereço, Cidade e UF.");
      return;
    }
  }

  if(substituirCadastro && tipo!=="cadastrado"){
    const resposta=await banco
      .from("email_clientes")
      .update({
        endereco:dadosEscolhidos.endereco || "",
        numero:dadosEscolhidos.numero || "",
        complemento:dadosEscolhidos.complemento || "",
        bairro:dadosEscolhidos.bairro || "",
        cep:dadosEscolhidos.cep || "",
        cidade:dadosEscolhidos.cidade || "",
        uf:dadosEscolhidos.uf || "",
        atualizado_em:new Date().toISOString()
      })
      .eq("id",pendente.cliente.id)
      .select()
      .single();

    if(resposta.error){
      alert("Não foi possível substituir o endereço cadastrado: "+resposta.error.message);
      return;
    }

    const posicao=emailClientes.findIndex(item=>item.id===pendente.cliente.id);
    if(posicao>=0) emailClientes[posicao]=resposta.data;
    montarTabelaClientesEmail();
  }

  document.getElementById("modalEscolherEnderecoEtiqueta").style.display="none";

  if(resolverEscolhaEnderecoEtiqueta){
    resolverEscolhaEnderecoEtiqueta({
      tipo,
      dados:dadosEscolhidos,
      substituiu:!!substituirCadastro
    });
  }

  resolverEscolhaEnderecoEtiqueta=null;
  enderecoXmlPendenteEtiqueta=null;
}


function preencherEnderecoEtiquetaComCadastro(cliente){
  const enderecoNumero=[cliente.endereco,cliente.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,cliente.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=cliente.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(cliente.cep || "");
  document.getElementById("etqCidade").value=cliente.cidade || "";
  document.getElementById("etqUf").value=cliente.uf || "";
}

function preencherEnderecoEtiquetaComXml(dadosXml){
  const enderecoNumero=[dadosXml.endereco,dadosXml.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,dadosXml.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=dadosXml.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(dadosXml.cep || "");
  document.getElementById("etqCidade").value=dadosXml.cidade || "";
  document.getElementById("etqUf").value=dadosXml.uf || "";
}

function ajustarLinhasVisiveisEtiqueta(etiqueta,d){
  if(!etiqueta) return;

  const valores={
    ".etiqueta-endereco":d.endereco,
    ".etiqueta-bairro":d.bairro,
    ".etiqueta-cep":d.cep,
    ".etiqueta-cidade":[d.cidade,d.uf].filter(Boolean).join("/"),
    ".etiqueta-nf":d.numero_nf,
    ".etiqueta-chave":d.chave_nfe,
    ".etiqueta-barcode":d.chave_nfe,
    ".etiqueta-transportadora":d.transportadora
  };

  Object.entries(valores).forEach(([seletor,valor])=>{
    const elemento=etiqueta.querySelector(seletor);
    if(elemento) elemento.style.display=valor ? "" : "none";
  });

  let topo=44;
  [
    [".etiqueta-endereco",d.endereco,7],
    [".etiqueta-bairro",d.bairro,7],
    [".etiqueta-cep",d.cep,7],
    [".etiqueta-cidade",[d.cidade,d.uf].filter(Boolean).join("/"),8]
  ].forEach(([seletor,valor,espaco])=>{
    if(!valor) return;
    const elemento=etiqueta.querySelector(seletor);
    if(elemento){
      elemento.style.top=`${topo}mm`;
      topo+=espaco;
    }
  });

  const nf=etiqueta.querySelector(".etiqueta-nf");
  const volume=etiqueta.querySelector(".etiqueta-volume");
  if(nf) nf.style.top=`${topo}mm`;
  if(volume) volume.style.top=`${topo}mm`;
}

function atualizarPreviewEtiqueta(){
  const d=dadosEtiquetaFormulario();

  const logo=document.getElementById("etqLogo");
  if(logo){
    const url=logoEtiquetaUrl();
    logo.src=url || "";
    logo.style.display=url ? "block" : "none";
  }

  document.getElementById("etqPrevCliente").textContent=(d.cliente || "CLIENTE").toUpperCase();
  document.getElementById("etqPrevEndereco").textContent=d.endereco || "";
  document.getElementById("etqPrevBairro").textContent=d.bairro || "";
  document.getElementById("etqPrevCep").textContent=formatarCepEtiqueta(d.cep) || "";
  document.getElementById("etqPrevCidade").textContent=[d.cidade,d.uf].filter(Boolean).join("/") || "";
  document.getElementById("etqPrevNf").textContent=formatarNfEtiqueta(d.numero_nf);
  document.getElementById("etqPrevVolume").textContent=formatarVolumeEtiqueta(1,d.quantidade_volumes);
  document.getElementById("etqPrevChave").textContent=d.chave_nfe;

  const pedidoVolumeUm=pedidoParaVolumeEtiqueta(1,d.pedidos_faixas);
  const pedidoTag=document.getElementById("etqPrevPedidoTag");
  if(pedidoTag){
    let pedidoNomeTag=pedidoTag.querySelector(".pedido-nome");

    if(!pedidoNomeTag){
      pedidoTag.innerHTML='<span class="pedido-nome"></span>';
      pedidoNomeTag=pedidoTag.querySelector(".pedido-nome");
    }

    pedidoNomeTag.textContent=pedidoVolumeUm?.nome || "";
    pedidoTag.classList.toggle("vazia",!pedidoVolumeUm);

    ajustarFontePedidoEtiqueta(
      pedidoNomeTag,
      pedidoVolumeUm?.nome || "",
      pedidoVolumeUm?.fonte || "auto"
    );
  }

  const destino=document.querySelector("#etqPreview .etiqueta-destino");
  const endereco=document.querySelector("#etqPreview .etiqueta-endereco");
  const bairro=document.querySelector("#etqPreview .etiqueta-bairro");
  const cidade=document.querySelector("#etqPreview .etiqueta-cidade");
  if(destino) destino.style.fontSize=(d.cliente.length>30 ? "5mm" : d.cliente.length>24 ? "5.6mm" : "6.2mm");
  if(endereco) endereco.style.fontSize=(d.endereco.length>38 ? "3.8mm" : d.endereco.length>30 ? "4.2mm" : "4.8mm");
  if(bairro) bairro.style.fontSize=(d.bairro.length>22 ? "4mm" : "4.8mm");
  const cidadeUf=[d.cidade,d.uf].filter(Boolean).join("/");
  if(cidade) cidade.style.fontSize=(cidadeUf.length>24 ? "5.8mm" : cidadeUf.length>18 ? "6.2mm" : "6.8mm");

  const transp=document.getElementById("etqPrevTransportadora");
  transp.classList.toggle("vazia",!d.transportadora);
  transp.classList.toggle("duas-linhas",!!d.transportadora_duas_linhas);
  transp.style.fontSize=fonteTransportadoraEscolhida(d.transportadora,d.transportadora_duas_linhas);

  if(d.transportadora_duas_linhas && d.transportadora){
    const linhas=quebrarTransportadoraEmDuasLinhas(d.transportadora);
    transp.innerHTML=`<span>${escaparHtmlEmail(linhas[0])}</span><span>${escaparHtmlEmail(linhas[1] || "")}</span>`;
  }else{
    transp.textContent=d.transportadora || "";
  }

  if(window.QRCode) montarQrEtiqueta(document.getElementById("etqQr"));
  if(window.JsBarcode) montarBarcodeEtiqueta(document.getElementById("etqBarcode"),d.chave_nfe);

  aplicarAjustesTamanhoEtiqueta(document.getElementById("etqPreview"));
  ajustarLinhasVisiveisEtiqueta(document.getElementById("etqPreview"),d);
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewsFaixasEtiqueta();

  const resumo=document.getElementById("etqResumoVolumes");
  if(resumo){
    resumo.innerHTML=Array.from({length:d.quantidade_volumes},(_,i)=>
      `<span class="etiqueta-mini">VOL ${formatarVolumeEtiqueta(i+1,d.quantidade_volumes)}</span>`
    ).join("");
  }
}


function clienteEtiquetaJaCadastrado(nome){
  const normalizado=normalizarNomeEmail(nome || "");
  return emailClientes.find(item=>normalizarNomeEmail(item.nome || "")===normalizado) || null;
}

function preencherVendedorasModalClienteEtiqueta(){
  const select=document.getElementById("modalClienteEtiquetaVendedora");
  if(!select) return;

  select.innerHTML='<option value="">Selecione a vendedora</option>' +
    emailVendedoras
      .filter(item=>item.ativo!==false)
      .sort((a,b)=>(a.nome || "").localeCompare(b.nome || "","pt-BR"))
      .map(item=>`<option value="${item.id}">${escaparHtmlEmail(item.nome || "")} — ${escaparHtmlEmail(item.email || "")}</option>`)
      .join("");
}

function abrirModalClienteEtiqueta(nome){
  preencherVendedorasModalClienteEtiqueta();

  document.getElementById("modalClienteEtiquetaNomeOriginal").value=nome || "";
  document.getElementById("modalClienteEtiquetaNome").value=nome || "";
  document.getElementById("modalClienteEtiquetaEmails").value="";
  document.getElementById("modalClienteEtiquetaVendedora").value="";

  const modal=document.getElementById("modalClienteEtiqueta");
  modal.style.display="flex";
}

function fecharModalClienteEtiqueta(){
  const modal=document.getElementById("modalClienteEtiqueta");
  if(modal) modal.style.display="none";
}

async function salvarClienteRapidoEtiqueta(){
  if(!bancoPronto()) return;

  const nome=document.getElementById("modalClienteEtiquetaNome")?.value.trim() || "";
  const emailsTexto=document.getElementById("modalClienteEtiquetaEmails")?.value.trim() || "";
  const vendedora_id=document.getElementById("modalClienteEtiquetaVendedora")?.value || "";

  if(!nome){
    alert("Informe o nome do cliente.");
    return;
  }
  if(!emailsTexto){
    alert("Informe pelo menos um e-mail do cliente.");
    return;
  }
  if(!vendedora_id){
    alert("Selecione a vendedora.");
    return;
  }

  const emails=emailsTexto
    .split(/[;,\n]+/)
    .map(item=>item.trim())
    .filter(Boolean);

  const invalidos=emails.filter(email=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if(invalidos.length){
    alert("Verifique estes e-mails inválidos:\n"+invalidos.join("\n"));
    return;
  }

  const existente=clienteEtiquetaJaCadastrado(nome);
  if(existente){
    alert("Esse cliente já está cadastrado.");
    fecharModalClienteEtiqueta();
    return;
  }

  const dadosEtiqueta=dadosEtiquetaFormulario();

  const resposta=await banco.from("email_clientes").insert([{
    nome,
    emails,
    vendedora_id,
    endereco:dadosEtiqueta.endereco || "",
    numero:"",
    complemento:"",
    bairro:dadosEtiqueta.bairro || "",
    cep:dadosEtiqueta.cep || "",
    cidade:dadosEtiqueta.cidade || "",
    uf:dadosEtiqueta.uf || "",
    transportadora_preferencial:dadosEtiqueta.transportadora || "",
    observacao_logistica:"",
    ativo:true,
    atualizado_em:new Date().toISOString()
  }]).select().single();

  if(resposta.error){
    alert("Erro ao cadastrar cliente: "+resposta.error.message);
    return;
  }

  emailClientes.unshift(resposta.data);
  montarTabelaClientesEmail();
  fecharModalClienteEtiqueta();
  mostrarAvisoEmail(`Cliente ${nome} cadastrado com sucesso para futuros envios de boletos.`,true);
}

function verificarCadastroClienteEtiqueta(){
  const nome=document.getElementById("etqCliente")?.value.trim() || "";
  if(!nome) return;

  if(!clienteEtiquetaJaCadastrado(nome)){
    abrirModalClienteEtiqueta(nome);
  }
}

function mostrarSugestoesEtiqueta(){
  const input=document.getElementById("etqCliente");
  const lista=document.getElementById("etqSugestoesClientes");
  if(!input || !lista) return;

  const termo=normalizarNomeEmail(input.value);
  const encontrados=emailClientes
    .filter(item=>!termo || normalizarNomeEmail(item.nome).includes(termo))
    .slice(0,15);

  if(!encontrados.length){
    lista.innerHTML="";
    lista.classList.remove("ativa");
    return;
  }

  lista.innerHTML=encontrados.map(item=>`
    <div class="etiqueta-sugestao" onmousedown="selecionarClienteEtiqueta('${item.id}')">
      <b>${escaparHtmlEmail(item.nome)}</b>
      <small>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/") || "Cidade/UF não cadastrada")}</small>
    </div>`).join("");
  lista.classList.add("ativa");
}

function selecionarClienteEtiqueta(id){
  const item=emailClientes.find(x=>x.id===id);
  if(!item) return;
  document.getElementById("etqCliente").value=item.nome || "";

  const enderecoNumero=[item.endereco,item.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,item.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=item.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(item.cep || "");
  document.getElementById("etqCidade").value=item.cidade || "";
  document.getElementById("etqUf").value=item.uf || "";
  document.getElementById("etqTransportadora").value=item.transportadora_preferencial || "";
  document.getElementById("etqSugestoesClientes").classList.remove("ativa");
  atualizarPreviewEtiqueta();
}

document.addEventListener("click",evento=>{
  const box=document.querySelector("#emailSubEtiquetas .etiqueta-sugestoes");
  if(box && !box.contains(evento.target)){
    document.getElementById("etqSugestoesClientes")?.classList.remove("ativa");
  }
});


function decodificarEntidadesXml(valor){
  let texto=String(valor || "");

  // Decodifica entidades comuns e também casos duplamente codificados,
  // como &amp;amp;H, sem alterar o caractere & correto.
  for(let tentativa=0;tentativa<3;tentativa++){
    const textarea=document.createElement("textarea");
    textarea.innerHTML=texto;
    const decodificado=textarea.value;

    if(decodificado===texto) break;
    texto=decodificado;
  }

  return texto
    .replace(/\u00A0/g," ")
    .replace(/\s+/g," ")
    .trim();
}

async function lerXmlEtiqueta(evento){
  const arquivo=evento.target.files?.[0];
  if(!arquivo) return;

  try{
    const texto=await arquivo.text();
    const xml=new DOMParser().parseFromString(texto,"application/xml");
    if(xml.querySelector("parsererror")) throw new Error("XML inválido.");

    const textoNo=(seletores)=>{
      for(const seletor of seletores){
        const no=xml.querySelector(seletor);
        if(no?.textContent?.trim()){
          return decodificarEntidadesXml(no.textContent);
        }
      }
      return "";
    };

    const chave=textoNo(["protNFe infProt chNFe","infNFe"]).replace(/^NFe/,"");
    const numeroNf=textoNo(["ide nNF"]);
    const cliente=decodificarEntidadesXml(textoNo(["dest xNome"]));
    const logradouro=textoNo(["dest enderDest xLgr"]);
    const numeroEndereco=textoNo(["dest enderDest nro"]);
    const complemento=textoNo(["dest enderDest xCpl"]);
    const bairro=textoNo(["dest enderDest xBairro"]);
    const cep=textoNo(["dest enderDest CEP"]);
    const cidade=textoNo(["dest enderDest xMun"]);
    const uf=textoNo(["dest enderDest UF"]);
    const transportadoraCompleta=textoNo(["transp transporta xNome","transporta xNome"]);
    const transportadoraPrimeiroNome=transportadoraCompleta.trim().split(/\s+/)[0] || "";
    const endereco=[logradouro,numeroEndereco].filter(Boolean).join(", ") + (complemento ? ` - ${complemento}` : "");

    // Quantidade de volumes: primeiro tenta qVol; se não existir,
    // conta os blocos <vol>; por último tenta nVol quando vier numérico.
    let quantidadeVolumes=0;
    const qVolTexto=textoNo(["transp vol qVol","vol qVol"]);
    if(qVolTexto){
      quantidadeVolumes=parseInt(String(qVolTexto).replace(/\D/g,""),10) || 0;
    }

    if(!quantidadeVolumes){
      const blocosVol=xml.querySelectorAll("transp vol, vol");
      if(blocosVol.length) quantidadeVolumes=blocosVol.length;
    }

    if(!quantidadeVolumes){
      const nVolTexto=textoNo(["transp vol nVol","vol nVol"]);
      const numeroExtraido=String(nVolTexto || "").match(/\d+/);
      if(numeroExtraido) quantidadeVolumes=parseInt(numeroExtraido[0],10) || 0;
    }

    if(cliente) document.getElementById("etqCliente").value=cliente;
    if(transportadoraPrimeiroNome) document.getElementById("etqTransportadora").value=transportadoraPrimeiroNome.toUpperCase();
    if(numeroNf) document.getElementById("etqNf").value=numeroNf;
    if(quantidadeVolumes>0) document.getElementById("etqVolumes").value=quantidadeVolumes;
    if(chave) document.getElementById("etqChave").value=chave.replace(/\D/g,"").slice(0,44);

    const dadosEnderecoXml={
      endereco:logradouro || "",
      numero:numeroEndereco || "",
      complemento:complemento || "",
      bairro:bairro || "",
      cep:cep || "",
      cidade:cidade || "",
      uf:uf || ""
    };

    const cadastroEncontrado=cliente ? clienteEtiquetaJaCadastrado(cliente) : null;

    if(cadastroEncontrado && cadastroPossuiEnderecoLogistico(cadastroEncontrado)){
      const escolha=await abrirEscolhaEnderecoEtiqueta(cadastroEncontrado,dadosEnderecoXml);

      if(escolha===null){
        evento.target.value="";
        return;
      }

      preencherEnderecoEtiquetaComXml(escolha.dados);
    }else{
      preencherEnderecoEtiquetaComXml(dadosEnderecoXml);
    }

    atualizarPreviewEtiqueta();

    if(cliente){
      const cadastro=clienteEtiquetaJaCadastrado(cliente);

      if(!cadastro){
        setTimeout(()=>abrirModalClienteEtiqueta(cliente),250);
      }else{
        const atualizacao={};

        if(!cadastro.endereco && logradouro) atualizacao.endereco=logradouro;
        if(!cadastro.numero && numeroEndereco) atualizacao.numero=numeroEndereco;
        if(!cadastro.complemento && complemento) atualizacao.complemento=complemento;
        if(!cadastro.bairro && bairro) atualizacao.bairro=bairro;
        if(!cadastro.cep && cep) atualizacao.cep=cep;
        if(!cadastro.cidade && cidade) atualizacao.cidade=cidade;
        if(!cadastro.uf && uf) atualizacao.uf=uf;
        if(!cadastro.transportadora_preferencial && transportadoraPrimeiroNome){
          atualizacao.transportadora_preferencial=transportadoraPrimeiroNome.toUpperCase();
        }

        if(Object.keys(atualizacao).length){
          atualizacao.atualizado_em=new Date().toISOString();

          const resultado=await banco
            .from("email_clientes")
            .update(atualizacao)
            .eq("id",cadastro.id)
            .select()
            .single();

          if(!resultado.error && resultado.data){
            const posicao=emailClientes.findIndex(item=>item.id===cadastro.id);
            if(posicao>=0) emailClientes[posicao]=resultado.data;
            montarTabelaClientesEmail();
          }
        }

        alert("Dados da NF-e carregados. O endereço do cadastro foi completado quando havia informações faltando.");
      }
    }
  }catch(erro){
    alert("Não foi possível ler o XML: "+erro.message);
  }
}

function criarElementoEtiqueta(d,volumeAtual){
  const etiqueta=document.createElement("div");
  etiqueta.className="etiqueta-papel";
  const pedidoVolume=pedidoParaVolumeEtiqueta(volumeAtual,d.pedidos_faixas);
  etiqueta.innerHTML=`
    <div class="etiqueta-pedido-tag ${pedidoVolume ? "" : "vazia"}">
      <span class="pedido-nome">${pedidoVolume ? escaparHtmlEmail(pedidoVolume.nome) : ""}</span>
    </div>
    <img class="etiqueta-logo" alt="Logo Sofisticatto">
    <div class="etiqueta-qr-texto">
                <div class="insta-vertical">I<br>N<br>S<br>T<br>A</div>
                <div class="gram-horizontal">G&nbsp;R&nbsp;A&nbsp;M</div>
              </div>
    <div class="etiqueta-qr"></div>
    <div class="etiqueta-destino">DESTINO: <b>${escaparHtmlEmail((d.cliente || "CLIENTE").toUpperCase())}</b></div>
    <div class="etiqueta-endereco">ENDEREÇO: <b>${escaparHtmlEmail(d.endereco || "ENDEREÇO")}</b></div>
    <div class="etiqueta-bairro">BAIRRO: <b>${escaparHtmlEmail(d.bairro || "BAIRRO")}</b></div>
    <div class="etiqueta-cep">CEP: <b>${escaparHtmlEmail(formatarCepEtiqueta(d.cep) || "CEP")}</b></div>
    <div class="etiqueta-cidade">CIDADE: <b>${escaparHtmlEmail([d.cidade,d.uf].filter(Boolean).join("/") || "CIDADE/UF")}</b></div>
    <div class="etiqueta-nf">NF: ${escaparHtmlEmail(formatarNfEtiqueta(d.numero_nf))}</div>
    <div class="etiqueta-volume">VOL: ${escaparHtmlEmail(formatarVolumeEtiqueta(volumeAtual,d.quantidade_volumes))}</div>
    <svg class="etiqueta-barcode"></svg>
    <div class="etiqueta-chave">${escaparHtmlEmail(d.chave_nfe)}</div>
    <div class="etiqueta-transportadora ${d.transportadora ? "" : "vazia"} ${d.transportadora_duas_linhas ? "duas-linhas" : ""}"></div>`;

  const pedidoTag=etiqueta.querySelector(".etiqueta-pedido-tag");
  const pedidoNomeTag=pedidoTag?.querySelector(".pedido-nome");
  ajustarFontePedidoEtiqueta(pedidoNomeTag,pedidoVolume?.nome || "",pedidoVolume?.fonte || "auto");

  const destino=etiqueta.querySelector(".etiqueta-destino");
  const endereco=etiqueta.querySelector(".etiqueta-endereco");
  const bairro=etiqueta.querySelector(".etiqueta-bairro");
  const cidade=etiqueta.querySelector(".etiqueta-cidade");
  destino.style.fontSize=(d.cliente.length>30 ? "5mm" : d.cliente.length>24 ? "5.6mm" : "6.2mm");
  endereco.style.fontSize=(d.endereco.length>38 ? "3.8mm" : d.endereco.length>30 ? "4.2mm" : "4.8mm");
  bairro.style.fontSize=(d.bairro.length>22 ? "4mm" : "4.8mm");
  const cidadeUf=[d.cidade,d.uf].filter(Boolean).join("/");
  cidade.style.fontSize=(cidadeUf.length>24 ? "5.8mm" : cidadeUf.length>18 ? "6.2mm" : "6.8mm");

  const transportadora=etiqueta.querySelector(".etiqueta-transportadora");
  transportadora.style.fontSize=fonteTransportadoraEscolhida(d.transportadora,d.transportadora_duas_linhas);

  if(d.transportadora_duas_linhas && d.transportadora){
    const linhas=quebrarTransportadoraEmDuasLinhas(d.transportadora);
    transportadora.innerHTML=`<span>${escaparHtmlEmail(linhas[0])}</span><span>${escaparHtmlEmail(linhas[1] || "")}</span>`;
  }else{
    transportadora.textContent=d.transportadora || "";
  }

  const logo=etiqueta.querySelector(".etiqueta-logo");
  const logoUrl=logoEtiquetaUrl();
  if(logoUrl) logo.src=logoUrl; else logo.style.display="none";

  montarQrEtiqueta(etiqueta.querySelector(".etiqueta-qr"));
  montarBarcodeEtiqueta(etiqueta.querySelector(".etiqueta-barcode"),d.chave_nfe);
  aplicarAjustesTamanhoEtiqueta(etiqueta);
  ajustarLinhasVisiveisEtiqueta(etiqueta,d);
  return etiqueta;
}

function validarEtiqueta(){
  const d=dadosEtiquetaFormulario();
  if(!d.cliente){alert("Informe o nome do cliente.");return null}
  if(!d.cidade || !d.uf){alert("Informe a cidade e o estado.");return null}
  if(!d.numero_nf){alert("Informe o número da Nota Fiscal.");return null}
  if(d.chave_nfe.length!==44){alert("A chave da NF-e deve ter 44 dígitos.");return null}
  return d;
}

async function montarEtiquetasParaSaida(){
  const d=validarEtiqueta();
  if(!d) return null;
  await carregarBibliotecasEtiqueta();

  const container=document.getElementById("etiquetasImpressao");
  container.innerHTML="";
  container.style.display="block";
  for(let i=1;i<=d.quantidade_volumes;i++){
    container.appendChild(criarElementoEtiqueta(d,i));
  }
  await new Promise(resolve=>setTimeout(resolve,350));
  return {d,container};
}


async function converterSvgBarcodeParaCanvas(etiqueta){
  const svg=etiqueta.querySelector(".etiqueta-barcode");
  if(!svg) return;

  const rect=svg.getBoundingClientRect();
  if(!rect.width || !rect.height) return;

  const clone=svg.cloneNode(true);
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  clone.setAttribute("width",String(Math.max(1,Math.round(rect.width))));
  clone.setAttribute("height",String(Math.max(1,Math.round(rect.height))));

  const textoSvg=new XMLSerializer().serializeToString(clone);
  const blob=new Blob([textoSvg],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);

  try{
    const imagem=new Image();
    await new Promise((resolve,reject)=>{
      imagem.onload=resolve;
      imagem.onerror=reject;
      imagem.src=url;
    });

    const escala=4;
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(rect.width*escala));
    canvas.height=Math.max(1,Math.round(rect.height*escala));
    canvas.className=svg.className.baseVal || "etiqueta-barcode";
    canvas.style.cssText=svg.style.cssText;

    const contexto=canvas.getContext("2d");
    contexto.scale(escala,escala);
    contexto.fillStyle="#fff";
    contexto.fillRect(0,0,rect.width,rect.height);
    contexto.drawImage(imagem,0,0,rect.width,rect.height);

    svg.replaceWith(canvas);
  }finally{
    URL.revokeObjectURL(url);
  }
}

function converterTransportadoraParaCanvas(etiqueta){
  const elemento=etiqueta.querySelector(".etiqueta-transportadora");
  if(!elemento || elemento.classList.contains("vazia")) return;

  const texto=(elemento.textContent || "").trim();
  if(!texto) return;

  const rect=elemento.getBoundingClientRect();
  if(!rect.width || !rect.height) return;

  const estilo=getComputedStyle(elemento);
  const escala=4;
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(rect.width*escala));
  canvas.height=Math.max(1,Math.round(rect.height*escala));
  canvas.className="etiqueta-transportadora-canvas";
  canvas.style.position="absolute";
  canvas.style.right=getComputedStyle(elemento).right;
  canvas.style.bottom=getComputedStyle(elemento).bottom;
  canvas.style.width=`${rect.width}px`;
  canvas.style.height=`${rect.height}px`;
  canvas.style.transform="none";
  canvas.style.writingMode="horizontal-tb";
  canvas.style.overflow="visible";

  const contexto=canvas.getContext("2d");
  contexto.scale(escala,escala);
  contexto.clearRect(0,0,rect.width,rect.height);
  contexto.fillStyle=estilo.color || "#000";
  contexto.font=`${estilo.fontWeight || "900"} ${estilo.fontSize || "32px"} Arial`;
  contexto.textAlign="center";
  contexto.textBaseline="middle";

  const duasLinhas=elemento.classList.contains("duas-linhas");
  if(duasLinhas){
    const linhas=[...elemento.querySelectorAll("span")]
      .map(item=>item.textContent.trim())
      .filter(Boolean);

    const alturaLinha=parseFloat(estilo.fontSize || "24")*1.05;
    const inicioY=rect.height/2-((linhas.length-1)*alturaLinha)/2;
    linhas.forEach((linha,indice)=>{
      contexto.fillText(linha,rect.width/2,inicioY+(indice*alturaLinha),rect.width-2);
    });
  }else{
    contexto.save();
    contexto.translate(rect.width/2,rect.height/2);
    contexto.rotate(-Math.PI/2);
    contexto.fillText(texto,0,0,rect.height-4);
    contexto.restore();
  }

  elemento.replaceWith(canvas);
}

async function esperarImagensEtiqueta(etiqueta){
  const imagens=[...etiqueta.querySelectorAll("img")];
  await Promise.all(imagens.map(imagem=>{
    if(imagem.complete) return Promise.resolve();
    return new Promise(resolve=>{
      imagem.addEventListener("load",resolve,{once:true});
      imagem.addEventListener("error",resolve,{once:true});
    });
  }));
}

function normalizarLogoParaCaptura(etiqueta){
  const logoGerada=etiqueta.querySelector(".etiqueta-logo");
  if(logoGerada){
    logoGerada.style.position="absolute";
    logoGerada.style.left="40mm";
    logoGerada.style.top="3mm";
    logoGerada.style.width="58mm";
    logoGerada.style.height="25mm";
    logoGerada.style.maxWidth="58mm";
    logoGerada.style.maxHeight="25mm";
    logoGerada.style.objectFit="contain";
    logoGerada.style.objectPosition="center";
    logoGerada.style.transform="none";
    logoGerada.style.zIndex="1";
  }

  const pedidoGerado=etiqueta.querySelector(".etiqueta-pedido-tag");
  if(pedidoGerado){
    pedidoGerado.style.position="absolute";
    pedidoGerado.style.left="7mm";
    pedidoGerado.style.top="8mm";
    pedidoGerado.style.width="31mm";
    pedidoGerado.style.height="13mm";
    pedidoGerado.style.maxWidth="31mm";
    pedidoGerado.style.padding="1.4mm 2mm";
    pedidoGerado.style.display=pedidoGerado.classList.contains("vazia") ? "none" : "flex";
    pedidoGerado.style.flexDirection="row";
    pedidoGerado.style.alignItems="center";
    pedidoGerado.style.justifyContent="center";
    pedidoGerado.style.whiteSpace="nowrap";
    pedidoGerado.style.overflow="hidden";
    pedidoGerado.style.zIndex="5";
  }

  // Organiza todas as linhas em áreas independentes.
  // A altura e o espaçamento maiores evitam que o html2canvas corte
  // letras ou crie faixas brancas sobre os textos.
  const configuracoes=[
    [".etiqueta-destino","36.5mm","7.5mm"],
    [".etiqueta-endereco","44.5mm","7mm"],
    [".etiqueta-bairro","52mm","7mm"],
    [".etiqueta-cep","59.5mm","7mm"],
    [".etiqueta-cidade","67mm","7mm"]
  ];

  configuracoes.forEach(([seletor,top,altura])=>{
    const elemento=etiqueta.querySelector(seletor);
    if(!elemento) return;

    elemento.style.top=top;
    elemento.style.height=altura;
    elemento.style.minHeight=altura;
    elemento.style.maxHeight=altura;
    elemento.style.lineHeight="1.25";
    elemento.style.display="block";
    elemento.style.overflow="visible";
    elemento.style.whiteSpace="nowrap";
    elemento.style.background="transparent";
    elemento.style.zIndex="3";
    elemento.style.paddingTop="0.4mm";
    elemento.style.paddingBottom="0.4mm";
    elemento.style.boxSizing="border-box";
  });

  const nf=etiqueta.querySelector(".etiqueta-nf");
  const volume=etiqueta.querySelector(".etiqueta-volume");

  [nf,volume].forEach(elemento=>{
    if(!elemento) return;
    elemento.style.top="74.5mm";
    elemento.style.height="7mm";
    elemento.style.minHeight="7mm";
    elemento.style.lineHeight="1.2";
    elemento.style.overflow="visible";
    elemento.style.background="transparent";
    elemento.style.zIndex="3";
    elemento.style.paddingTop="0.3mm";
    elemento.style.boxSizing="border-box";
  });
}

async function prepararEtiquetaParaCaptura(etiqueta){
  etiqueta.classList.add("etiqueta-preparada-impressao");
  normalizarLogoParaCaptura(etiqueta);
  await esperarImagensEtiqueta(etiqueta);
  await converterSvgBarcodeParaCanvas(etiqueta);
  converterTransportadoraParaCanvas(etiqueta);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

async function imprimirEtiquetas(){
  const d=validarEtiqueta();
  if(!d) return;

  try{
    await carregarBibliotecasEtiqueta();

    const janela=window.open("","_blank","width=980,height=760");
    if(!janela){
      alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }

    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiquetas ${escaparHtmlEmail(d.cliente)}</title>
<style>
  @page{
    size:150mm 100mm;
    margin:0;
  }

  *{
    box-sizing:border-box;
  }

  html,
  body{
    width:150mm;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    overflow:visible;
  }

  #paginas{
    width:150mm;
    margin:0;
    padding:0;
  }

  .pagina{
    width:150mm !important;
    height:100mm !important;
    min-width:150mm !important;
    min-height:100mm !important;
    max-width:150mm !important;
    max-height:100mm !important;
    margin:0 !important;
    padding:0 !important;
    overflow:hidden !important;
    position:relative;
    display:block;
    page-break-after:always;
    break-after:page;
    page-break-inside:avoid;
    break-inside:avoid;
  }

  .pagina:last-child{
    page-break-after:auto;
    break-after:auto;
  }

  .pagina img{
    position:absolute;
    inset:0;
    display:block !important;
    width:150mm !important;
    height:100mm !important;
    min-width:150mm !important;
    min-height:100mm !important;
    max-width:150mm !important;
    max-height:100mm !important;
    margin:0 !important;
    padding:0 !important;
    border:0 !important;
    object-fit:fill !important;
  }

  @media print{
    html,
    body,
    #paginas{
      width:150mm !important;
      margin:0 !important;
      padding:0 !important;
    }

    .pagina{
      width:150mm !important;
      height:100mm !important;
      margin:0 !important;
      padding:0 !important;
      overflow:hidden !important;
    }
  }
</style>
</head>
<body><div id="paginas"></div></body>
</html>`);
    janela.document.close();

    const temporario=document.createElement("div");
    temporario.style.position="fixed";
    temporario.style.left="-10000px";
    temporario.style.top="0";
    temporario.style.background="#fff";
    temporario.style.zIndex="-1";
    document.body.appendChild(temporario);

    const paginas=janela.document.getElementById("paginas");

    for(let volume=1;volume<=d.quantidade_volumes;volume++){
      const etiqueta=criarElementoEtiqueta(d,volume);
      etiqueta.style.margin="0";
      etiqueta.style.boxShadow="none";
      etiqueta.style.borderRadius="0";
      etiqueta.style.transform="none";
      temporario.appendChild(etiqueta);

      await prepararEtiquetaParaCaptura(etiqueta);
      await new Promise(resolve=>setTimeout(resolve,120));

      const rectEtiqueta=etiqueta.getBoundingClientRect();
      const canvas=await html2canvas(etiqueta,{
        scale:4,
        useCORS:true,
        allowTaint:true,
        backgroundColor:"#ffffff",
        width:Math.round(rectEtiqueta.width),
        height:Math.round(rectEtiqueta.height),
        windowWidth:Math.round(rectEtiqueta.width),
        windowHeight:Math.round(rectEtiqueta.height),
        scrollX:0,
        scrollY:0,
        logging:false
      });

      const pagina=janela.document.createElement("div");
      pagina.className="pagina";
      const imagem=janela.document.createElement("img");
      imagem.src=canvas.toDataURL("image/png");
      pagina.appendChild(imagem);
      paginas.appendChild(pagina);

      etiqueta.remove();
    }

    temporario.remove();

    const imagensImpressao=[...janela.document.querySelectorAll(".pagina img")];

    await Promise.all(imagensImpressao.map(imagem=>{
      if(imagem.complete && imagem.naturalWidth>0) return Promise.resolve();

      return new Promise(resolve=>{
        const finalizar=()=>resolve();
        imagem.addEventListener("load",finalizar,{once:true});
        imagem.addEventListener("error",finalizar,{once:true});
        setTimeout(finalizar,2500);
      });
    }));

    await new Promise(resolve=>setTimeout(resolve,250));
    janela.focus();
    janela.print();
  }catch(erro){
    console.error("Erro ao imprimir etiquetas:",erro);
    alert("Não foi possível preparar a impressão: "+erro.message);
  }
}
async function baixarEtiquetasPDF(){
  try{
    const resultado=await montarEtiquetasParaSaida();
    if(!resultado) return;
    const {jsPDF}=window.jspdf;
    const etiquetas=[...resultado.container.querySelectorAll(".etiqueta-papel")];
    const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:[150,100]});

    for(let i=0;i<etiquetas.length;i++){
      if(i>0) pdf.addPage([150,100],"landscape");
      etiquetas[i].style.boxShadow="none";
      etiquetas[i].style.borderRadius="0";
      etiquetas[i].style.margin="0";
      const canvas=await html2canvas(etiquetas[i],{
        scale:3,
        useCORS:true,
        allowTaint:true,
        backgroundColor:"#ffffff",
        width:etiquetas[i].scrollWidth,
        height:etiquetas[i].scrollHeight,
        windowWidth:etiquetas[i].scrollWidth,
        windowHeight:etiquetas[i].scrollHeight
      });
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,150,100,undefined,"FAST");
    }

    pdf.save(`ETIQUETAS_${(resultado.d.cliente || "CLIENTE").replace(/[^a-z0-9]+/gi,"_")}_NF_${resultado.d.numero_nf}.pdf`);
    resultado.container.style.display="none";
  }catch(erro){
    console.error(erro);
    alert("Não foi possível gerar o PDF das etiquetas: "+erro.message);
  }
}

async function salvarHistoricoEtiqueta(){
  const d=validarEtiqueta();
  if(!d) return;

  const resposta=await banco.from("email_etiquetas").insert([{
    ...d,
    instagram_url:ETIQUETA_INSTAGRAM_URL,
    criado_por:usuarioLogado.login
  }]);

  if(resposta.error){
    alert("Erro ao salvar etiqueta: "+resposta.error.message);
    return;
  }

  alert("Etiqueta salva no histórico.");
  carregarHistoricoEtiquetas();
}

async function carregarHistoricoEtiquetas(){
  if(!banco || !usuarioLogado || usuarioLogado.tipo!=="financeiro") return;
  const resposta=await banco.from("email_etiquetas").select("*").order("created_at",{ascending:false}).limit(300);
  if(resposta.error){
    console.error("Erro ao carregar etiquetas:",resposta.error);
    return;
  }
  etiquetasHistorico=resposta.data || [];
  montarHistoricoEtiquetas(etiquetasHistorico);
}

function montarHistoricoEtiquetas(lista){
  const tabela=document.getElementById("etqTabelaHistorico");
  if(!tabela) return;
  tabela.innerHTML=lista.length ? lista.map(item=>`
    <tr>
      <td>${new Date(item.created_at).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEmail(item.cliente)}</td>
      <td>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/"))}</td>
      <td>${escaparHtmlEmail(item.numero_nf || "")}</td>
      <td>${item.quantidade_volumes}</td>
      <td>${escaparHtmlEmail(item.transportadora || "")}</td>
      <td>
        <button class="btn azul" onclick="reutilizarEtiqueta('${item.id}')">Usar</button>
        <button class="btn vermelho" onclick="excluirEtiqueta('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="7">Nenhuma etiqueta salva.</td></tr>`;
}

function filtrarHistoricoEtiquetas(){
  const termo=normalizarNomeEmail(document.getElementById("etqBuscaHistorico")?.value || "");
  if(!termo){montarHistoricoEtiquetas(etiquetasHistorico);return}
  montarHistoricoEtiquetas(etiquetasHistorico.filter(item=>
    normalizarNomeEmail([item.cliente,item.endereco,item.bairro,item.cep,item.numero_nf,item.transportadora,item.cidade,item.uf].join(" ")).includes(termo)
  ));
}

function reutilizarEtiqueta(id){
  const item=etiquetasHistorico.find(x=>x.id===id);
  if(!item) return;
  document.getElementById("etqCliente").value=item.cliente || "";
  document.getElementById("etqEndereco").value=item.endereco || "";
  document.getElementById("etqBairro").value=item.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(item.cep || "");
  document.getElementById("etqCidade").value=item.cidade || "";
  document.getElementById("etqUf").value=item.uf || "";
  document.getElementById("etqNf").value=item.numero_nf || "";
  document.getElementById("etqVolumes").value=item.quantidade_volumes || 1;
  document.getElementById("etqTransportadora").value=item.transportadora || "";
  document.getElementById("etqTransportadoraDuasLinhas").checked=!!item.transportadora_duas_linhas;
  document.getElementById("etqTransportadoraFonte").value=item.transportadora_fonte || "auto";
  etiquetaPedidosFaixas=Array.isArray(item.pedidos_faixas)
    ? item.pedidos_faixas.map((faixa,index)=>({
        id:faixa.id || `faixa_salva_${index}_${Date.now()}`,
        nome:String(faixa.nome || "").toUpperCase(),
        inicio:Number(faixa.inicio),
        fim:Number(faixa.fim),
        fonte:faixa.fonte || "auto"
      }))
    : [];
  montarListaFaixasPedidoEtiqueta();
  document.getElementById("etqChave").value=item.chave_nfe || "";
  atualizarPreviewEtiqueta();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function excluirEtiqueta(id){
  if(!confirm("Excluir esta etiqueta do histórico?")) return;
  const resposta=await banco.from("email_etiquetas").delete().eq("id",id);
  if(resposta.error){alert("Erro ao excluir: "+resposta.error.message);return}
  carregarHistoricoEtiquetas();
}

function limparFormularioEtiqueta(){
  ["etqCliente","etqEndereco","etqBairro","etqCep","etqCidade","etqUf","etqNf","etqTransportadora","etqChave"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
  document.getElementById("etqVolumes").value=1;
  document.getElementById("etqTransportadoraDuasLinhas").checked=false;
  document.getElementById("etqTransportadoraFonte").value="auto";
  etiquetaPedidosFaixas=[];
  montarListaFaixasPedidoEtiqueta();
  document.getElementById("etqPedidoFonte").value="auto";
  ["etqPedidoNome","etqPedidoInicio","etqPedidoFim"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
  document.getElementById("etqXml").value="";
  atualizarPreviewEtiqueta();
}

document.addEventListener("DOMContentLoaded", async function(){
  try{
    mostrarCarregando("Conectando...");
    await carregarSupabase();
    iniciarRealtime();
    prepararNotificacaoMobile();
    iniciarRealtimeNotificacoes();
    iniciarMonitoramentoPerfilFallback();
    carregarNotificacoesPersistentes();
    esconderCarregando();

    const salvo = localStorage.getItem("usuarioLogado");
    if(salvo){
      usuarioLogado = JSON.parse(salvo);
      iniciarSistema();
    }else{
      atualizarBotaoNotificacao();
    }
  }catch(erro){
    console.error("Erro ao iniciar sistema:", erro);
    esconderCarregando();
    mostrarBalaoSistema("Erro de conexão", "Não foi possível conectar agora. Verifique a internet e atualize a página.");
  }
});
