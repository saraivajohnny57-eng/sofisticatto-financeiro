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
  ["Preparar","Gerador","Etiquetas","Correios","Clientes","Vendedoras","Assinaturas","Historico"].forEach(nome => {
    document.getElementById("emailSub" + nome).classList.remove("ativa");
    document.getElementById("emailAba" + nome).classList.remove("ativo");
  });
  const mapa = {preparar:"Preparar",gerador:"Gerador",etiquetas:"Etiquetas",correios:"Correios",clientes:"Clientes",vendedoras:"Vendedoras",assinaturas:"Assinaturas",historico:"Historico"};
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
}

function montarTabelaVendedorasEmail(){
  const tabela = document.getElementById("emailTabelaVendedoras");
  if(!tabela) return;
  tabela.innerHTML = emailVendedoras.length ? emailVendedoras.map(item => `
    <tr>
      <td>${escaparHtmlEmail(item.nome)}</td>
      <td>${escaparHtmlEmail(item.email)}</td>
      <td>
        <button class="btn azul" onclick="editarVendedoraEmail('${item.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirVendedoraEmail('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="3">Nenhuma vendedora cadastrada.</td></tr>`;
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

  if(!nome || !email){ alert("Preencha o nome e o e-mail da vendedora."); return; }

  const dados = {nome,email,atualizado_em:new Date().toISOString()};
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
  document.getElementById("emailCancelarVendedora").style.display = "inline-block";
  mostrarAbaEmail("vendedoras");
}

function cancelarEdicaoVendedoraEmail(){
  document.getElementById("emailVendedoraId").value = "";
  document.getElementById("emailVendedoraNome").value = "";
  document.getElementById("emailVendedoraEmail").value = "";
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
  prepararEnviosEmail();
}

function montarTabelaClientesEmail(lista = emailClientes){
  const tabela = document.getElementById("emailTabelaClientes");
  if(!tabela) return;

  tabela.innerHTML = lista.length ? lista.map(item => {
    const vendedora = emailVendedoras.find(v => v.id === item.vendedora_id);
    return `<tr>
      <td>${escaparHtmlEmail(item.nome)}</td>
      <td>${(item.emails || []).map(escaparHtmlEmail).join("<br>")}</td>
      <td>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/"))}</td>
      <td>${escaparHtmlEmail(vendedora?.nome || "")}</td>
      <td>${escaparHtmlEmail(vendedora?.email || "")}</td>
      <td>
        <button class="btn azul" onclick="editarClienteEmail('${item.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirClienteEmail('${item.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>`;
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
    nome,emails,vendedora_id,endereco,numero,complemento,bairro,cep,cidade,uf,
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
