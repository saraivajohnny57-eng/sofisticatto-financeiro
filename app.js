function formatarDataInput(data){
  const valor = data instanceof Date ? data : new Date(data);
  if(Number.isNaN(valor.getTime())) return "";
  const ano = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  const dia = String(valor.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
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
