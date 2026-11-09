
/* =========================================================
   COTAÇÕES, GNRE, HISTÓRICO E AUTORIZAÇÃO
   ========================================================= */
let freteAliquotas = [];
let freteHistorico = [];
let freteRespostasAtuais = [];
let freteModuloCarregado = false;
let freteAndamento = [];
let freteTimerAndamento = null;
let freteOpcoesCorreios = {};

const FRETE_REMETENTE = {
  razao: "SOFISTICATTO COSMÉTICOS",
  cnpj: "05.451.985/0001-95",
  cep: "74550-470",
  cidade: "Goiânia/GO",
  endereco: "Rua 03 Qd.35 Lt.14E, Vila Abajá - Goiânia/GO"
};

function mostrarPainelFrete(painel){
  const mapa = {
    nova:"Nova",
    andamento:"Andamento",
    historico:"Historico",
    transportadoras:"Transportadoras",
    modelos:"Modelos",
    aliquotas:"Aliquotas"
  };

  Object.values(mapa).forEach(nome => {
    document.getElementById("fretePainel" + nome)?.classList.remove("ativo");
    document.getElementById("freteTab" + nome)?.classList.remove("ativo");
  });

  const nome = mapa[painel];
  document.getElementById("fretePainel" + nome)?.classList.add("ativo");
  document.getElementById("freteTab" + nome)?.classList.add("ativo");

  if(painel === "andamento") carregarCotacoesAndamento();
  if(painel === "historico") carregarHistoricoFrete();
  if(painel === "transportadoras") carregarTransportadorasFrete();
  if(painel === "modelos") carregarModelosFrete();
  if(painel === "aliquotas") carregarAliquotasFrete();
}

async function inicializarModuloFretes(){
  if(typeof garantirFinanceiroEmail === "function" && !garantirFinanceiroEmail()) return;
  if(typeof bancoPronto === "function" && !bancoPronto()) return;

  try{
    if(!(emailClientes||[]).length && typeof carregarClientesEmail==="function"){
      await carregarClientesEmail();
    }

    await Promise.all([
      carregarModelosFrete(),
      carregarTransportadorasFrete(),
      carregarAliquotasFrete(),
      carregarHistoricoFrete(),
      carregarCotacoesAndamento()
    ]);

    montarClientesFrete();
    selecionarTipoFrete(freteValor("freteTipo") || "CIF");
    freteModuloCarregado = true;
  }catch(erro){
    console.error("Erro ao inicializar cotações:", erro);
    alert("Não foi possível carregar o módulo de cotações: " + (erro.message || erro));
  }
}

function selecionarTipoFrete(tipo){
  tipo = ["CIF","FOB","MISTO"].includes(tipo) ? tipo : "CIF";
  freteCampo("freteTipo").value = tipo;
  freteCampo("freteBtnCif")?.classList.toggle("ativo", tipo === "CIF");
  freteCampo("freteBtnFob")?.classList.toggle("ativo", tipo === "FOB");
  freteCampo("freteBtnMisto")?.classList.toggle("ativo", tipo === "MISTO");
}

function numeroFrete(valor){
  if(typeof valor === "number") return valor;
  return valorParaNumero(String(valor || "0"));
}

function moedaFrete(valor){
  return numeroFrete(valor).toLocaleString("pt-BR", {
    style:"currency",
    currency:"BRL"
  });
}

function tiposRespostaFrete(tipoPrincipal){
  return tipoPrincipal === "MISTO" ? ["FOB","CIF"] : [tipoPrincipal || "CIF"];
}

function chaveRespostaFrete(transportadoraId, tipoFrete){
  return `${transportadoraId}_${tipoFrete}`;
}

function respostaAtualFrete(transportadoraId, tipoFrete){
  return freteRespostasAtuais.find(r =>
    String(r.transportadora_id) === String(transportadoraId) &&
    String(r.tipo_frete || "CIF") === String(tipoFrete)
  );
}

async function solicitarCompletarDestinatarioRodonaves(dados, camposFaltantes=[]){
  const cliente=(typeof clienteFretePorId==="function"&&clienteFretePorId(dados.cliente_id))||(typeof clienteFretePorNome==="function"&&clienteFretePorNome(dados.cliente_nome))||null;
  const faltam=new Set(camposFaltantes||[]);
  const pedir=(campo,rotulo,atual="")=>{if(!faltam.has(campo))return atual||"";const v=prompt(`Rodonaves precisa de ${rotulo} para cadastrar o destinatário:\n\n${dados.cliente_nome||"Cliente"}`,atual||"");if(v===null)throw new Error("Cadastro do destinatário cancelado.");return String(v).trim();};
  let email=Array.isArray(cliente?.emails)?(cliente.emails.find(Boolean)||""):(cliente?.email||"");
  let telefone=cliente?.telefone||cliente?.celular||"", numero=cliente?.numero||"", logradouro=cliente?.endereco||dados.logradouro_destino||"", complemento=cliente?.complemento||"", bairro=cliente?.bairro||dados.bairro_destino||"", cidade=cliente?.cidade||dados.cidade_destino||"", uf=cliente?.uf||dados.uf_destino||"", cep=cliente?.cep||dados.cep_destino||"";
  email=pedir("email","E-MAIL",email); telefone=pedir("telefone","TELEFONE com DDD",telefone); numero=pedir("numero","NÚMERO DO ENDEREÇO",numero); logradouro=pedir("logradouro","LOGRADOURO",logradouro); bairro=pedir("bairro","BAIRRO",bairro); cidade=pedir("cidade","CIDADE",cidade); uf=pedir("uf","UF",uf).toUpperCase(); cep=pedir("cep","CEP",cep);
  const valores={email,telefone,numero,logradouro,bairro,cidade,uf,cep}; for(const campo of faltam){if(!String(valores[campo]||"").trim())throw new Error(`O campo ${campo} é obrigatório para a Rodonaves.`);}
  if(cliente?.id&&typeof banco!=="undefined"){
    const payload={}; if(email)payload.emails=[email];if(telefone)payload.telefone=telefone;if(numero)payload.numero=numero;if(logradouro)payload.endereco=logradouro;if(complemento)payload.complemento=complemento;if(bairro)payload.bairro=bairro;if(cidade)payload.cidade=cidade;if(uf)payload.uf=uf;if(cep)payload.cep=cep;
    const salvo=await banco.from("email_clientes").update(payload).eq("id",cliente.id).select().single(); if(salvo.error)throw new Error("Não foi possível salvar os dados do cliente: "+salvo.error.message); const i=(emailClientes||[]).findIndex(c=>String(c.id)===String(cliente.id));if(i>=0)emailClientes[i]=salvo.data;
  }
  return {...dados,email_destino:email,telefone_destino:telefone,numero_destino:numero,logradouro_destino:logradouro,complemento_destino:complemento,bairro_destino:bairro,cidade_destino:cidade,uf_destino:uf,cep_destino:cep};
}

function dadosFormularioFrete(){
  const clienteSelecionado =
    (typeof clienteFretePorId==="function" && clienteFretePorId(freteValor("freteCliente"))) ||
    (typeof clienteFretePorNome==="function" && clienteFretePorNome(freteValor("freteClienteNome"))) ||
    null;

  return {
    id: freteValor("freteCotacaoId"),
    cliente_id: freteValor("freteCliente") || null,
    cliente_nome: freteValor("freteClienteNome"),
    cpf_cnpj_destino: freteValor("freteCpfCnpj"),
    cep_destino: freteValor("freteCep"),
    cidade_destino: freteValor("freteCidade"),
    uf_destino: freteValor("freteUf").toUpperCase(),
    endereco_destino: freteValor("freteEndereco"),
    bairro_destino: freteValor("freteBairro"),
    logradouro_destino: clienteSelecionado?.endereco || null,
    numero_destino: clienteSelecionado?.numero || null,
    complemento_destino: clienteSelecionado?.complemento || null,
    email_destino: Array.isArray(clienteSelecionado?.emails)
      ? (clienteSelecionado.emails.find(Boolean)||null)
      : (clienteSelecionado?.email||null),
    telefone_destino: clienteSelecionado?.telefone || clienteSelecionado?.celular || null,
    inscricao_estadual_destino: clienteSelecionado?.inscricao_estadual || clienteSelecionado?.ie || null,
    numero_nf: freteValor("freteNumeroNf"),
    valor_nf: numeroFrete(freteValor("freteValorNf")),
    volumes: Number(freteValor("freteVolumes") || 1),
    peso_total: numeroFrete(freteValor("fretePeso")),
    medidas: freteValor("freteMedidas"),
    material: freteValor("freteMaterial") || "Cosméticos",
    embalagem: freteValor("freteEmbalagem") || "Caixas",
    coleta: freteValor("freteColeta") || "Sim",
    solicitante: freteValor("freteSolicitante") || "Johnny",
    prioridade: freteValor("fretePrioridade") || "normal",
    lembrete_minutos: Number(freteValor("freteLembreteMinutos") || 0),
    tipo_frete: freteValor("freteTipo") || "CIF",
    gnre_modo: freteValor("freteGnreModo") || "nao",
    origem_produto: freteValor("freteOrigemProduto") || "nacional",
    gnre_valor: numeroFrete(freteValor("freteGnreValor")),
    transportadoras_ids: Array.from(
      document.querySelectorAll(".frete-trans-check:checked")
    ).map(el => el.value)
  };
}

function variaveisFrete(dados, tipoResposta = dados.tipo_frete){
  return {
    SOLICITANTE: dados.solicitante,
    CNPJ_PAGADOR: tipoResposta === "CIF"
      ? FRETE_REMETENTE.cnpj
      : dados.cpf_cnpj_destino,
    CNPJ_DESTINO: dados.cpf_cnpj_destino,
    RAZAO_DESTINO: dados.cliente_nome,
    CNPJ_REMETENTE: FRETE_REMETENTE.cnpj,
    CEP_ORIGEM: FRETE_REMETENTE.cep,
    CIDADE_ORIGEM: FRETE_REMETENTE.cidade,
    ENDERECO_ORIGEM: FRETE_REMETENTE.endereco,
    CEP_DESTINO: dados.cep_destino,
    CIDADE_DESTINO: [dados.cidade_destino, dados.uf_destino].filter(Boolean).join("/"),
    ENDERECO_DESTINO: dados.endereco_destino,
    BAIRRO_DESTINO: dados.bairro_destino,
    VALOR_NF: moedaFrete(dados.valor_nf),
    VOLUMES: String(dados.volumes).padStart(2, "0"),
    PESO: (dados.peso_total || 0).toLocaleString("pt-BR", {
      minimumFractionDigits:3,
      maximumFractionDigits:3
    }) + " Kg",
    MEDIDAS: dados.medidas,
    TIPO_FRETE: tipoResposta,
    PAGADOR: tipoResposta === "CIF" ? "REMETENTE (CIF)" : "DESTINO (FOB)",
    MATERIAL: dados.material,
    EMBALAGEM: dados.embalagem,
    COLETA: dados.coleta
  };
}

function aplicarModeloFrete(texto, dados, tipoResposta){
  const variaveis = variaveisFrete(dados, tipoResposta);
  return String(texto || "").replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    (trecho, chave) => variaveis[chave] ?? ""
  );
}

async function carregarAliquotasFrete(){
  const resposta = await banco
    .from("frete_icms_uf")
    .select("*")
    .order("uf")
    .order("origem_produto");

  if(resposta.error){
    console.warn("Alíquotas GNRE:", resposta.error.message);
    return;
  }

  freteAliquotas = resposta.data || [];
  montarTabelaAliquotasFrete();
  calcularGnreFrete();
}

function montarTabelaAliquotasFrete(){
  const tbody = freteCampo("freteTabelaAliquotas");
  if(!tbody) return;

  tbody.innerHTML = freteAliquotas.map(a => `
    <tr>
      <td>${a.uf}</td>
      <td>${a.origem_produto}</td>
      <td><input id="aliqInt_${a.id}" value="${(Number(a.aliquota_interestadual)*100).toFixed(2)}"></td>
      <td><input id="aliqDest_${a.id}" value="${(Number(a.aliquota_interna)*100).toFixed(2)}"></td>
      <td><input id="aliqFcp_${a.id}" value="${(Number(a.fcp)*100).toFixed(2)}"></td>
      <td><button class="btn azul" onclick="salvarAliquotaFrete('${a.id}')">Salvar</button></td>
    </tr>
  `).join("");
}

async function salvarAliquotaFrete(id){
  const percentual = valor => Number(String(valor).replace(",", ".")) / 100;

  const dados = {
    aliquota_interestadual: percentual(freteCampo("aliqInt_" + id).value),
    aliquota_interna: percentual(freteCampo("aliqDest_" + id).value),
    fcp: percentual(freteCampo("aliqFcp_" + id).value),
    atualizado_em: new Date().toISOString()
  };

  const resposta = await banco.from("frete_icms_uf").update(dados).eq("id", id);
  if(resposta.error) alert(resposta.error.message);
  else carregarAliquotasFrete();
}

// Previa fiscal local: reutiliza exatamente o valor exibido na cotacao.
// Nao emite guia, nao chama API e nao confirma obrigacao tributaria.
// Analise local do XML de NF-e. Nao decide obrigacao de GNRE e nao transmite dados.
let freteGnreNfeLida = null;
async function analisarXmlGnreCotacao(input){
  const saida=document.getElementById("freteGnreXmlStatus");
  if(!saida || !input?.files?.length) return;
  freteGnreNfeLida=null;
  try{
    const arquivo=input.files[0];
    if(arquivo.size>3*1024*1024) throw new Error("XML excede 3 MB.");
    const xml=await arquivo.text();
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com declaracoes nao permitidas.");
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.getElementsByTagName("parsererror").length) throw new Error("XML malformado.");
    const elementos=nome=>Array.from(doc.getElementsByTagName("*")).filter(el=>el.localName===nome);
    const raiz=elementos("NFe")[0];
    const inf=elementos("infNFe")[0];
    if(!raiz || !inf) throw new Error("Arquivo nao contem uma NF-e.");
    const obter=(pai,nome)=>Array.from(pai?.getElementsByTagName("*")||[]).find(el=>el.localName===nome)?.textContent?.trim()||"";
    const ide=elementos("ide")[0],emit=elementos("emit")[0],dest=elementos("dest")[0],total=elementos("ICMSTot")[0];
    const chave=String(inf.getAttribute("Id")||"").replace(/^NFe/,"");
    if(!/^\\d{44}$/.test(chave)) throw new Error("Chave de NF-e invalida.");
    const ufOrigem=obter(ide,"cUF"), ufDestino=obter(dest,"UF");
    const numero=obter(ide,"nNF");
    const valor=Number(obter(total,"vNF"));
    if(!numero || !ufDestino || !Number.isFinite(valor) || valor<=0) throw new Error("Dados fiscais obrigatorios ausentes.");
    const cnpj=obter(emit,"CNPJ");
    const itens=elementos("det").map(item=>{
      const prod=Array.from(item.getElementsByTagName("*")).find(el=>el.localName==="prod");
      const imposto=Array.from(item.getElementsByTagName("*")).find(el=>el.localName==="imposto");
      const icms=Array.from(imposto?.getElementsByTagName("*")||[]).find(el=>el.localName==="ICMS");
      return {cfop:obter(prod,"CFOP"),ncm:obter(prod,"NCM"),cst:obter(icms,"CST"),csosn:obter(icms,"CSOSN")};
    });
    if(!itens.length) throw new Error("NF-e sem itens fiscais.");
    const cfops=[...new Set(itens.map(i=>i.cfop).filter(Boolean))];
    const situacoes=[...new Set(itens.map(i=>i.cst||i.csosn).filter(Boolean))];
    const ufTela=String(freteValor("freteUf")||"").toUpperCase();
    const nfTela=String(freteValor("freteNumeroNf")||"").trim();
    const valorTelaTexto=String(freteValor("freteValorNf")||"").trim();
    const valorTela=numeroFrete(valorTelaTexto);
    const divergencias=[];
    if(ufTela && ufTela!==ufDestino) divergencias.push("UF da cotacao difere da NF-e");
    if(nfTela && nfTela!==numero) divergencias.push("numero da NF da cotacao difere do XML");
    if(valorTelaTexto && Math.abs(valorTela-valor)>0.01) divergencias.push("valor da cotacao difere do XML");
    freteGnreNfeLida={chave,numero,ufDestino,cnpjEmitente:cnpj,valorNf:valor,ufCodigo:ufOrigem,itens,divergencias};
    saida.textContent="NF-e "+numero+" | UF "+ufDestino+" | Valor "+valor.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})+" | Chave "+chave+" | CFOP: "+(cfops.join(", ")||"nao informado")+" | CST/CSOSN: "+(situacoes.join(", ")||"nao informado")+(divergencias.length?" | ATENCAO: "+divergencias.join("; "):"")+" | Analise tributaria pendente. Nenhuma GNRE foi gerada.";
  }catch(erro){
    saida.textContent="Nao foi possivel analisar XML: "+erro.message;
  }
}

function preencherVencimentoGnreSeVazio(){
  const campo=document.getElementById("freteGnreVencimento");
  if(!campo || campo.value) return;
  const agora=new Date();
  const local=new Date(agora.getTime()-agora.getTimezoneOffset()*60000);
  campo.value=local.toISOString().slice(0,10);
}

function conferirPreviaGnreCotacao(){
  const saida = document.getElementById("freteGnrePrevia");
  if(!saida) return;
  const modo = freteValor("freteGnreModo");
  const nomeModo = {nao:"Nao se aplica",automatico:"Estimativa DIFAL/FCP",planilha2:"2% (NF + frete)",manual:"Valor manual"}[modo];
  const valorTexto = freteValor("freteGnreValor");
  const valor = numeroFrete(valorTexto);
  saida.replaceChildren();
  const linha = texto => { const p=document.createElement("p");p.textContent=texto;saida.appendChild(p); };
  linha("Modalidade: " + (nomeModo || "Nao identificada"));
  if(modo === "nao"){linha("Sem GNRE nesta cotacao. A obrigacao fiscal nao foi avaliada automaticamente.");return;}
  if(!valorTexto || !Number.isFinite(valor) || valor <= 0){
    linha("Calculo incompleto. Confira os valores e as aliquotas antes de prosseguir.");return;
  }
  if(modo === "manual"){
    const motivo=String(freteValor("freteGnreJustificativa") || "").trim();
    if(motivo.length < 5){linha("Informe uma justificativa de pelo menos 5 caracteres para o valor manual.");return;}
    linha("Justificativa: " + motivo);
  }
  preencherVencimentoGnreSeVazio();
  linha("Vencimento previsto (editavel): "+(freteValor("freteGnreVencimento")||"nao informado")+"; sujeito a confirmacao fiscal.");
  linha("Valor estimado: " + valor.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}));
  linha("UF de destino: " + (freteValor("freteUf") || "Nao informada"));
  if(freteGnreNfeLida){
    linha("NF-e XML conferida: "+freteGnreNfeLida.numero+" | Chave: "+freteGnreNfeLida.chave);
    if(freteGnreNfeLida.divergencias.length) linha("ATENCAO: "+freteGnreNfeLida.divergencias.join("; "));
  }
  linha("Situacao: analise fiscal pendente. Esta previa NAO gera XML oficial nem transmite GNRE.");
}

function calcularGnreFrete(){
  const modo = freteValor("freteGnreModo");
  const campo = freteCampo("freteGnreValor");
  const informacao = freteCampo("freteAliquotaInfo");
  if(!campo || !informacao) return;

  campo.readOnly = modo === "automatico" || modo === "planilha2";

  if(modo === "nao"){
    campo.value = "";
    informacao.value = "Não se aplica";
    return;
  }

  if(modo === "manual"){
    informacao.value = "Valor informado manualmente";
    return;
  }

  if(modo === "planilha2"){
    const nf = numeroFrete(freteValor("freteValorNf"));
    const frete = numeroFrete(freteValor("freteGnreFreteBase"));
    if(!Number.isFinite(nf) || !Number.isFinite(frete) || nf < 0 || frete < 0 || !freteValor("freteValorNf")){
      campo.value = "";
      informacao.value = "Informe valores válidos de NF e frete";
      return;
    }
    const total = Math.round((nf + frete) * 0.02 * 100) / 100;
    campo.value = total.toLocaleString("pt-BR", {minimumFractionDigits:2,maximumFractionDigits:2});
    informacao.value = "Planilha: (NF + frete) × 2% — estimativa";
    return;
  }

  const uf = freteValor("freteUf").toUpperCase();
  const origem = freteValor("freteOrigemProduto");
  const valorNf = numeroFrete(freteValor("freteValorNf"));
  const aliquota = freteAliquotas.find(
    a => a.uf === uf && a.origem_produto === origem
  );

  if(!aliquota || !valorNf){
    campo.value = "";
    informacao.value = "Alíquota ou valor não localizado";
    return;
  }

  const difal = Math.max(
    0,
    valorNf * (
      Number(aliquota.aliquota_interna) -
      Number(aliquota.aliquota_interestadual)
    )
  );

  const fcp = valorNf * Number(aliquota.fcp || 0);
  const total = difal + fcp;

  campo.value = total.toLocaleString("pt-BR", {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });

  informacao.value =
    `${(Number(aliquota.aliquota_interestadual)*100).toFixed(2)}% → ` +
    `${(Number(aliquota.aliquota_interna)*100).toFixed(2)}% + ` +
    `FCP ${(Number(aliquota.fcp)*100).toFixed(2)}%`;
}



function extrairMedidasRodonaves(texto){
  const nums=String(texto||"").replace(/,/g,".").match(/\d+(?:\.\d+)?/g)||[];
  const paraCm=valor=>{
    const n=Number(valor||0);
    // Na tela operacional as medidas podem ser digitadas em metros: 0,38 x 0,29 x 0,35.
    // Valores até 3 são convertidos para centímetros; valores maiores já são tratados como cm.
    return n>0&&n<=3?Number((n*100).toFixed(3)):n;
  };
  return {
    altura_cm:paraCm(nums[0]),
    largura_cm:paraCm(nums[1]),
    comprimento_cm:paraCm(nums[2])
  };
}

async function validarChaveIntegracoesCotacao(chave){
  const resposta=await fetch("/api/integracoes?action=validar-chave",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-integrations-admin-key":chave
    },
    body:"{}"
  });
  const dados=await resposta.json().catch(()=>({}));
  if(!resposta.ok||dados.ok===false)return {ok:false,dados};
  if(dados.device_token){
    sessionStorage.setItem("integrations_admin_key",dados.device_token);
    localStorage.setItem("integrations_admin_key",dados.device_token);
  }
  return {ok:true,dados};
}

function abrirModalChaveIntegracoesCotacao(){
  return new Promise(resolve=>{
    const anterior=document.getElementById("modalChaveIntegracoesCotacao");
    if(anterior)anterior.remove();

    const fundo=document.createElement("div");
    fundo.id="modalChaveIntegracoesCotacao";
    fundo.className="modal-chave-integracoes-fundo";
    fundo.innerHTML=`
      <div class="modal-chave-integracoes-card">
        <h3>🔐 Autorizar integrações do portal</h3>
        <p>Informe sua Senha Mestre de Integrações. Em computadores já autorizados, a migração é automática.</p>
        <label>Senha mestre
          <div class="modal-chave-integracoes-campo">
            <input id="campoChaveIntegracoesCotacao" type="password" autocomplete="off" placeholder="Digite a senha mestre">

          </div>
        </label>
        <div id="erroChaveIntegracoesCotacao" class="modal-chave-integracoes-erro"></div>
        <div class="modal-chave-integracoes-acoes">
          <button type="button" class="btn roxo" id="cancelarChaveIntegracoesCotacao">Cancelar</button>
          <button type="button" class="btn verde" id="validarChaveIntegracoesCotacao">Validar e continuar</button>
        </div>
      </div>`;
    document.body.appendChild(fundo);

    const input=fundo.querySelector("#campoChaveIntegracoesCotacao");
    const erro=fundo.querySelector("#erroChaveIntegracoesCotacao");
    const btn=fundo.querySelector("#validarChaveIntegracoesCotacao");
    input.focus();

    fundo.querySelector("#cancelarChaveIntegracoesCotacao").onclick=()=>{
      fundo.remove();resolve("");
    };
    btn.onclick=async()=>{
      const chave=input.value.trim();
      if(!chave){erro.textContent="Informe a chave administrativa.";return;}
      btn.disabled=true;btn.textContent="Validando...";erro.textContent="";
      try{
        const validacao=await validarChaveIntegracoesCotacao(chave);
        if(!validacao.ok){erro.textContent="Autorização recusada nesta Preview. Confira se a senha mestre foi configurada para esta branch e publique novamente após alterar a variável.";return;}
        const autorizado=localStorage.getItem("integrations_admin_key")||sessionStorage.getItem("integrations_admin_key")||chave;
        sessionStorage.setItem("integrations_admin_key",autorizado);
        localStorage.setItem("integrations_admin_key",autorizado);
        fundo.remove();resolve(autorizado);
      }catch(e){
        erro.textContent="Não foi possível validar a chave. Tente novamente.";
      }finally{
        btn.disabled=false;btn.textContent="Validar e continuar";
      }
    };
    input.addEventListener("keydown",e=>{if(e.key==="Enter")btn.click()});
  });
}

async function obterChaveIntegracoesCotacao(){
  let chave=(localStorage.getItem("integrations_admin_key")||sessionStorage.getItem("integrations_admin_key"))||"";
  if(chave){
    try{
      const v=await validarChaveIntegracoesCotacao(chave);
      if(v.ok)return localStorage.getItem("integrations_admin_key")||sessionStorage.getItem("integrations_admin_key")||chave;
    }catch{}
    sessionStorage.removeItem("integrations_admin_key");
    localStorage.removeItem("integrations_admin_key");
  }
  return abrirModalChaveIntegracoesCotacao();
}

async function cotarAutomaticamenteRodonaves(transportadoraId,tipoFrete){
  let dados=dadosFormularioFrete();
  const chave=chaveRespostaFrete(transportadoraId,tipoFrete);
  const botao=document.getElementById(`btnRodonaves_${chave}`);

  if(tipoFrete==="FOB"){
    alert(
      "A cotação automática FOB ainda depende da confirmação da Rodonaves sobre o valor do campo PayerSelected. "+
      "Por segurança, nesta versão a cotação automática está liberada somente para CIF."
    );
    return;
  }

  const documento=String(dados.cpf_cnpj_destino||"").replace(/\D/g,"");
  const cep=String(dados.cep_destino||"").replace(/\D/g,"");

  if(!dados.cliente_nome||documento.length<11||cep.length!==8){
    alert("Para cotar automaticamente, informe cliente, CNPJ/CPF válido e CEP de destino.");
    return;
  }

  if(!dados.peso_total||!dados.valor_nf||!dados.volumes){
    alert("Informe peso, valor da NF e quantidade de volumes.");
    return;
  }

  botao.disabled=true;
  const textoOriginal=botao.textContent;
  botao.textContent="Consultando Rodonaves...";

  try{
    const chaveAdministrativa=await obterChaveIntegracoesCotacao();
    if(!chaveAdministrativa)throw new Error("Cotação automática cancelada: chave administrativa não informada.");

    // Salva a cotação primeiro para manter o histórico.
    const salva=await salvarCotacaoFrete("rascunho");
    if(!salva)throw new Error("Não foi possível salvar a cotação antes da consulta.");

    const resposta=await fetch("/api/integracoes?action=cotar-rodonaves",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-integrations-admin-key":chaveAdministrativa
      },
      body:JSON.stringify({
        cotacao_id:salva.id,
        cliente_nome:dados.cliente_nome,
        cpf_cnpj_destino:documento,
        cep_destino:cep,
        cidade_destino:dados.cidade_destino,
        uf_destino:dados.uf_destino,
        endereco_destino:dados.endereco_destino,
        logradouro_destino:dados.logradouro_destino,
        numero_destino:dados.numero_destino,
        complemento_destino:dados.complemento_destino,
        bairro_destino:dados.bairro_destino,
        email_destino:dados.email_destino,
        telefone_destino:dados.telefone_destino,
        inscricao_estadual_destino:dados.inscricao_estadual_destino,
        peso_total:dados.peso_total,
        valor_nf:dados.valor_nf,
        volumes:dados.volumes,
        solicitante:dados.solicitante||"Johnny",
        tipo_frete:tipoFrete,
        embalagem:dados.embalagem||"Caixas",
        ...extrairMedidasRodonaves(dados.medidas),
        peso_unitario:dados.volumes?Number(dados.peso_total)/Number(dados.volumes):null,
        enviar_packs:(()=>{
          const m=extrairMedidasRodonaves(dados.medidas);
          return !!(m.altura_cm&&m.largura_cm&&m.comprimento_cm&&Number(dados.volumes)>0);
        })(),
        modo_packs:"agrupado"
      })
    });

    const corpo=await resposta.json().catch(()=>({}));

    if(!resposta.ok){
      if(resposta.status===401){
        sessionStorage.removeItem("integrations_admin_key");
        throw new Error("A chave administrativa expirou ou está incorreta. Clique novamente em cotar e informe a chave cadastrada na Vercel.");
      }
      if(resposta.status===422 && corpo.codigo==="DESTINATARIO_DADOS_INCOMPLETOS"){
        dados=await solicitarCompletarDestinatarioRodonaves(dados,corpo.campos_faltantes||[]);
        mostrarBalaoSistema("Cadastro atualizado","Dados preenchidos. Continuando automaticamente a cotação Rodonaves...");
        botao.disabled=false; botao.textContent=textoOriginal;
        return cotarAutomaticamenteRodonaves(transportadoraId,tipoFrete);
      }
      throw new Error(corpo.erro||`Falha HTTP ${resposta.status}`);
    }

    const numero=corpo.numero_cotacao||"";
    const valor=Number(corpo.valor_frete||0);
    const prazo=corpo.prazo_dias
      ? `${corpo.prazo_dias} ${Number(corpo.prazo_dias)===1?"dia útil":"dias úteis"}`
      : "";

    freteCampo(`freteRespNumero_${chave}`).value=numero;
    freteCampo(`freteRespValor_${chave}`).value=valor
      ? valor.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})
      : "";
    freteCampo(`freteRespPrazo_${chave}`).value=prazo;

    await registrarRespostaFrete(transportadoraId,tipoFrete);

    mostrarBalaoSistema(
      "Cotação Rodonaves recebida",
      `${moedaFrete(valor)}${prazo?` • ${prazo}`:""}`
    );

    if(corpo.aviso){
      const statusPacks=corpo.packs_enviados
        ? `\n\nCubagem enviada em Packs (${corpo.modo_packs||"agrupado"}).`
        : "\n\nPacks não enviado porque as dimensões não estavam completas.";
      alert("Cotação concluída.\n\n"+corpo.aviso+statusPacks);
    }
  }catch(erro){
    console.error("Cotação automática Rodonaves:",erro);
    let mensagem=erro.message||String(erro);

    if(/destinatário não encontrado/i.test(mensagem)){
      mensagem+=
        "\n\nO destinatário ainda não está cadastrado na base da Rodonaves. "+
        "A próxima etapa será ativar o cadastro automático do cliente pela API Customer.";
    }

    alert("Não foi possível gerar a cotação automática:\n\n"+mensagem);
  }finally{
    botao.disabled=false;
    botao.textContent=textoOriginal;
  }
}

async function cotarAutomaticamenteAlfa(transportadoraId,tipoFrete){
  const dados=dadosFormularioFrete();
  const chave=chaveRespostaFrete(transportadoraId,tipoFrete);
  const botao=document.getElementById(`btnAlfa_${chave}`);
  const documento=String(dados.cpf_cnpj_destino||"").replace(/\D/g,"");
  const cep=String(dados.cep_destino||"").replace(/\D/g,"");
  if(!dados.cliente_nome||![11,14].includes(documento.length)||cep.length!==8){
    return alert("Para cotar automaticamente na Alfa, informe cliente, CPF/CNPJ válido e CEP de destino.");
  }
  if(!dados.peso_total||!dados.valor_nf||!dados.volumes||!String(dados.medidas||"").trim()){
    return alert("A Alfa exige valor da mercadoria, peso, volumes e cubagem. Informe também as medidas dos volumes.");
  }
  const original=botao?.textContent||"⚡ Cotar Alfa"; if(botao){botao.disabled=true;botao.textContent="Consultando Alfa...";}
  try{
    const adm=await obterChaveIntegracoesCotacao(); if(!adm)throw new Error("Cotação cancelada: chave administrativa não informada.");
    const salva=await salvarCotacaoFrete("rascunho"); if(!salva)throw new Error("Não foi possível salvar a cotação antes da consulta.");
    const cnpjRemetente=String(FRETE_REMETENTE?.cnpj||"").replace(/\D/g,"");
    const cepRemetente=String(FRETE_REMETENTE?.cep||"").replace(/\D/g,"");
    if(cnpjRemetente.length!==14)throw new Error("O CNPJ do remetente/origem da Sofisticatto não está configurado corretamente.");
    if(cepRemetente.length!==8)throw new Error("O CEP do remetente/origem da Sofisticatto não está configurado corretamente.");

    const r=await fetch("/api/integracoes?action=cotar-alfa",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({
      cotacao_id:salva.id,
      cliente_nome:dados.cliente_nome,
      cpf_cnpj_destino:documento,
      cep_destino:cep,
      cnpj_remetente:cnpjRemetente,
      cep_remetente:cepRemetente,
      razao_remetente:String(FRETE_REMETENTE?.razao||FRETE_REMETENTE?.nome||"SOFISTICATTO COSMÉTICOS"),
      peso_total:dados.peso_total,
      valor_nf:dados.valor_nf,
      volumes:dados.volumes,
      medidas:dados.medidas,
      tipo_frete:tipoFrete
    })});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){if(r.status===401)sessionStorage.removeItem("integrations_admin_key");throw new Error(d.erro||`HTTP ${r.status}`);}
    const valor=Number(d.valor_frete||0);const prazo=d.prazo||"";
    freteCampo(`freteRespNumero_${chave}`).value=d.numero_cotacao||"";
    freteCampo(`freteRespValor_${chave}`).value=valor?valor.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}):"";
    freteCampo(`freteRespPrazo_${chave}`).value=prazo;
    await registrarRespostaFrete(transportadoraId,tipoFrete);
    mostrarBalaoSistema("Cotação Alfa recebida",`${moedaFrete(valor)}${prazo?` • ${prazo}`:""}`);
  }catch(e){console.error("Cotação automática Alfa:",e);alert("Não foi possível gerar a cotação automática da Alfa:\n\n"+(e.message||e));}
  finally{if(botao){botao.disabled=false;botao.textContent=original;}}
}

async function cotarAutomaticamenteSSW(transportadoraId,tipoFrete){
  const dados=dadosFormularioFrete();const chave=chaveRespostaFrete(transportadoraId,tipoFrete);
  const botao=document.getElementById(`btnSSW_${chave}`);const tr=freteTransportadoras.find(t=>String(t.id)===String(transportadoraId));
  const cep=String(dados.cep_destino||"").replace(/\D/g,"");
  const cnpjDestino=String(dados.cpf_cnpj_destino||"").replace(/\D/g,"");
  if(cep.length!==8)return alert("Para cotar automaticamente no SSW, informe um CEP de destino válido.");
  if(!Number(dados.valor_nf||0))return alert("Informe o valor da NF para cotação SSW.");
  if(!Number(dados.peso_total||0)&&!String(dados.medidas||"").trim())return alert("Informe peso ou medidas/volume para cotação SSW.");
  const cnpjRem=String(FRETE_REMETENTE.cnpj||"").replace(/\D/g,"");
  const cnpjPagador=tipoFrete==="CIF"?cnpjRem:cnpjDestino;
  if(cnpjPagador.length!==14)return alert(`Para cotação ${tipoFrete}, o pagador precisa possuir CNPJ de 14 dígitos. O WebService SSW cotar() não aceita CPF como CNPJ pagador.`);
  console.info(`[V136 SSW ${tipoFrete}] Papéis da cotação`,{remetente:cnpjRem,destinatario:cnpjDestino,pagador:cnpjPagador});
  const nomeTr=tr?.nome||"SSW";
  const nomeCurto=/\btg\b|tgt/i.test(nomeTr)?"TG":/accert/i.test(nomeTr)?"ACCERT":nomeTr;
  const original=botao?.textContent||`⚡ Cotar ${nomeCurto} automaticamente`;if(botao){botao.disabled=true;botao.textContent=`Consultando ${nomeCurto}...`;}
  try{
    const adm=await chaveAdminColeta();if(!adm)throw new Error("Informe a chave administrativa.");
    const r=await fetch("/api/integracoes?action=cotar-ssw",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({transportadora_id:transportadoraId,tipo_frete:tipoFrete,cnpj_pagador:cnpjPagador,cnpj_remetente:cnpjRem,cnpj_destinatario:cnpjDestino,cep_origem:String(FRETE_REMETENTE.cep||"").replace(/\D/g,""),cep_destino:cep,valor_nf:dados.valor_nf,quantidade:dados.volumes||1,peso:dados.peso_total||0,medidas:dados.medidas||"",coletar:dados.coleta||"Sim",ent_dificil:"N",dest_contribuinte:"N"})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      const detalhe=Array.isArray(d.faltando)&&d.faltando.length?`\n\nCampos ausentes: ${d.faltando.join(', ')}`:'';
      let msg=d.erro||`HTTP ${r.status}`;
      if(/tabela de frete negociada|cotacao.*nao permitida|cotação.*não permitida/i.test(msg)){
        msg=`A ${nomeTr} recusou esta cotação porque há uma tabela de frete negociada para este cliente/pagador e essa modalidade de cotação não foi permitida pelo WebService SSW. Consulte a ${nomeTr} para confirmar/liberar a tabela negociada.`;
      }
      if(d.resposta) console.error(`[V136 SSW ${tipoFrete}] Diagnóstico backend`, d.resposta);
      throw new Error(msg+detalhe);
    }
    if(!Number(d.valor||0))throw new Error(d.mensagem||"O SSW não retornou valor de frete.");
    freteCampo(`freteRespNumero_${chave}`).value="SSW";
    freteCampo(`freteRespValor_${chave}`).value=Number(d.valor).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
    freteCampo(`freteRespPrazo_${chave}`).value=d.prazo?`${d.prazo} dias corridos`:"";
    registrarRespostaFrete(transportadoraId,tipoFrete);
    mostrarBalaoSistema(`Cotação ${tr?.nome||"SSW"} recebida`,`${Number(d.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}${d.prazo?` • ${d.prazo} dias`:""}${d.mensagem?` • ${d.mensagem}`:""}`);
  }catch(e){console.error("Cotação automática SSW:",e);alert(`Não foi possível gerar a cotação automática de ${tr?.nome||"SSW"}:\n\n${e.message||e}`);}finally{if(botao){botao.disabled=false;botao.textContent=original;}}
}

async function cotarAutomaticamenteBraspress(transportadoraId,tipoFrete){
  const dados=dadosFormularioFrete();
  const chave=chaveRespostaFrete(transportadoraId,tipoFrete);
  const botao=document.getElementById(`btnBraspress_${chave}`);
  const documento=String(dados.cpf_cnpj_destino||"").replace(/\D/g,"");
  const cep=String(dados.cep_destino||"").replace(/\D/g,"");
  if(![11,14].includes(documento.length)||cep.length!==8)return alert("Para cotar na Braspress, informe CPF/CNPJ e CEP válidos do destino.");
  if(!Number(dados.valor_nf||0)||!Number(dados.peso_total||0)||!Number(dados.volumes||0))return alert("Informe valor da NF, peso total e volumes para cotar na Braspress.");
  const medidas=typeof extrairMedidasRodonaves==="function"?extrairMedidasRodonaves(dados.medidas):{};
  const original=botao?.textContent||"🚚 Cotar Braspress automaticamente";
  if(botao){botao.disabled=true;botao.textContent="Consultando Braspress...";}
  try{
    const adm=await obterChaveIntegracoesCotacao(); if(!adm)throw new Error("Chave administrativa não informada.");
    const salva=await salvarCotacaoFrete("rascunho"); if(!salva)throw new Error("Não foi possível salvar a cotação antes da consulta.");
    // V393: cotação não depende da lista de convites carregada no navegador.
    // O backend recupera as credenciais de produção do cofre criptografado.
    const convite=(Array.isArray(window.integracoesTransportadoras)?window.integracoesTransportadoras:[]).find(i=>/braspress/i.test(String(i.transportadora_nome||"")));
    const r=await fetch("/api/integracoes?action=cotar-braspress",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({
      convite_id:convite?.id||null,ambiente:"producao",cnpjDestinatario:documento,cepDestino:cep,vlrMercadoria:Number(dados.valor_nf),peso:Number(dados.peso_total),volumes:Number(dados.volumes),
      modal:"R",tipoFrete:tipoFrete==="FOB"?"2":"1",altura_cm:medidas.altura_cm||10,largura_cm:medidas.largura_cm||10,comprimento_cm:medidas.comprimento_cm||10
    })});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);
    const valor=Number(d.cotacao?.totalFrete||0), prazo=d.cotacao?.prazo??"", numero=d.cotacao?.id??"";
    if(!valor)throw new Error("A Braspress respondeu, mas não retornou valor de frete.");
    freteCampo(`freteRespNumero_${chave}`).value=numero;
    freteCampo(`freteRespValor_${chave}`).value=valor.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
    freteCampo(`freteRespPrazo_${chave}`).value=prazo?`${prazo} dia(s)`:"";
    await registrarRespostaFrete(transportadoraId,tipoFrete);
    mostrarBalaoSistema("Cotação Braspress recebida",`${moedaFrete(valor)}${prazo?` • ${prazo} dia(s)`:""}`);
  }catch(e){console.error("Cotação Braspress:",e);alert("Não foi possível cotar na Braspress:\n\n"+(e.message||e));}
  finally{if(botao){botao.disabled=false;botao.textContent=original;}}
}

async function cotarAutomaticamenteCorreios(transportadoraId,tipoFrete){
  const dados=dadosFormularioFrete();
  const chave=chaveRespostaFrete(transportadoraId,tipoFrete);
  const botao=document.getElementById(`btnCorreios_${chave}`);
  const cep=String(dados.cep_destino||"").replace(/\D/g,"");
  if(cep.length!==8)return alert("Para cotar nos Correios, informe um CEP de destino válido.");
  if(!Number(dados.peso_total||0))return alert("Informe o peso total da mercadoria para cotar nos Correios.");
  const medidas=typeof extrairMedidasRodonaves==="function"?extrairMedidasRodonaves(dados.medidas):{};
  const original=botao?.textContent||"📮 Cotar Correios";
  if(botao){botao.disabled=true;botao.textContent="Consultando Correios...";}
  try{
    const adm=await obterChaveIntegracoesCotacao(); if(!adm)throw new Error("Chave administrativa não informada.");
    const salva=await salvarCotacaoFrete("rascunho"); if(!salva)throw new Error("Não foi possível salvar a cotação antes da consulta.");
    const r=await fetch("/api/integracoes?action=cotar-correios",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({
      cotacao_id:salva.id,cep_destino:cep,peso_total:Number(dados.peso_total),volumes:Number(dados.volumes||1),
      comprimento_cm:medidas.comprimento_cm||20,largura_cm:medidas.largura_cm||20,altura_cm:medidas.altura_cm||20,
      uf_destino:dados.uf_destino||"",cidade_destino:dados.cidade_destino||"",bairro_destino:dados.bairro_destino||"",endereco_destino:dados.endereco_destino||""
    })});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);
    if(d.cepFallback?.cepUtilizado){
      const novo=String(d.cepFallback.cepUtilizado).replace(/(\d{5})(\d{3})/,"$1-$2");
      const antigo=String(d.cepFallback.cepOriginal||cep).replace(/(\d{5})(\d{3})/,"$1-$2");
      const e=d.cepFallback.endereco||{};
      const descricao=[e.logradouro,e.bairro,[e.localidade,e.uf].filter(Boolean).join("/")].filter(Boolean).join(" • ");
      const usar=confirm(`O CEP ${antigo} não retornou cotação.\n\nOs Correios localizaram um CEP mais específico pelo endereço:\n${novo}${descricao?`\n${descricao}`:""}\n\nDeseja usar ${novo} nesta cotação?`);
      if(!usar)throw new Error("Cotação cancelada: o CEP específico encontrado pelo endereço não foi confirmado.");
      mostrarBalaoSistema("CEP específico encontrado",`${novo} será usado somente nesta cotação.`);
      if(dados.cliente_id && confirm(`Deseja também atualizar o CEP deste cliente no cadastro para ${novo}?`)){
        try{
          const resp=await banco.from("email_clientes").update({cep:novo}).eq("id",dados.cliente_id).select().single();
          if(resp.error)throw resp.error;
          const idx=(emailClientes||[]).findIndex(c=>String(c.id)===String(dados.cliente_id));
          if(idx>=0)emailClientes[idx]=resp.data;
          if(freteCampo("freteCep"))freteCampo("freteCep").value=novo;
          mostrarBalaoSistema("CEP do cliente atualizado",novo);
        }catch(err){console.error("Atualizar CEP do cliente:",err);alert("A cotação continuará usando o CEP encontrado, mas não foi possível atualizar o cadastro do cliente: "+(err.message||err));}
      }
    }
    const validas=(d.resultados||[]).filter(x=>!x.erro&&Number(x.valor||0)>0);
    const melhor=d.melhor;if(!melhor||!validas.length)throw new Error("Nenhum serviço dos Correios configurado retornou preço. Verifique as APIs liberadas e os códigos de serviço do contrato.");
    freteOpcoesCorreios[chave]=validas;
    renderizarOpcoesCorreios(chave,validas,melhor.coProduto,(d.resultados||[]));
    // Atualiza a mensagem imediatamente com TODAS as opções (PAC, SEDEX etc.), antes da escolha final.
    if(typeof atualizarMensagemVendedoraFrete==="function") atualizarMensagemVendedoraFrete();
    // Não preenche automaticamente: o usuário escolhe preço/prazo que deseja oferecer ao cliente.
    freteCampo(`freteRespNumero_${chave}`).value="";
    freteCampo(`freteRespValor_${chave}`).value="";
    freteCampo(`freteRespPrazo_${chave}`).value="";
    mostrarBalaoSistema("Cotação Correios recebida",`${validas.length} opção(ões) disponível(is). Escolha preço e prazo no cartão dos Correios.`);
  }catch(e){console.error("Cotação Correios:",e);alert("Não foi possível cotar nos Correios:\n\n"+(e.message||e));}
  finally{if(botao){botao.disabled=false;botao.textContent=original;}}
}

function nomeServicoCorreios(op){
  const codigo=String(op?.coProduto||'').trim();
  const retornado=String(op?.servico||'').trim();
  const nomesPadrao={
    '03298':'PAC CONTRATO AG',
    '03220':'SEDEX CONTRATO AG',
    '03158':'SEDEX 10 CONTRATO AG',
    '03140':'SEDEX 12 CONTRATO AG',
    '03204':'SEDEX HOJE CONTRATO AG',
    '04227':'CORREIOS MINI ENVIOS CTR AG'
  };
  // Nesta versão a cotação é exclusivamente contratual. Mantemos AG visível
  // para não confundir a tarifa do contrato com preço avulso dos Correios.
  if(retornado){
    const u=retornado.toUpperCase();
    if(/\bAG\s*$/.test(u)) return retornado;
    const base=nomesPadrao[codigo];
    if(base)return base;
    return `${retornado} — CONTRATO AG`;
  }
  return nomesPadrao[codigo]||`Serviço Correios ${codigo} — CONTRATO AG`;
}

function opcoesCorreiosDaCotacao(dados){
  const tipos=tiposRespostaFrete(dados.tipo_frete);
  const saida=[];
  (dados.transportadoras_ids||[]).forEach(id=>{
    const tr=freteTransportadoras.find(t=>String(t.id)===String(id));
    if(!/(correios|coreios)/i.test(tr?.nome||''))return;
    tipos.forEach(tipo=>{
      const chave=chaveRespostaFrete(id,tipo);
      const lista=freteOpcoesCorreios[chave]||[];
      lista.forEach(op=>saida.push({...op,transportadora_id:id,transportadora_nome:tr?.nome||'Correios',tipo_frete:tipo,chave}));
    });
  });
  return saida;
}

function renderizarOpcoesCorreios(chave,opcoes,melhorCodigo,todosResultados=[]){
  const box=document.getElementById(`freteOpcoesCorreios_${chave}`);
  if(!box)return;
  const lista=[...(opcoes||[])].sort((a,b)=>{
    const pa=Number(a.prazoDias||9999),pb=Number(b.prazoDias||9999);
    return pa-pb || Number(a.valor||0)-Number(b.valor||0);
  });
  const menorPrazo=Math.min(...lista.map(x=>Number(x.prazoDias||9999)));
  box.innerHTML=`<div style="margin-top:12px;padding:12px;border:1px solid #d9d2f2;border-radius:14px;background:#fbfaff;">
    <div style="font-weight:800;color:#493f92;margin-bottom:9px;">📮 Escolha o serviço dos Correios</div>
    <div style="font-size:12px;color:#625d77;margin-bottom:10px;">Todas as opções abaixo entram automaticamente na mensagem de comparação. Depois que o cliente escolher, clique em <strong>Usar esta opção no pedido</strong>.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px;">
      ${lista.map((x,i)=>{
        const preco=Number(x.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        const prazo=x.prazoDias?`${x.prazoDias} dias úteis`:'Prazo não informado';
        const servico=nomeServicoCorreios(x);
        const barato=String(x.coProduto)===String(melhorCodigo);
        const rapido=Number(x.prazoDias||9999)===menorPrazo;
        return `<div style="border:1px solid #dcd7ef;border-radius:12px;padding:11px;background:white;">
          <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;">
            <div><strong>${escaparHtmlEmail(servico||`Correios ${x.coProduto}`)}</strong><br><small>Código ${escaparHtmlEmail(x.coProduto||'')}</small></div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
              ${barato?'<span style="font-size:10px;background:#e8f7ed;color:#176b37;padding:3px 6px;border-radius:999px;font-weight:700;">MENOR PREÇO</span>':''}
              ${rapido?'<span style="font-size:10px;background:#e9efff;color:#2949a8;padding:3px 6px;border-radius:999px;font-weight:700;">MAIS RÁPIDO</span>':''}
            </div>
          </div>
          <div style="font-size:20px;font-weight:800;margin-top:8px;">${preco}</div>
          <div style="margin:4px 0 10px;color:#514c66;">⏱ ${prazo}</div>
          <button class="btn verde" style="width:100%;" onclick="selecionarOpcaoCorreios('${chave}',${i})">Usar esta opção no pedido</button>
        </div>`;
      }).join('')}
      ${(todosResultados||[]).filter(f=>f?.erro && !(lista||[]).some(x=>String(x.coProduto)===String(f.coProduto))).map(falha=>{
        const nome=nomeServicoCorreios(falha);
        return `<div style="border:1px dashed #e1b9b9;border-radius:12px;padding:11px;background:#fffafa;color:#8c3333;"><strong>${escaparHtmlEmail(nome)}</strong><br><small>Código ${escaparHtmlEmail(falha.coProduto||'')}</small><div style="margin-top:7px;font-size:12px;">⚠ ${escaparHtmlEmail(falha.erro||'Serviço AG indisponível para esta cotação.')}</div></div>`;
      }).join('')}
    </div>
  </div>`;
  // Guarda na mesma ordem exibida para o índice do botão ser estável.
  freteOpcoesCorreios[chave]=lista;
}

async function selecionarOpcaoCorreios(chave,indice){
  const op=(freteOpcoesCorreios[chave]||[])[Number(indice)];
  if(!op)return alert('Não foi possível localizar esta opção dos Correios. Faça a cotação novamente.');
  freteCampo(`freteRespNumero_${chave}`).value=`Correios ${op.coProduto}`;
  freteCampo(`freteRespValor_${chave}`).value=Number(op.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  freteCampo(`freteRespPrazo_${chave}`).value=op.prazoDias?`${op.prazoDias} dias úteis`:'';
  const box=document.getElementById(`freteOpcoesCorreios_${chave}`);
  if(box){
    box.querySelectorAll('button').forEach(b=>{b.textContent='Usar esta opção no pedido';b.disabled=false;});
    const btn=box.querySelectorAll('button')[Number(indice)];
    if(btn){btn.textContent='✓ Opção selecionada';btn.disabled=true;}
  }
  mostrarBalaoSistema('Serviço dos Correios selecionado',`${Number(op.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}${op.prazoDias?` • ${op.prazoDias} dias úteis`:''}`);
}


async function garantirVendedoraFrete(dados){
  let cliente=(typeof clienteFretePorId==='function'&&clienteFretePorId(dados.cliente_id))||(typeof clienteFretePorNome==='function'&&clienteFretePorNome(dados.cliente_nome));
  if(!cliente?.id){alert('Selecione um cliente cadastrado para vincular a vendedora.');return false;}
  if(cliente.vendedora_id)return true;
  if(typeof carregarVendedorasEmail==='function')await carregarVendedorasEmail();
  const lista=(typeof emailVendedoras!=='undefined'?emailVendedoras:[]).filter(v=>v.id);
  if(!lista.length){alert('Cadastre uma vendedora na aba Vendedoras antes de continuar.');return false;}
  const id=await selecionarVendedoraSofisticatto('Selecione a vendedora para a cotação de '+dados.cliente_nome);
  if(!id)return false;
  const r=await banco.from('email_clientes').update({vendedora_id:id}).eq('id',cliente.id).select().single();
  if(r.error){alert('Não foi possível salvar a vendedora: '+r.error.message);return false;}
  if(typeof emailClientes!=='undefined'){const i=emailClientes.findIndex(x=>String(x.id)===String(cliente.id));if(i>=0)emailClientes[i]=r.data;}
  return true;
}
async function selecionarVendedoraSofisticatto(titulo){
  if(typeof carregarVendedorasEmail==='function'&&(!Array.isArray(emailVendedoras)||!emailVendedoras.length))await carregarVendedorasEmail();
  const lista=(emailVendedoras||[]).filter(x=>x.id);
  return new Promise(resolve=>{
    const fundo=document.createElement('div');fundo.style.cssText='position:fixed;inset:0;background:#181331a8;z-index:200000;display:flex;align-items:center;justify-content:center;padding:15px';
    const caixa=document.createElement('div');caixa.style.cssText='background:white;border-radius:16px;padding:22px;width:min(470px,95vw);color:#4d4694';
    const h=document.createElement('h3');h.textContent=titulo;h.style.marginBottom='12px';
    const busca=document.createElement('input');busca.placeholder='Pesquisar vendedora pelo nome';busca.style.marginBottom='8px';
    const select=document.createElement('select');select.size=Math.min(7,Math.max(2,lista.length));select.style.cssText='width:100%;margin-bottom:15px';
    function montar(){const q=busca.value.toLocaleLowerCase('pt-BR');select.replaceChildren();lista.filter(x=>String(x.nome||'').toLocaleLowerCase('pt-BR').includes(q)).forEach(x=>{const op=document.createElement('option');op.value=x.id;op.textContent=x.nome||'Sem nome';select.append(op);});}
    busca.oninput=montar;montar();const acoes=document.createElement('div');acoes.style.cssText='display:flex;gap:8px;justify-content:flex-end';
    const cancelar=document.createElement('button');cancelar.textContent='Cancelar';cancelar.className='btn roxo';
    const salvar=document.createElement('button');salvar.textContent='Salvar vendedora';salvar.className='btn verde';
    const fim=id=>{fundo.remove();resolve(id)};cancelar.onclick=()=>fim(null);salvar.onclick=()=>{if(!select.value)return alert('Escolha uma vendedora.');fim(select.value)};
    acoes.append(cancelar,salvar);caixa.append(h,busca,select,acoes);fundo.append(caixa);document.body.append(fundo);
  });
}
async function gerarCotacoesFrete(){
  if(!await garantirVendedoraFrete(dadosFormularioFrete()))return;
  if(typeof validarCoberturaSelecionada==='function' && !validarCoberturaSelecionada()) return;
  const dados = dadosFormularioFrete();

  if(!dados.cliente_nome || !dados.cep_destino || !dados.valor_nf){
    alert("Informe pelo menos cliente, CEP e valor da NF.");
    return;
  }

  if(!dados.transportadoras_ids.length){
    alert("Selecione pelo menos uma transportadora.");
    return;
  }

  const tipos = tiposRespostaFrete(dados.tipo_frete);
  const chavesValidas = dados.transportadoras_ids.flatMap(id =>
    tipos.map(tipo => chaveRespostaFrete(id, tipo))
  );

  freteRespostasAtuais = freteRespostasAtuais.filter(r =>
    chavesValidas.includes(chaveRespostaFrete(r.transportadora_id, r.tipo_frete || "CIF"))
  );

  const box = freteCampo("fretePreviews");
  box.innerHTML = dados.transportadoras_ids.flatMap(id => {
    const transportadora = freteTransportadoras.find(
      t => String(t.id) === String(id)
    );

    return tipos.map(tipoResposta => {
      const chave = chaveRespostaFrete(id, tipoResposta);
      const texto = aplicarModeloFrete(
        transportadora?.frete_modelos?.texto_modelo || "",
        dados,
        tipoResposta
      );

      const existente = respostaAtualFrete(id, tipoResposta) || {};
      const gnrePadrao = Number(existente.gnre_valor || dados.gnre_valor || 0);

      return `<div class="frete-preview-card" id="freteCard_${chave}">
        <h3>
          <span>${escaparHtmlEmail(transportadora?.nome || "")} — ${tipoResposta}</span>
          <span style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;">
            ${/rodonaves/i.test(transportadora?.nome||"") && tipoResposta==="CIF"
              ? `<button class="btn roxo" id="btnRodonaves_${chave}"
                   onclick="cotarAutomaticamenteRodonaves('${id}','${tipoResposta}')">
                   ⚡ Cotar automaticamente CIF
                 </button>` : ""}
            ${/rodonaves/i.test(transportadora?.nome||"") && tipoResposta==="FOB"
              ? `<span class="frete-aviso-fob">FOB Rodonaves: manual por WhatsApp ou telefone</span>` : ""}
            ${/(^|\s)alfa(\s|$)|alfa transportes/i.test(transportadora?.nome||"") ? `<span class="frete-cobertura-badge nao_confirmado">API Alfa desativada</span>` : ""}
            ${/(accert|tg\s+transportes|tgtransportes)/i.test(transportadora?.nome||"")
              ? `<button class="btn roxo" id="btnSSW_${chave}" onclick="cotarAutomaticamenteSSW('${id}','${tipoResposta}')">⚡ Cotar SSW automaticamente</button>` : ""}
            ${/braspress/i.test(transportadora?.nome||"")
              ? `<button class="btn roxo" id="btnBraspress_${chave}" onclick="cotarAutomaticamenteBraspress('${id}','${tipoResposta}')">🚚 Cotar Braspress automaticamente</button>` : ""}
            ${/(correios|coreios)/i.test(transportadora?.nome||"")
              ? `<button class="btn roxo" id="btnCorreios_${chave}" onclick="cotarAutomaticamenteCorreios('${id}','${tipoResposta}')">📮 Cotar Correios automaticamente</button>` : ""}
            <button class="btn azul" onclick="copiarTextoFrete('${chave}')">Copiar solicitação</button>
            <button class="btn verde" onclick="abrirWhatsAppTransportadoraFrete('${id}','${tipoResposta}')">📱 Enviar WhatsApp</button>
          </span>
        </h3>

        <div class="frete-texto" id="freteTexto_${chave}">${escaparHtmlEmail(texto)}</div>

        <div class="frete-resposta-grid">
          <div>
            <label class="relatorio-label">Nº/Referência</label>
            <input id="freteRespNumero_${chave}" value="${escaparHtmlEmail(existente.numero_cotacao || "")}">
          </div>
          <div>
            <label class="relatorio-label">Frete (${tipoResposta})</label>
            <input id="freteRespValor_${chave}" inputmode="decimal"
              value="${existente.valor_frete ? Number(existente.valor_frete).toLocaleString("pt-BR",{minimumFractionDigits:2}) : ""}">
          </div>
          <div>
            <label class="relatorio-label">Prazo</label>
            <input id="freteRespPrazo_${chave}" value="${escaparHtmlEmail(existente.prazo || "")}"
              placeholder="03 dias úteis">
          </div>
          <div>
            <label class="relatorio-label">GNRE</label>
            <input id="freteRespGnre_${chave}" inputmode="decimal"
              value="${gnrePadrao ? gnrePadrao.toLocaleString("pt-BR",{minimumFractionDigits:2}) : ""}">
          </div>
          <button class="btn verde" onclick="registrarRespostaFrete('${id}','${tipoResposta}')">Registrar</button>
          <button class="btn azul" onclick="registrarNegociacaoFrete('${id}','${tipoResposta}')">
            💬 Registrar negociação
          </button>
        </div>

        ${/(correios|coreios)/i.test(transportadora?.nome||"") ? `<div id="freteOpcoesCorreios_${chave}"></div>` : ""}

        <div class="email-acoes">
          <button class="btn roxo" onclick="autorizarRespostaFrete('${id}','${tipoResposta}')">✅ Marcar autorizada</button>
          <span class="frete-status ${existente.status || "aguardando"}">
            ${existente.status === "autorizada" ? "AUTORIZADA" : existente.status === "negociada" ? "NEGOCIADA" : "AGUARDANDO"}
          </span>
        </div>
      </div>`;
    });
  }).join("");

  atualizarMensagemVendedoraFrete();
  destacarMenorFrete();
}

function coletarRespostaTela(id, tipoFrete){
  const transportadora = freteTransportadoras.find(
    t => String(t.id) === String(id)
  );
  const chave = chaveRespostaFrete(id, tipoFrete);
  const gnreGeral = numeroFrete(freteValor("freteGnreValor"));

  return {
    transportadora_id: id,
    transportadora_nome: transportadora?.nome || "",
    tipo_frete: tipoFrete,
    numero_cotacao: freteValor("freteRespNumero_" + chave),
    valor_frete: numeroFrete(freteValor("freteRespValor_" + chave)),
    prazo: freteValor("freteRespPrazo_" + chave),
    gnre_valor: numeroFrete(freteValor("freteRespGnre_" + chave)) || gnreGeral,
    status: respostaAtualFrete(id, tipoFrete)?.status || "aguardando"
  };
}


function respostaBancoFrete(id,tipoFrete){
  const cotacaoId=freteValor("freteCotacaoId");
  if(!cotacaoId)return null;
  const cotacao=freteAndamento.find(c=>String(c.id)===String(cotacaoId)) ||
                freteHistorico.find(c=>String(c.id)===String(cotacaoId));
  return (cotacao?.frete_cotacao_respostas||[]).find(r=>
    String(r.transportadora_id)===String(id) &&
    String(r.tipo_frete||"CIF")===String(tipoFrete)
  )||null;
}

async function registrarNegociacaoFrete(id,tipoFrete){
  const cotacaoId=freteValor("freteCotacaoId");
  if(!cotacaoId){
    const salva=await salvarCotacaoFrete("rascunho");
    if(!salva)return;
  }

  const respostaAtual=coletarRespostaTela(id,tipoFrete);
  const anterior=respostaBancoFrete(id,tipoFrete);
  const transportadora=freteTransportadoras.find(t=>String(t.id)===String(id));

  if(!respostaAtual.numero_cotacao){
    alert("Informe o novo número/protocolo da cotação negociada.");
    return;
  }
  if(!respostaAtual.valor_frete){
    alert("Informe o valor negociado.");
    return;
  }

  const motivo=prompt(
    "Informe o motivo ou observação da negociação:",
    "Valor, protocolo ou prazo negociado diretamente com a transportadora"
  );
  if(motivo===null)return;

  const confirmar=confirm(
    `Confirmar negociação com ${transportadora?.nome||"transportadora"}?\n\n`+
    `Protocolo anterior: ${anterior?.numero_cotacao||"—"}\n`+
    `Novo protocolo: ${respostaAtual.numero_cotacao||"—"}\n\n`+
    `Valor anterior: ${moedaFrete(anterior?.valor_frete||0)}\n`+
    `Novo valor: ${moedaFrete(respostaAtual.valor_frete||0)}\n\n`+
    `Quando houver coleta vinculada, será utilizado o novo protocolo salvo.`
  );
  if(!confirmar)return;

  const idCotacao=freteValor("freteCotacaoId");
  const agora=new Date().toISOString();

  const historico=await banco.from("frete_cotacao_negociacoes").insert([{
    cotacao_id:idCotacao,
    transportadora_id:id,
    tipo_frete:tipoFrete,
    resposta_id:anterior?.id||null,
    protocolo_anterior:anterior?.numero_cotacao||null,
    protocolo_novo:respostaAtual.numero_cotacao||null,
    valor_anterior:Number(anterior?.valor_frete||0),
    valor_novo:Number(respostaAtual.valor_frete||0),
    prazo_anterior:anterior?.prazo||null,
    prazo_novo:respostaAtual.prazo||null,
    motivo:String(motivo||"").trim()||null,
    alterado_por:usuarioLogado?.login||"sistema",
    created_at:agora
  }]);

  if(historico.error){
    alert("Não foi possível registrar o histórico da negociação:\n"+historico.error.message);
    return;
  }

  const upsert=await banco.from("frete_cotacao_respostas").upsert({
    cotacao_id:idCotacao,
    transportadora_id:id,
    tipo_frete:tipoFrete,
    numero_cotacao:respostaAtual.numero_cotacao,
    valor_frete:respostaAtual.valor_frete,
    prazo:respostaAtual.prazo,
    gnre_valor:respostaAtual.gnre_valor,
    status:"negociada",
    negociada:true,
    negociado_em:agora,
    negociado_por:usuarioLogado?.login||"sistema",
    atualizado_em:agora
  },{onConflict:"cotacao_id,transportadora_id,tipo_frete"});

  if(upsert.error){
    alert("A negociação foi registrada, mas não foi possível atualizar a resposta:\n"+upsert.error.message);
    return;
  }

  const idx=freteRespostasAtuais.findIndex(r=>
    String(r.transportadora_id)===String(id) &&
    String(r.tipo_frete||"CIF")===String(tipoFrete)
  );
  const atualizada={...respostaAtual,status:"negociada",negociada:true};
  if(idx>=0)freteRespostasAtuais[idx]={...freteRespostasAtuais[idx],...atualizada};
  else freteRespostasAtuais.push(atualizada);

  atualizarMensagemVendedoraFrete();
  gerarCotacoesFrete();
  mostrarBalaoSistema("Negociação registrada",`${respostaAtual.numero_cotacao} • ${moedaFrete(respostaAtual.valor_frete)}`);
  await carregarCotacoesAndamento();
}

async function registrarRespostaFrete(id, tipoFrete){
  const respostaTela = coletarRespostaTela(id, tipoFrete);
  const indice = freteRespostasAtuais.findIndex(
    r => String(r.transportadora_id) === String(id) &&
         String(r.tipo_frete || "CIF") === String(tipoFrete)
  );

  if(indice >= 0){
    freteRespostasAtuais[indice] = {
      ...freteRespostasAtuais[indice],
      ...respostaTela
    };
  }else{
    freteRespostasAtuais.push(respostaTela);
  }

  atualizarMensagemVendedoraFrete();
  destacarMenorFrete();

  const cotacaoId = freteValor("freteCotacaoId");
  if(!cotacaoId) return;

  const resposta = await banco
    .from("frete_cotacao_respostas")
    .upsert({
      cotacao_id: cotacaoId,
      transportadora_id: id,
      tipo_frete: tipoFrete,
      numero_cotacao: respostaTela.numero_cotacao,
      valor_frete: respostaTela.valor_frete,
      prazo: respostaTela.prazo,
      gnre_valor: respostaTela.gnre_valor,
      status: respostaTela.status,
      atualizado_em: new Date().toISOString()
    }, { onConflict:"cotacao_id,transportadora_id,tipo_frete" });

  if(resposta.error){
    alert(resposta.error.message);
  }else{
    const cotacaoAtual=freteAndamento.find(c=>String(c.id)===String(cotacaoId)) ||
                       freteHistorico.find(c=>String(c.id)===String(cotacaoId));
    const respostasAtualizadas=(cotacaoAtual?.frete_cotacao_respostas || []).filter(
      r=>!(String(r.transportadora_id)===String(id) &&
           String(r.tipo_frete || "CIF")===String(tipoFrete))
    );
    respostasAtualizadas.push(respostaTela);
    const novoStatus=calcularStatusCotacaoFrete({
      ...cotacaoAtual,
      frete_cotacao_respostas:respostasAtualizadas
    });
    await banco.from("frete_cotacoes").update({
      status:novoStatus,
      atualizado_em:new Date().toISOString()
    }).eq("id",cotacaoId);

    mostrarBalaoSistema("Resposta registrada", respostaTela.transportadora_nome);
    carregarCotacoesAndamento();
  }
}

function destacarMenorFrete(){
  document.querySelectorAll(".frete-preview-card").forEach(
    card => card.classList.remove("frete-melhor")
  );

  const validas = freteRespostasAtuais.filter(r => Number(r.valor_frete) > 0);
  if(!validas.length) return;

  const menor = validas.reduce(
    (a,b) => Number(a.valor_frete) <= Number(b.valor_frete) ? a : b
  );

  freteCampo("freteCard_" + chaveRespostaFrete(menor.transportadora_id, menor.tipo_frete || "CIF"))?.classList.add("frete-melhor");
}


function calcularStatusCotacaoFrete(cotacao){
  const respostas=cotacao?.frete_cotacao_respostas || [];
  const totalEsperado=Number(cotacao?.total_solicitacoes || respostas.length || 0);
  const respondidas=respostas.filter(r =>
    r.numero_cotacao || Number(r.valor_frete)>0 || r.prazo
  ).length;

  if(cotacao?.status==="autorizada" || cotacao?.status==="cancelada") return cotacao.status;
  if(cotacao?.status==="aguardando_autorizacao") return "aguardando_autorizacao";
  if(respondidas===0) return cotacao?.status==="rascunho" ? "rascunho" : "aguardando_retorno";
  if(totalEsperado>0 && respondidas<totalEsperado) return "retorno_parcial";
  return "pronta_vendedora";
}

function statusFreteLabel(status){
  const mapa={
    rascunho:"Rascunho",
    solicitacao_enviada:"Solicitação enviada",
    aguardando_retorno:"Aguardando retorno",
    retorno_parcial:"Retorno parcial",
    pronta_vendedora:"Pronta para vendedora",
    aguardando_autorizacao:"Aguardando autorização",
    autorizada:"Autorizada",
    cancelada:"Cancelada"
  };
  return mapa[status] || status || "Aguardando";
}

function prioridadeFreteLabel(prioridade){
  return prioridade==="muito_urgente" ? "Muito urgente" :
         prioridade==="urgente" ? "Urgente" : "Normal";
}

function minutosDesdeFrete(data){
  if(!data) return 0;
  return Math.max(0,Math.floor((Date.now()-new Date(data).getTime())/60000));
}

function tempoEsperaFrete(data){
  const minutos=minutosDesdeFrete(data);
  if(minutos<60) return `${minutos} min`;
  const horas=Math.floor(minutos/60);
  const resto=minutos%60;
  if(horas<24) return `${horas}h ${resto}min`;
  return `${Math.floor(horas/24)}d ${horas%24}h`;
}

function classeTempoFrete(data){
  const minutos=minutosDesdeFrete(data);
  if(minutos>=1440) return "vermelho";
  if(minutos>=120) return "laranja";
  if(minutos>=30) return "amarelo";
  return "";
}

async function salvarEAguardarFrete(){
  const salvo=await salvarCotacaoFrete("aguardando_retorno");
  if(!salvo) return;

  mostrarBalaoSistema(
    "Cotação guardada",
    "Ela foi enviada para Cotações em andamento. Você já pode começar outra."
  );

  limparCotacaoFrete();
  mostrarPainelFrete("andamento");
}

async function marcarSolicitacaoEnviadaFrete(){
  const salvo=await salvarCotacaoFrete("solicitacao_enviada");
  if(!salvo) return;
  mostrarBalaoSistema("Solicitação registrada","A cotação ficará aguardando retorno.");
}

async function definirStatusCotacaoFrete(id,status){
  const resposta=await banco
    .from("frete_cotacoes")
    .update({status,atualizado_em:new Date().toISOString()})
    .eq("id",id);

  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  await carregarCotacoesAndamento();
  await carregarHistoricoFrete();
}

async function salvarCotacaoFrete(statusForcado = null){
  const dados = dadosFormularioFrete();

  if(!dados.cliente_nome){
    alert("Informe o cliente.");
    return;
  }

  const decisaoCliente = await perguntarAtualizacaoClienteFrete(dados);

  if(decisaoCliente?.acao==="cancelar" || decisaoCliente?.acao==="erro"){
    return;
  }

  if(decisaoCliente?.cliente){
    dados.cliente_id = decisaoCliente.cliente.id;
  }

  if(!await garantirVendedoraFrete(dados))return;
  const cliente = clienteFretePorId(dados.cliente_id);

  const registro = {
    cliente_id: dados.cliente_id ? String(dados.cliente_id) : null,
    cliente_nome: dados.cliente_nome,
    vendedora_id: cliente?.vendedora_id ? String(cliente.vendedora_id) : null,
    numero_nf: dados.numero_nf,
    tipo_frete: dados.tipo_frete,
    cpf_cnpj_destino: dados.cpf_cnpj_destino,
    cep_destino: dados.cep_destino,
    cidade_destino: dados.cidade_destino,
    uf_destino: dados.uf_destino,
    endereco_destino: dados.endereco_destino,
    bairro_destino: dados.bairro_destino,
    valor_nf: dados.valor_nf,
    volumes: dados.volumes,
    peso_total: dados.peso_total,
    medidas: dados.medidas,
    material: dados.material,
    embalagem: dados.embalagem,
    coleta: dados.coleta,
    solicitante: dados.solicitante,
    prioridade: dados.prioridade,
    lembrete_em: dados.lembrete_minutos
      ? new Date(Date.now()+dados.lembrete_minutos*60000).toISOString()
      : null,
    total_solicitacoes: dados.transportadoras_ids.length * tiposRespostaFrete(dados.tipo_frete).length,
    gnre_modo: dados.gnre_modo,
    origem_produto: dados.origem_produto,
    gnre_estimado: dados.gnre_valor,
    status: statusForcado || (dados.id ? undefined : "rascunho"),
    criado_por: usuarioLogado.login,
    atualizado_em: new Date().toISOString()
  };

  if(registro.status===undefined) delete registro.status;

  const resposta = dados.id
    ? await banco.from("frete_cotacoes").update(registro).eq("id", dados.id).select().single()
    : await banco.from("frete_cotacoes").insert([registro]).select().single();

  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  freteCampo("freteCotacaoId").value = resposta.data.id;

  for(const item of freteRespostasAtuais){
    await banco.from("frete_cotacao_respostas").upsert({
      cotacao_id: resposta.data.id,
      transportadora_id: item.transportadora_id,
      tipo_frete: item.tipo_frete || "CIF",
      numero_cotacao: item.numero_cotacao,
      valor_frete: item.valor_frete,
      prazo: item.prazo,
      gnre_valor: item.gnre_valor,
      status: item.status || "aguardando",
      atualizado_em: new Date().toISOString()
    }, { onConflict:"cotacao_id,transportadora_id,tipo_frete" });
  }

  mostrarBalaoSistema("Cotação salva", dados.cliente_nome);
  carregarHistoricoFrete();
  atualizarDashboardFretes();
  carregarCotacoesAndamento();
  return resposta.data;
}

async function autorizarRespostaFrete(id, tipoFrete){
  const respostaTela = coletarRespostaTela(id, tipoFrete);

  if(!respostaTela.valor_frete && !confirm("Autorizar sem valor de frete?")) return;

  if(!freteValor("freteCotacaoId")){
    await salvarCotacaoFrete();
  }

  const cotacaoId = freteValor("freteCotacaoId");
  if(!cotacaoId) return;

  if(!confirm(`Confirmar ${respostaTela.transportadora_nome} como transportadora autorizada?`)){
    return;
  }

  await banco
    .from("frete_cotacao_respostas")
    .update({ status:"nao_autorizada", autorizada:false })
    .eq("cotacao_id", cotacaoId);

  const resposta = await banco
    .from("frete_cotacao_respostas")
    .upsert({
      cotacao_id: cotacaoId,
      transportadora_id: id,
      tipo_frete: tipoFrete,
      numero_cotacao: respostaTela.numero_cotacao,
      valor_frete: respostaTela.valor_frete,
      prazo: respostaTela.prazo,
      gnre_valor: respostaTela.gnre_valor,
      protocolo_usado_coleta: respostaTela.numero_cotacao,
      valor_usado_coleta: respostaTela.valor_frete,
      status: "autorizada",
      autorizada: true,
      autorizado_em: new Date().toISOString(),
      autorizado_por: usuarioLogado.login
    }, { onConflict:"cotacao_id,transportadora_id,tipo_frete" });

  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  await banco
    .from("frete_cotacoes")
    .update({
      transportadora_autorizada_id: id,
      status: "autorizada",
      autorizado_em: new Date().toISOString(),
      autorizado_por: usuarioLogado.login,
      atualizado_em: new Date().toISOString()
    })
    .eq("id", cotacaoId);

  freteRespostasAtuais = freteRespostasAtuais.map(item => ({
    ...item,
    status: String(item.transportadora_id) === String(id) &&
            String(item.tipo_frete || "CIF") === String(tipoFrete)
      ? "autorizada"
      : "nao_autorizada"
  }));

  gerarCotacoesFrete();
  carregarHistoricoFrete();
  atualizarDashboardFretes();
  mostrarBalaoSistema("Transportadora autorizada", respostaTela.transportadora_nome);

  // A autorização sempre utiliza o protocolo, valor e prazo atualmente salvos.
  // Quando a transportadora possuir integração de coleta, os dados negociados
  // seguem para o módulo de coleta. Para fluxos manuais, ficam registrados no histórico.
  if(typeof tratarColetaAposAutorizacao==="function"){
    const [cotacaoDb,respostaDb]=await Promise.all([
      banco.from("frete_cotacoes").select("*").eq("id",cotacaoId).single(),
      banco.from("frete_cotacao_respostas")
        .select("*")
        .eq("cotacao_id",cotacaoId)
        .eq("transportadora_id",id)
        .eq("tipo_frete",tipoFrete)
        .single()
    ]);

    const transportadora=freteTransportadoras.find(t=>String(t.id)===String(id));
    if(!cotacaoDb.error){
      await tratarColetaAposAutorizacao(
        cotacaoDb.data,
        respostaDb.data||{...respostaTela,transportadora_id:id,tipo_frete:tipoFrete},
        transportadora
      );
    }
  }
}

function limparCotacaoFrete(){
  [
    "freteCotacaoId","freteClienteNome","freteCpfCnpj","freteCep",
    "freteCidade","freteUf","freteEndereco","freteBairro",
    "freteNumeroNf","freteValorNf","fretePeso","freteGnreValor"
  ].forEach(id => {
    const el = freteCampo(id);
    if(el) el.value = "";
  });

  if(freteCampo("freteCliente")) freteCampo("freteCliente").value="";
  if(freteCampo("freteClienteBusca")) freteCampo("freteClienteBusca").value="";
  if(freteCampo("freteClienteResultados")){
    freteCampo("freteClienteResultados").innerHTML="";
    freteCampo("freteClienteResultados").style.display="none";
  }
  if(freteCampo("freteVolumes")) freteCampo("freteVolumes").value = "1";
  if(freteCampo("fretePrioridade")) freteCampo("fretePrioridade").value = "normal";
  if(freteCampo("freteLembreteMinutos")) freteCampo("freteLembreteMinutos").value = "";

  freteRespostasAtuais = [];
  freteCampo("fretePreviews").innerHTML =
    '<div class="texto-vazio">Selecione as transportadoras e clique em “Gerar modelos”.</div>';

  atualizarMensagemVendedoraFrete();
}


async function carregarCotacoesAndamento(){
  const resposta=await banco
    .from("frete_cotacoes")
    .select("*,frete_transportadoras!frete_cotacoes_transportadora_autorizada_id_fkey(nome),frete_cotacao_respostas(*,frete_transportadoras(nome))")
    .not("status","in",'("autorizada","cancelada")')
    .order("prioridade",{ascending:false})
    .order("atualizado_em",{ascending:true});

  if(resposta.error){
    console.warn("Cotações em andamento:",resposta.error.message);
    return;
  }

  freteAndamento=(resposta.data || []).map(c=>({
    ...c,
    status:calcularStatusCotacaoFrete(c)
  }));

  const badge=document.getElementById("freteBadgeAndamento");
  if(badge) badge.textContent=freteAndamento.length;

  montarCotacoesAndamento();
  atualizarKpisAndamentoFrete();
  iniciarAtualizacaoTempoFrete();
  verificarLembretesFrete();
}

function montarCotacoesAndamento(){
  const box=document.getElementById("freteListaAndamento");
  if(!box) return;

  const busca=normalizarNomeEmail(freteValor("freteBuscaAndamento"));
  const filtroStatus=freteValor("freteFiltroStatus");
  const filtroPrioridade=freteValor("freteFiltroPrioridade");

  const lista=freteAndamento.filter(c=>{
    const transportadoras=(c.frete_cotacao_respostas || [])
      .map(r=>r.frete_transportadoras?.nome || "")
      .join(" ");

    const texto=normalizarNomeEmail(
      `${c.cliente_nome} ${c.numero_nf || ""} ${transportadoras}`
    );

    return (!busca || texto.includes(busca)) &&
           (!filtroStatus || c.status===filtroStatus) &&
           (!filtroPrioridade || c.prioridade===filtroPrioridade);
  });

  box.innerHTML=lista.length ? lista.map(c=>{
    const respostas=c.frete_cotacao_respostas || [];
    const total=Number(c.total_solicitacoes || respostas.length || 0);
    const respondidas=respostas.filter(r=>r.numero_cotacao || Number(r.valor_frete)>0 || r.prazo).length;
    const percentual=total ? Math.min(100,Math.round(respondidas/total*100)) : 0;
    const esperaBase=c.atualizado_em || c.created_at;

    return `<div class="frete-andamento-card prioridade-${c.prioridade || "normal"}">
      <div>
        <div class="frete-andamento-topo">
          <h3>Cotação ${String(c.numero || "").padStart(2,"0")} — ${escaparHtmlEmail(c.cliente_nome)}</h3>
          <span class="frete-chip ${c.status}">${statusFreteLabel(c.status)}</span>
          <span class="frete-chip prioridade-${c.prioridade || "normal"}">${prioridadeFreteLabel(c.prioridade)}</span>
        </div>

        <div class="frete-andamento-meta">
          <span><b>NF:</b> ${escaparHtmlEmail(c.numero_nf || "-")}</span>
          <span><b>Destino:</b> ${escaparHtmlEmail([c.cidade_destino,c.uf_destino].filter(Boolean).join("/") || "-")}</span>
          <span><b>Tipo:</b> ${c.tipo_frete}</span>
          <span><b>Respostas:</b> ${respondidas} de ${total}</span>
          <span><b>Espera:</b> <span class="frete-tempo-alerta ${classeTempoFrete(esperaBase)}">${tempoEsperaFrete(esperaBase)}</span></span>
          ${c.lembrete_em ? `<span><b>Lembrete:</b> ${new Date(c.lembrete_em).toLocaleString("pt-BR")}</span>` : ""}
        </div>

        <div class="frete-progresso">
          <div class="frete-progresso-barra"><span style="width:${percentual}%"></span></div>
          <small>${percentual}% das respostas recebidas</small>
        </div>
      </div>

      <div class="frete-andamento-acoes">
        <button class="btn azul" onclick="abrirCotacaoFrete('${c.id}')">Continuar cotação</button>
        <button class="btn verde" onclick="reenviarSolicitacoesFrete('${c.id}')">Reenviar solicitações</button>
        <button class="btn roxo" onclick="definirStatusCotacaoFrete('${c.id}','aguardando_autorizacao')">Enviada à vendedora</button>
        <button class="btn vermelho" onclick="definirStatusCotacaoFrete('${c.id}','cancelada')">Cancelar</button>
      </div>
    </div>`;
  }).join("") : '<div class="texto-vazio">Nenhuma cotação em andamento.</div>';
}

function atualizarKpisAndamentoFrete(){
  const box=document.getElementById("freteAndamentoKpis");
  if(!box) return;

  const contar=status=>freteAndamento.filter(c=>c.status===status).length;
  box.innerHTML=`
    <div class="frete-kpi"><span>Em andamento</span><b>${freteAndamento.length}</b></div>
    <div class="frete-kpi"><span>Aguardando retorno</span><b>${contar("aguardando_retorno")}</b></div>
    <div class="frete-kpi"><span>Retorno parcial</span><b>${contar("retorno_parcial")}</b></div>
    <div class="frete-kpi"><span>Aguardando vendedora</span><b>${contar("aguardando_autorizacao")}</b></div>
  `;
}

function iniciarAtualizacaoTempoFrete(){
  if(freteTimerAndamento) clearInterval(freteTimerAndamento);
  freteTimerAndamento=setInterval(()=>{
    if(document.getElementById("fretePainelAndamento")?.classList.contains("ativo")){
      montarCotacoesAndamento();
    }
    verificarLembretesFrete();
  },60000);
}

function verificarLembretesFrete(){
  const agora=Date.now();
  freteAndamento.forEach(c=>{
    if(!c.lembrete_em || c.lembrete_disparado) return;
    if(new Date(c.lembrete_em).getTime()>agora) return;

    const chave=`frete_lembrete_${c.id}_${c.lembrete_em}`;
    if(localStorage.getItem(chave)) return;
    localStorage.setItem(chave,"1");

    if(typeof notificarChrome==="function"){
      notificarChrome(
        "Cotação pendente",
        `${c.cliente_nome} ainda está aguardando retorno.`
      );
    }
    if(typeof mostrarBalaoSistema==="function"){
      mostrarBalaoSistema("Cotação pendente",c.cliente_nome);
    }
  });
}

async function reenviarSolicitacoesFrete(id){
  await abrirCotacaoFrete(id);
  mostrarPainelFrete("nova");
  setTimeout(()=>{
    const primeiro=document.querySelector("#fretePreviews .frete-preview-card");
    primeiro?.scrollIntoView({behavior:"smooth",block:"start"});
  },200);
}

async function carregarHistoricoFrete(){
  const resposta = await banco
    .from("frete_cotacoes")
    .select("*,frete_transportadoras!frete_cotacoes_transportadora_autorizada_id_fkey(nome),frete_cotacao_respostas(*,frete_transportadoras(nome))")
    .order("created_at", { ascending:false });

  if(resposta.error){
    console.warn("Histórico de fretes:", resposta.error.message);
    return;
  }

  freteHistorico = resposta.data || [];
  montarHistoricoFrete();
  atualizarDashboardFretes();
}

function montarHistoricoFrete(){
  const tbody = freteCampo("freteTabelaHistorico");
  if(!tbody) return;

  const busca = normalizarNomeEmail(freteValor("freteBuscaHistorico"));

  const lista = freteHistorico.filter(cotacao => {
    const texto = normalizarNomeEmail(
      `${cotacao.cliente_nome} ${cotacao.numero_nf || ""} ${cotacao.frete_transportadoras?.nome || ""}`
    );
    return !busca || texto.includes(busca);
  });

  tbody.innerHTML = lista.length
    ? lista.map(cotacao => {
        const cliente = clienteFretePorId(cotacao.cliente_id);
        const vendedora = (emailVendedoras || []).find(
          v => String(v.id) === String(cotacao.vendedora_id || cliente?.vendedora_id)
        );

        return `<tr>
          <td>${String(cotacao.numero || "").padStart(2,"0")}</td>
          <td>${new Date(cotacao.created_at).toLocaleString("pt-BR")}</td>
          <td>${escaparHtmlEmail(cotacao.cliente_nome)}</td>
          <td>${escaparHtmlEmail(cotacao.numero_nf || "")}</td>
          <td>${cotacao.tipo_frete}</td>
          <td>${escaparHtmlEmail(cotacao.frete_transportadoras?.nome || "Aguardando")}</td>
          <td>${escaparHtmlEmail(vendedora?.nome || "")}</td>
          <td>
            <button class="btn azul" onclick="abrirCotacaoFrete('${cotacao.id}')">Abrir</button>
            <button class="btn vermelho" onclick="excluirCotacaoFrete('${cotacao.id}')">Excluir</button>
          </td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="8">Nenhuma cotação localizada.</td></tr>';
}

async function abrirCotacaoFrete(id){
  const cotacao =
    freteAndamento.find(c => String(c.id) === String(id)) ||
    freteHistorico.find(c => String(c.id) === String(id));
  if(!cotacao) return;

  mostrarPainelFrete("nova");

  const set = (campo, valor) => {
    const el = freteCampo(campo);
    if(el) el.value = valor ?? "";
  };

  set("freteCotacaoId", cotacao.id);
  set("freteCliente",cotacao.cliente_id);
  set("freteClienteBusca",cotacao.cliente_nome);
  set("freteClienteNome",cotacao.cliente_nome);
  set("freteCpfCnpj", cotacao.cpf_cnpj_destino);
  set("freteCep", cotacao.cep_destino);
  set("freteCidade", cotacao.cidade_destino);
  set("freteUf", cotacao.uf_destino);
  set("freteEndereco", cotacao.endereco_destino);
  set("freteBairro", cotacao.bairro_destino);
  set("freteNumeroNf", cotacao.numero_nf);
  set("freteValorNf", Number(cotacao.valor_nf || 0).toLocaleString("pt-BR",{minimumFractionDigits:2}));
  set("freteVolumes", cotacao.volumes);
  set("fretePeso", cotacao.peso_total);
  set("freteMedidas", cotacao.medidas);
  set("freteMaterial", cotacao.material);
  set("freteEmbalagem", cotacao.embalagem);
  set("freteColeta", cotacao.coleta);
  set("freteSolicitante", cotacao.solicitante);
  set("fretePrioridade", cotacao.prioridade || "normal");
  set("freteLembreteMinutos", "");
  set("freteGnreModo", cotacao.gnre_modo);
  set("freteOrigemProduto", cotacao.origem_produto);
  set("freteGnreValor", Number(cotacao.gnre_estimado || 0).toLocaleString("pt-BR",{minimumFractionDigits:2}));

  selecionarTipoFrete(cotacao.tipo_frete);

  freteRespostasAtuais = (cotacao.frete_cotacao_respostas || []).map(r => ({
    ...r,
    tipo_frete: r.tipo_frete || cotacao.tipo_frete || "CIF",
    transportadora_nome: r.frete_transportadoras?.nome || ""
  }));

  document.querySelectorAll(".frete-trans-check").forEach(check => {
    check.checked = freteRespostasAtuais.some(
      r => String(r.transportadora_id) === String(check.value)
    );
  });

  gerarCotacoesFrete();
}

async function excluirCotacaoFrete(id){
  if(!confirm("Excluir esta cotação e todas as respostas?")) return;

  const resposta = await banco.from("frete_cotacoes").delete().eq("id", id);
  if(resposta.error) alert(resposta.error.message);
  else carregarHistoricoFrete();
}

// V95: atualiza sugestões ao alterar o destino
document.addEventListener('input',e=>{if(['freteCidade','freteUf','freteCep'].includes(e.target?.id)&&typeof atualizarSugestoesTransportadoras==='function') atualizarSugestoesTransportadoras();});
document.addEventListener('change',e=>{if(['freteCidade','freteUf','freteCep'].includes(e.target?.id)&&typeof atualizarSugestoesTransportadoras==='function') atualizarSugestoesTransportadoras();});

// V417 — teste sem emissão. A chave administrativa existente protege a operação.
async function testarGnreHomologacao(){
 const el=document.getElementById('gnreDiagnosticoResultado');if(!el)return;
 el.textContent='Verificando certificado, TLS e serviço GNRE...';
 try{
  const chave=await obterChaveIntegracoesCotacao();if(!chave){el.textContent='Teste cancelado: autorização administrativa necessária.';return;}
  const resposta=await fetch('/api/integracoes?action=gnre-diagnostico',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},body:'{}'});
  const dados=await resposta.json();
  const diagnosticoRede=dados.dns?` | DNS: ${(dados.dns.ips||[]).join(', ')||'não resolvido'}`:'';
  const diagnosticoConexao=dados.conexao?` | Rede: IP remoto=${dados.conexao.ip_remoto||'indisponível'}; TLS=${dados.conexao.protocolo||'não estabelecido'}; certificado validado=${dados.conexao.autorizado===true?'sim':'não'}`:'';
  const certificadoServidor=dados.cert_servidor?` | HTTPS do servidor: CN=${dados.cert_servidor.subject_cn||'indisponível'}; SAN=${dados.cert_servidor.subject_alt_name||'indisponível'}; emissor=${dados.cert_servidor.issuer_cn||'indisponível'}; validade=${dados.cert_servidor.valido_ate||'indisponível'}`:'';
  const linhas=(dados.etapas||[]).map(x=>`${x.ok?'✓':'✗'} ${x.etapa}: ${x.descricao||x.codigo|| (x.http_status?'HTTP '+x.http_status:'OK')}`).join(' | ');
  if(!resposta.ok||!dados.ok){el.textContent=`Diagnóstico GNRE — etapa: ${dados.etapa||'desconhecida'}; código: ${dados.codigo||'não informado'}; ${dados.erro||'Falha desconhecida'}. ${linhas}${diagnosticoRede}${diagnosticoConexao}${certificadoServidor}`;return;}
  el.textContent=`Conexão GNRE estabelecida! Ambiente: ${dados.ambiente}; serviço: ${dados.servico}; HTTP ${dados.http_status}; ${dados.tempo_ms} ms. ${linhas}. Nenhuma guia foi emitida.`;
 }catch(erro){el.textContent='Diagnóstico GNRE: falha ao consultar a API. '+String(erro.message||erro);}
}

// V423: gestão do A1 no servidor, com acesso administrativo.
async function gnreCertReqV423(method,body){const chave=await obterChaveIntegracoesCotacao();if(!chave)throw Error('Autorização administrativa necessária.');const r=await fetch('/api/integracoes?action=gnre-certificado',{method,headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.erro||'Falha ao configurar o certificado.');return d;}
async function salvarCertGnreV423(){const status=document.getElementById('gnreCertStatusV423'),arquivo=document.getElementById('gnreCertArquivoV423')?.files?.[0],senhaEl=document.getElementById('gnreCertSenhaV423');if(!arquivo||!senhaEl?.value){status.textContent='Selecione um arquivo PFX/P12 e informe a senha.';return;}if(!/\.(pfx|p12)$/i.test(arquivo.name)||arquivo.size>250000||arquivo.size<100){status.textContent='Selecione um PFX/P12 válido com até 250 KB.';return;}status.textContent='Validando e salvando certificado no servidor...';try{const bytes=new Uint8Array(await arquivo.arrayBuffer());let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await gnreCertReqV423('POST',{arquivoBase64:btoa(bin),senha:senhaEl.value});status.textContent=result.mensagem;}catch(e){status.textContent='Erro: '+e.message;}finally{senhaEl.value='';document.getElementById('gnreCertArquivoV423').value='';}}
async function statusCertGnreV423(){const el=document.getElementById('gnreCertStatusV423');try{const d=await gnreCertReqV423('GET');el.textContent=d.cadastrado?'Certificado cifrado cadastrado no portal. Atualizado em: '+new Date(d.atualizado_em).toLocaleString('pt-BR'):'Sem certificado cadastrado no portal; diagnóstico usará configuração da Vercel, se existir.';}catch(e){el.textContent=e.message;}}
async function excluirCertGnreV423(){if(!confirm('Remover o certificado GNRE cadastrado no portal?'))return;const el=document.getElementById('gnreCertStatusV423');try{await gnreCertReqV423('DELETE');el.textContent='Certificado do portal removido.';}catch(e){el.textContent=e.message;}}

async function consultarContratoGnreMg100129(){
 const el=document.getElementById('gnreConfigufContratoResultado');if(!el)return;
 el.textContent='Consultando contrato oficial GnreConfigUF em homologação com o A1 cadastrado...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Consulta cancelada: autorização administrativa necessária.';return;}
  const resposta=await fetch('/api/integracoes?action=gnre-configuf-contrato',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},body:'{}'});
  const dados=await resposta.json();
  if(!resposta.ok||!dados.ok){el.textContent='Contrato ConfigUF não reconhecido: HTTP '+(dados.http_status||resposta.status)+'; raiz: '+(dados.elemento_raiz||'não identificada')+'; tamanho: '+(dados.tamanho_resposta??'indisponível')+' bytes; '+(dados.erro||'Verificar formato WSDL')+'. Nenhuma guia foi emitida.';return;}
  el.textContent='WSDL oficial consultado. HTTP '+dados.http_status+'; raiz: '+(dados.elemento_raiz||'não identificada')+'; bytes: '+dados.tamanho_resposta+'; operações: '+(dados.operacoes||[]).join(', ')+'; mensagens: '+(dados.mensagens||[]).join(', ')+'. Esta etapa verifica o contrato; ainda NÃO consulta os parâmetros da receita MG 100129. Nenhuma guia foi emitida.';
 }catch(e){el.textContent='Falha de rede ao consultar contrato ConfigUF: '+String(e.message||e);}
}

async function consultarReceitaGnreMg100102(){return consultarReceitaGnreMg100129('100102');}
async function consultarReceitaGnreMg100129(receitaSolicitada='100129'){
  const receita=receitaSolicitada==='100102'?'100102':'100129';
 const el=document.getElementById(receita==='100102'?'gnreConfigufDifalResultado':'gnreConfigufReceitaResultado');if(!el)return;
 el.textContent='Consultando receita '+receita+' de MG no GnreConfigUF (homologação)...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Autorização administrativa necessária.';return;}
  const resposta=await fetch('/api/integracoes?action=gnre-configuf-consulta',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},body:JSON.stringify({receita})});
  const d=await resposta.json();
  const ufDiagnostico=d.diagnostico_sem_receita;
  const statusReceita='Receita MG '+receita+': '+(d.ok?'APROVADA':'NÃO aprovada')
    +' | HTTP '+(d.http_status||resposta.status)
    +' | código '+(d.codigo_situacao||'não informado')
    +' | '+(d.descricao_situacao||d.fault||d.erro||'sem descrição');
  const statusUf=ufDiagnostico
    ?'Controle MG sem receita: '+(ufDiagnostico.ok?'APROVADO':'NÃO aprovado')
       +' | HTTP '+(ufDiagnostico.http_status||'não informado')
       +' | código '+(ufDiagnostico.codigo_situacao||ufDiagnostico.codigo||'não informado')
       +' | '+(ufDiagnostico.descricao_situacao||ufDiagnostico.fault||ufDiagnostico.erro||'sem descrição')
    :'Controle MG sem receita: não necessário para este tipo de retorno.';
  const endereco=d.endereco_efetivo_solicitacao||d.endereco_wsdl||'não identificado';
  const orientacao=d.classificacao==='codigo_199_nas_duas_consultas'
    ?'Código 199 nas duas consultas: rejeição comum de comunicação, não limitada à receita selecionada. O certificado A1 e o WSDL responderam, mas isso não comprova habilitação fiscal. Verifique na Automação GNRE de HOMOLOGAÇÃO o endereço oficial, a autorização do CNPJ do e-CNPJ e a situação do serviço. A rejeição 102 é a indicação específica de CNPJ não habilitado.'
    :(d.codigo_situacao==='199'
      ?'Código 199: comunicação rejeitada pela aplicação apesar de HTTP 200. Confira endereço do WebService e habilitação do e-CNPJ em homologação. Não confundir com a rejeição 102.'
      :(d.classificacao==='falha_especifica_da_receita_ou_configuracao'
        ?'A consulta geral da UF funciona, mas a receita específica foi rejeitada.'
        :'Resultado de aplicação pendente de verificação.'));
  el.textContent=statusReceita+'\n'+statusUf
    +'\nEndereço SOAP utilizado: '+endereco
    +'\nAção SOAP: '+(d.acao_soap||'não informada')
    +'\nDiagnóstico: '+(d.classificacao||'indisponível')
    +'\n'+orientacao
    +'\nNenhuma guia foi transmitida.';
  if(d.codigo_situacao==='199'){
    const aviso=document.createElement('div');
    aviso.style.marginTop='8px';
    const link=document.createElement('a');
    link.href='https://www.testegnre.pe.gov.br:444/gnre/portal/automacao.jsp';
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.textContent='Abrir Automação GNRE — homologação (conferir habilitação e endereço)';
    aviso.appendChild(link);
    el.appendChild(aviso);
  }
  if(d.xml_configuracao){const b=document.createElement('button');b.type='button';b.className='buscar';b.textContent='Baixar retorno XML ConfigUF';b.onclick=()=>{const blob=new Blob([d.xml_configuracao],{type:'application/xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gnre-configuf-mg-'+receita+'-homologacao.xml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};el.appendChild(document.createElement('br'));el.appendChild(b);}
 }catch(e){el.textContent='Falha na consulta ConfigUF: '+String(e.message||e);}
}



// Pré-envio seguro: leitura local da NF-e e validação administrativa sem transmitir.
let gnrePreenvioNfeLida=null;
let gnrePreenvioLoteAprovado=null;
function coletarFiscalGnreMg(){
 const val=id=>String(document.getElementById(id)?.value||'').trim();
 const check=id=>Boolean(document.getElementById(id)?.checked);
 return {vencimento:val('gnrePreenvioVencimento'),pagamento:val('gnrePreenvioPagamento'),
  convenio:val('gnrePreenvioConvenio'),vencimentoConfirmado:check('gnrePreenvioConfirmaVencimento'),
  convenioConfirmado:check('gnrePreenvioConfirmaConvenio'),
  obrigacaoConfirmada:check('gnrePreenvioConfirmaObrigacao')};
}
// Diagnostico local da NF-e importada; NAO significa tributo devido.
// O piloto MG/100102 nao pode ser aplicado automaticamente a outras UFs.
function diagnosticarNfeGnreMg100102(nfe){
 const pendencias=[];
 if(!nfe)return ['Importe primeiro um XML de NF-e autorizado.'];
 if(nfe.ufOrigem!=='GO'||nfe.ufDestino!=='MG')
  pendencias.push('Esta rotina está homologada apenas para GO → MG. Destino detectado: '+(nfe.ufDestino||'não informado')+'. Configure a UF e receita correspondentes antes de emitir.');
 if(nfe.consumidorFinal!=='1')
  pendencias.push('A NF-e não está identificada como operação com consumidor final (indFinal diferente de 1).');
 if(nfe.indIeDest!=='9')
  pendencias.push('O destinatário não está classificado como não contribuinte (indIEDest diferente de 9).');
 const valor=String(nfe.valorDifal||'');
 if(!/^(?:0|[1-9]\d{0,10})\.\d{2}$/.test(valor)||Number(valor)<=0)
  pendencias.push('DIFAL de destino (vICMSUFDest) não foi encontrado com valor positivo no total da NF-e; não é seguro calcular ou emitir guia automaticamente.');
 return pendencias;
}

async function carregarNfePreenvioGnreMg(input){
 const saida=document.getElementById('gnrePreenvioNfeResumo');
 if(!saida)return;
 gnrePreenvioNfeLida=null;
 gnrePreenvioLoteAprovado=null;
 for(const id of ['gnrePreenvioResultado','gnreProducaoResultado']){
  const el=document.getElementById(id);if(el)el.textContent='';
 }
 const arquivo=input?.files?.[0];
 if(!arquivo){saida.textContent='Nenhuma NF-e carregada.';return;}
 try{
  if(!/\.xml$/i.test(arquivo.name)||arquivo.size>3*1024*1024||arquivo.size<100)
   throw Error('Selecione um XML de NF-e com até 3 MB.');
  const xml=await arquivo.text();
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Declaração XML não permitida.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('XML inválido.');
  const el=(pai,n)=>Array.from(pai?.getElementsByTagName('*')||[]).find(e=>e.localName===n)||null;
  const val=(pai,n)=>el(pai,n)?.textContent?.trim()||'';
  const inf=el(doc,'infNFe'),ide=el(inf,'ide'),emit=el(inf,'emit'),dest=el(inf,'dest');
  const end=el(emit,'enderEmit'),total=el(inf,'ICMSTot'),prot=el(doc,'infProt');
  if(!inf||!ide||!emit||!dest||!end||!total||!prot)
   throw Error('NF-e sem dados ou protocolo completos.');
  const chave=String(inf.getAttribute('Id')||'').replace(/^NFe/,'');
  const itens=Array.from(inf.getElementsByTagName('*')).filter(e=>e.localName==='det');
  const fcp=itens.reduce((sum,item)=>sum+Number(val(el(item,'ICMSUFDest'),'vFCPUFDest')||0),0).toFixed(2);
  const dados={
   chave,numero:val(ide,'nNF'),cnpjEmitente:val(emit,'CNPJ'),
   chaveProtocolo:val(prot,'chNFe'),statusAutorizacao:val(prot,'cStat'),
   ambienteNfe:val(ide,'tpAmb'),consumidorFinal:val(ide,'indFinal'),indIeDest:val(dest,'indIEDest'),
   ufOrigem:val(end,'UF'),ufDestino:val(el(dest,'enderDest'),'UF'),
   municipioEmitente:val(end,'cMun'),cepEmitente:val(end,'CEP'),
   enderecoEmitente:[val(end,'xLgr'),val(end,'nro')].filter(Boolean).join(', '),
   razaoSocialEmitente:val(emit,'xNome'),
   valorDifal:val(total,'vICMSUFDest'),valorFcp:fcp
  };
  if(!/^\d{44}$/.test(chave)||!itens.length||dados.chaveProtocolo!==chave||dados.statusAutorizacao!=='100')
   throw Error('NF-e sem chave/protocolo de autorização válido.');
  if(dados.ambienteNfe!=='1')
   throw Error('A NF-e deve estar autorizada no ambiente de produção (tpAmb=1).');
  gnrePreenvioNfeLida=dados;
  const pendencias=diagnosticarNfeGnreMg100102(dados);
  const valor=Number(dados.valorDifal);
  const difal=/^\d+(?:\.\d{2})$/.test(dados.valorDifal)&&Number.isFinite(valor)
   ?valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'não informado no XML';
  const linhas=[
   'NF-e '+(dados.numero||'sem número')+' IMPORTADA para análise | '+(dados.ufOrigem||'?')+' → '+(dados.ufDestino||'?'),
   'DIFAL no XML: '+difal+' | FCP por item: R$ '+fcp,
   'Consumidor final: '+(dados.consumidorFinal==='1'?'sim':'não identificado')+
    ' | Não contribuinte: '+(dados.indIeDest==='9'?'sim':'não identificado'),
   'Autorização NF-e: protocolo 100 confirmado.'
  ];
  if(pendencias.length){
   linhas.push('Importação concluída, porém a emissão MG/100102 NÃO está liberada:');
   linhas.push(...pendencias.map(p=>'- '+p));
   linhas.push('A NF-e pode ser analisada; nenhuma guia será gerada ou transmitida.');
  }else{
   linhas.push('NF-e compatível com a etapa MG/100102 para conferência fiscal. Nenhuma guia transmitida.');
  }
  saida.textContent=linhas.join('\n');
 }catch(e){
  gnrePreenvioNfeLida=null;
  saida.textContent='Não foi possível ler a NF-e: '+String(e.message||e);
 }
}
async function verificarPreenvioGnreMg(){
 const saida=document.getElementById('gnrePreenvioResultado');if(!saida)return;
 if(!gnrePreenvioNfeLida){saida.textContent='Importe primeiro a NF-e autorizada.';return;}
 const incompatibilidades=diagnosticarNfeGnreMg100102(gnrePreenvioNfeLida);
 if(incompatibilidades.length){
  saida.textContent='NF-e importada, mas este pré-envio MG/100102 não se aplica:\n- '+
   incompatibilidades.join('\n- ')+'\nNenhuma guia transmitida.';
  return;
 }
 saida.textContent='Conferindo pré-envio, sem transmitir...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){saida.textContent='Autorização administrativa necessária.';return;}
  const fiscal=coletarFiscalGnreMg();
  const r=await fetch('/api/integracoes?action=gnre-preenvio-mg',{method:'POST',
   headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({nfe:gnrePreenvioNfeLida,fiscal})});
  const d=await r.json();
  if(!r.ok||!d.ok){saida.textContent='Pré-envio não concluído: '+(d.erro||'verificar dados')+
   '. Nenhuma guia transmitida.';return;}
  gnrePreenvioLoteAprovado=d.apto_para_revisao&&d.plano?.lote_sha256
   ?{sha:d.plano.lote_sha256,chaveIdempotencia:d.plano.idempotency_key}:null;
  const pendencias=Array.isArray(d.pendencias)?d.pendencias:[];
  saida.textContent=(d.apto_para_revisao?'Estrutura pronta para revisão fiscal final.':'Pré-envio com pendências.')
   +'\nReceita: 100102 (DIFAL), valor: R$ '+(d.resumo?.valor_difal||'não informado')
   +'\nCertificado compatível: '+(d.certificado_verificado?'sim':'não confirmado')
   +(d.certificado_diagnostico?'\nLeitura A1: '+(d.certificado_diagnostico.modo||'não identificada')
     +' | validade: '+(d.certificado_diagnostico.validade||'não determinada')
     +' | CNPJ identificado: '+(d.certificado_diagnostico.cnpj_identificado?'sim':'não')
     +' | CNPJ corresponde à NF-e: '+(d.certificado_diagnostico.cnpj_compativel?'sim':'não')
     +' | fonte: '+(d.certificado_diagnostico.origem_identificacao||'não identificada'):'')
   +(d.reserva_existente?'\nLote já registrado: NÃO reenviar.':'')
   +(d.plano?.lote_sha256?'\nSHA-256 do lote: '+d.plano.lote_sha256:'')
   +(pendencias.length?'\nPendências:\n- '+pendencias.join('\n- '):'')
   +'\nNenhuma guia foi transmitida. Esta conferência não comprova a aceitação pela GNRE.';
 }catch(e){saida.textContent='Falha no pré-envio: '+String(e.message||e)+'. Nenhuma guia transmitida.';}
}

// Só é permitido enviar após pré-envio aprovado, autorização explícita
// e segunda confirmação do operador. Nunca realiza chamadas automaticamente.
async function transmitirGnrePilotoMg51109(){
 const el=document.getElementById('gnrePilotoResultado');if(!el)return;
 if(!gnrePreenvioLoteAprovado||!gnrePreenvioNfeLida){
  el.textContent='Primeiro execute e aprove a conferência pré-envio para NF-e 51109.';return;
 }
 if(!document.getElementById('gnrePilotoAutorizacao')?.checked){
  el.textContent='Marque a autorização expressa para uma transmissão de teste.';return;
 }
 if(!confirm('CONFIRMA UMA ÚNICA TRANSMISSÃO REAL ao WebService GNRE de HOMOLOGAÇÃO para a NF-e 51109, receita MG 100102, R$ 19,01? Não é guia para pagamento. NÃO REENVIE se houver resultado incerto.')){
  el.textContent='Transmissão cancelada. Nenhuma guia enviada.';return;
 }
 const btn=document.querySelector('button[onclick="transmitirGnrePilotoMg51109()"]');
 if(btn)btn.disabled=true;
 el.textContent='Enviando uma única tentativa de lote de homologação. Não atualize nem repita a operação...';
 try{
  const chave=await obterChaveIntegracoesCotacao();if(!chave)throw Error('Autorização administrativa necessária.');
  const r=await fetch('/api/integracoes?action=gnre-piloto-mg',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({nfe:gnrePreenvioNfeLida,fiscal:coletarFiscalGnreMg(),
    lote_sha256:gnrePreenvioLoteAprovado.sha,autorizacao_usuario:true,
    confirmacao:'TRANSMITIR_HOMOLOGACAO_51109'})
  });
  const d=await r.json();
  if(d.idempotency_key)gnrePreenvioLoteAprovado.chaveIdempotencia=d.idempotency_key;
  const estado=d.estado||'nao_confirmado';
  el.textContent=(d.ok?'Lote RECEBIDO em homologação.':'Lote NÃO confirmado como recebido.')
   +'\nEstado: '+estado
   +(d.codigo_gnre?'\nCódigo GNRE: '+d.codigo_gnre:'')
   +(d.recibo_mascarado?'\nRecibo: '+d.recibo_mascarado:'')
   +(d.arquivamento?'\nRegistro: '+d.arquivamento:'')
   +'\n'+(d.aviso||d.erro||d.motivo||'Confira a situação antes de qualquer nova tentativa.')
   +'\nNenhum resultado de recepção equivale à autorização final da guia.';
 }catch(e){
  el.textContent='Resultado indeterminado: '+String(e.message||'erro de rede')
    +'. NÃO reenviar sem verificar o estado da primeira tentativa.';
 }finally{
  document.getElementById('gnrePilotoAutorizacao').checked=false;
  if(btn)btn.disabled=false;
 }
}
async function consultarGnrePilotoMg51109(){
 const el=document.getElementById('gnrePilotoResultado');if(!el)return;
 const chaveId=gnrePreenvioLoteAprovado?.chaveIdempotencia||null;
 // A consulta do piloto também pode recuperar o recibo cifrado direto do
 // servidor, mesmo após atualizar a página. Nunca retransmite a guia.
 el.textContent='Consultando o recibo registrado na GNRE. Esta operação NÃO retransmite o lote...';
 try{
  const chave=await obterChaveIntegracoesCotacao();if(!chave)throw Error('Autorização administrativa necessária.');
  const r=await fetch('/api/integracoes?action=gnre-consulta-lote',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({...(chaveId?{idempotency_key:chaveId}:{piloto_mg_51109:true})})
  });
  const d=await r.json();
  const guias=Array.isArray(d.guias)?d.guias:[];
  const diag=d.diagnostico||{};
  const codigo402=String(d.codigo||'')==='402';
  el.textContent='Consulta de resultado GNRE: '+(d.ok?'resposta recebida':'não confirmada')
   +'\nCódigo do lote: '+(d.codigo||'não informado')
   +'\nDescrição: '+(d.descricao||d.erro||'não informada')
   +'\nSituação individual: '+(d.estado||'não identificada')
   +'\nGuias individuais identificadas: '+guias.length
   +'\nGuia individual processada: '+(d.guia_confirmada?'SIM (sujeita à conferência do documento)':'NÃO CONFIRMADA')
   +(guias.length?'\nDetalhes: '+guias.map(g=>[g.situacao,g.receita,g.uf,g.valor].join(' | ')).join('; '):'')
   +(diag.formato_resultado?'\nFormato do resultado GNRE: '+diag.formato_resultado:'')
   +(Number.isInteger(diag.resultado_bytes)?'\nTamanho dos dados de resultado: '+diag.resultado_bytes+' bytes':'')
   +(diag.pdf_guias_presente?'\nPDF coletivo consta no retorno (ainda não arquivado).':'')
   +(diag.arquivo_pagamento_presente?'\nArquivo de pagamento consta no retorno (ainda não validado).':'')
   +(codigo402&&!d.guia_confirmada?'\nATENÇÃO: lote 402 processado, mas autorização individual NÃO comprovada.':'')
   +(d.conciliacao?'\nConferência com a NF-e arquivada: '+(d.conciliacao.confirmado?'COMPATÍVEL':'AINDA NÃO CONFIRMADA')
     +(d.conciliacao.resumo?'\nDocumento NF-e: '+d.conciliacao.resumo.numero_nfe
       +' | receita: '+d.conciliacao.resumo.receita+' | UF: '+d.conciliacao.resumo.uf_favorecida
       +' | valor: R$ '+d.conciliacao.resumo.valor_principal
       +'\nNúmero oficial da guia identificado: '+(d.conciliacao.resumo.possui_numero_guia?'sim':'não')
       +' | PDF disponível: '+(d.conciliacao.resumo.possui_pdf_individual||d.conciliacao.resumo.pdf_lote_indicado?'indicado no retorno':'não localizado'):'')
     +(d.conciliacao.pendencias?.length?'\nPendências:\n- '+d.conciliacao.pendencias.join('\n- '):'')
     +'\nDocumento apenas de HOMOLOGAÇÃO — não pagar.':'')
   +'\n'+(d.aviso||'Não retransmita o lote; confirme o resultado individual com a GNRE.');
 }catch(e){el.textContent='Falha na consulta: '+String(e.message||e)+'. Não reenvie o lote.';}
}

// XML técnico retornado pela GNRE, não é guia pagável nem PDF.
async function baixarXmlRetornoGnre51109(){
 const el=document.getElementById('gnrePilotoResultado');
 if(!el)return;
 el.textContent='Recuperando XML do lote já processado em homologação (sem retransmitir)...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave)throw Error('Autorização administrativa necessária.');
  const r=await fetch('/api/integracoes?action=gnre-exportar-retorno-51109',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({piloto_mg_51109:true}),
   cache:'no-store'
  });
  if(!r.ok){
   const erro=await r.json().catch(()=>({}));
   throw Error(erro.erro||'O XML não pôde ser recuperado.');
  }
  const tipo=String(r.headers.get('content-type')||'');
  if(!tipo.includes('xml'))throw Error('O servidor não retornou XML.');
  const raw=await r.text();
  if(!raw.includes('TResultLote_GNRE')||raw.length>1024*1024)
   throw Error('Resposta não reconhecida como retorno GNRE.');
  const blob=new Blob([raw],{type:'application/xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
   const a=document.createElement('a');
   a.href=url;
   a.download='GNRE-HOMOLOGACAO-NFE-51109-RETORNO.xml';
   document.body.appendChild(a);a.click();a.remove();
  }finally{URL.revokeObjectURL(url);}
  el.textContent='XML de retorno da GNRE preparado. Documento técnico de HOMOLOGAÇÃO — NÃO utilizar para pagamento. Nenhuma guia foi retransmitida.';
 }catch(e){
  el.textContent='Download não concluído: '+String(e.message||'erro')+'. Nenhuma guia retransmitida.';
 }
}

// Solicita PDF do MESMO recibo (incluirPDFGuias=S). Sem retransmitir lote.
async function solicitarPdfHomologacaoGnre51109(){
 const el=document.getElementById('gnrePilotoResultado');if(!el)return;
 el.textContent='Consultando PDF oficial do lote já processado em HOMOLOGAÇÃO. Nenhum novo envio...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave)throw Error('Autorização administrativa necessária.');
  const r=await fetch('/api/integracoes?action=gnre-pdf-homologacao-51109',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({piloto_mg_51109:true}),cache:'no-store'
  });
  const tipo=String(r.headers.get('content-type')||'').toLowerCase();
  if(tipo.includes('application/pdf')&&r.ok){
   const blob=await r.blob();
   if(blob.size<100||blob.size>2800000)throw Error('PDF fora do tamanho esperado.');
   const url=URL.createObjectURL(blob);
   try{
    const a=document.createElement('a');a.href=url;
    a.download='GNRE-OFICIAL-HOMOLOGACAO-NFE-51109.pdf';
    document.body.appendChild(a);a.click();a.remove();
   }finally{URL.revokeObjectURL(url);}
   el.textContent='PDF original retornado pela GNRE. Este documento é SOMENTE de HOMOLOGAÇÃO — NÃO PAGAR. Nenhuma guia retransmitida.';
   return;
  }
  const d=await r.json().catch(()=>({}));
  if(r.ok&&d.pdf_disponivel===false){
   el.textContent='Guia processada com sucesso; o serviço não disponibilizou PDF mesmo com incluirPDFGuias=S.'
    +'\nMantenha o XML oficial de retorno arquivado. NÃO retransmitir.'
   return;
  }
  throw Error(d.erro||'A GNRE não retornou um PDF válido.');
 }catch(e){
  el.textContent='Não foi possível recuperar o PDF: '+String(e.message||e)+'. Não reenvie o lote.';
 }
}

// Consulta somente leitura, sem abrir emissão de guias pagáveis.
async function verificarGnrePreProducaoMg(){
 const el=document.getElementById('gnreProducaoResultado');if(!el)return;
 if(!gnrePreenvioNfeLida){
  el.textContent='Selecione primeiro um XML autorizado de NF-e NOVA. A nota 51109 foi usada na homologação.';
  return;
 }
 const incompatibilidades=diagnosticarNfeGnreMg100102(gnrePreenvioNfeLida);
 if(incompatibilidades.length){
  el.textContent='NF-e importada para análise, mas não elegível para o piloto de produção MG/100102:\n- '+
   incompatibilidades.join('\n- ')+'\nNenhuma guia foi transmitida.';
  return;
 }
 el.textContent='Conferindo dados fiscais, certificado e duplicidades, sem transmitir...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Autorização de administrador necessária.';return;}
  const r=await fetch('/api/integracoes?action=gnre-producao-preflight',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({nfe:gnrePreenvioNfeLida,fiscal:coletarFiscalGnreMg()}),
   cache:'no-store'
  });
  const d=await r.json();
  const pend=Array.isArray(d.pendencias)?d.pendencias:[];
  el.textContent=(d.apto_para_revisao?'Pré-produção pronta para revisão final.':'Pré-produção ainda com pendências.')
   +(d.resumo?'\nNF-e: '+d.resumo.numero_nfe+' | Receita: '+d.resumo.receita+' | Valor DIFAL: R$ '+d.resumo.valor_difal:'')
   +(d.plano?'\nEndpoint planejado: '+d.plano.destino+'\nHash do lote: '+d.plano.lote_sha256:'')
   +(pend.length?'\nPendências:\n- '+pend.join('\n- '):'')
   +'\nNenhuma GNRE de produção foi emitida. Habilitação e autorização por NF-e serão exigidas na etapa final.';
  if(!r.ok)el.textContent='Conferência indisponível: '+(d.erro||'erro do servidor')+'\nNenhuma guia foi transmitida.';
 }catch(e){el.textContent='Falha ao conferir: '+String(e.message||e)+'. Nenhum lote transmitido.';}
}

// Somente leitura: consulta receita 100102 no ConfigUF do Pará em homologação.
// Não gera guia, não presume que o código 0303 seja detalhamento ou convênio.
async function consultarConfigUfPa100102(){
 const el=document.getElementById('gnrePaConfigufResultado');
 if(!el)return;
 el.textContent='Consultando configuração oficial do Pará em homologação, sem transmissão...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Consulta cancelada: autorize este dispositivo com a Senha Mestre (campo oculto).';return;}
  const r=await fetch('/api/integracoes?action=gnre-pa-configuf',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:'{}',cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401){
   el.textContent='Autorização administrativa expirada ou inválida nesta Preview. Reautorize o dispositivo; nenhuma guia foi transmitida.';
   return;
  }
  if(!r.ok){el.textContent='Consulta do Pará não concluída: '+(d.erro||'erro de conexão')+'. Nenhuma guia foi transmitida.';return;}
  const p=d.campos_configuf||{};
  el.textContent=(d.ok?'ConfigUF PA/100102: receita confirmada.':'ConfigUF PA/100102: ainda sem confirmação.')
   +'\nCódigo GNRE: '+(d.codigo_gnre||'não informado')
   +'\nDiagnóstico: '+(d.diagnostico||'não informado')
   +'\nDocumento de origem: '+(p.exige_documento_origem||'não confirmado')
   +'\nConvênio: '+(p.exige_convenio||'não confirmado')
   +'\nData de pagamento: '+(p.exige_data_pagamento||'não confirmado')
   +'\nContribuinte emitente: '+(p.exige_contribuinte_emitente||'não confirmado')
   +'\nContribuinte destinatário: '+(p.exige_contribuinte_destinatario||'não confirmado')
   +'\nDetalhamento de receita: '+(p.detalhamento_verificado?'identificado':'não confirmado')
   +'\nCampos adicionais: '+(p.campos_adicionais_verificados?'identificados':'não confirmados')
   +'\nCódigo estadual 0303: campo ainda não confirmado, não será inserido automaticamente.'
   +'\nS=opcional; O=obrigatório; N=não exigido. "Não confirmado" requer validação.'
   +'\nNenhuma GNRE foi emitida. Produção depende de autorização fiscal específica.';
 }catch(e){
  el.textContent='Consulta indisponível: '+String(e.message||e)+'. Não ocorreu emissão.';
 }
}

// Consulta automática ConfigUF da UF que veio no XML da NF-e.
// Mantém todas as rotinas de emissão/produção separadas e desabilitadas aqui.
async function consultarGnreConfigufAuto(){
 const el=document.getElementById('gnreMultiResultado');
 if(!el)return;
 const nfe=gnrePreenvioNfeLida;
 if(!nfe){el.textContent='Importe uma NF-e autorizada para identificar a UF de destino antes da consulta.';return;}
 const uf=String(nfe.ufDestino||'').toUpperCase();
 const receita=String(document.getElementById('gnreMultiReceita')?.value||'').trim();
 if(!/^[A-Z]{2}$/.test(uf)||!/^\d{6}$/.test(receita)){
  el.textContent='UF do XML ou receita inválida. Informe seis dígitos de receita. Nenhuma guia será emitida.';return;
 }
 el.textContent='Consultando ConfigUF '+uf+'/'+receita+' em homologação (somente leitura)...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Autorização administrativa necessária. Informe a Senha Mestre apenas no campo oculto do portal.';return;}
  const r=await fetch('/api/integracoes?action=gnre-configuf-multi',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({uf,receita}),cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401){el.textContent='Autorização administrativa inválida ou expirada. Reautorize pelo portal; nenhuma guia foi transmitida.';return;}
  if(!r.ok||!d.ok){el.textContent='ConfigUF não confirmada para '+uf+'/'+receita+': '+
    (d.diagnostico||d.erro||'retorno sem aprovação')+
    '. Nenhuma guia foi emitida.';return;}
  const p=d.perfil||{};
  const ex=p.exigencias||{};
  const linhas=['ConfigUF '+uf+'/'+receita+' — código GNRE '+d.codigo_gnre+
    ' — CONSULTA APROVADA (sem emissão).',
   'NF-e importada: '+nfe.numero+' | destino '+uf+
     ' | DIFAL no XML R$ '+(nfe.valorDifal||'não informado'),
   'Obrigatoriedade declarada pela GNRE:',
   ...Object.entries(ex).map(([nome,codigo])=>' • '+nome.replaceAll('_',' ')+': '+codigo),
   'Tipos de documento de origem:',
   ...(p.documentos?.length?p.documentos.map(v=>' • '+v.codigo+' — '+v.descricao):[' • Nenhum tipo detalhado no retorno']),
   'Detalhamentos de receita:',
   ...(p.detalhamentos?.length?p.detalhamentos.map(v=>' • '+v.codigo+' — '+v.descricao):[' • Nenhum detalhamento relacionado']),
   'Campos adicionais:',
   ...(p.campos_adicionais?.length?p.campos_adicionais.map(v=>
     ' • '+v.codigo+' — '+v.titulo+' | tipo '+v.tipo+' | obrigatório '+v.obrigatorio):
     [' • Nenhum campo adicional listado']),
   'Código 0303: '+(p.codigo_0303?.identificado?'identificado em '+p.codigo_0303.campos.join(', '):
     'não identificado no perfil retornado; NÃO preencher automaticamente'),
   ...(p.pendencias?.length?['Pendências do perfil:',...p.pendencias.map(v=>' • '+v)]:[]),
   'Este perfil não substitui a validação fiscal estadual nem comprova habilitação em produção.',
   'Nenhuma GNRE emitida. A geração e o envio permanecem bloqueados para novas UFs.'
  ];
  el.textContent=linhas.join('\n');
 }catch(e){
  el.textContent='Não foi possível consultar ConfigUF: '+String(e.message||e)+
    '. Nenhuma guia foi emitida.';
 }
}

// O pré-envio PA não aceita dados manuais de imposto ou chave: usa a NF-e importada.
// Apenas calcula estrutura candidata e compara certificado/idempotencia.
async function verificarPreenvioPa100102(){
 const el=document.getElementById('gnrePaPreenvioResultado');
 if(!el)return;
 const nfe=gnrePreenvioNfeLida;
 if(!nfe){el.textContent='Importe uma NF-e autorizada antes de conferir o Pará.';return;}
 if(nfe.ufOrigem!=='GO'||nfe.ufDestino!=='PA'){
  el.textContent='Esta conferência é apenas para GO → PA. NF-e atual: '+nfe.ufOrigem+' → '+nfe.ufDestino+'. Nenhuma guia emitida.';return;
 }
 const receita=String(document.getElementById('gnreMultiReceita')?.value||'').trim();
 if(receita!=='100102'){
  el.textContent='Para o pré-envio PA somente a receita 100102 está configurada. Nenhuma guia emitida.';return;
 }
 const campo=id=>String(document.getElementById(id)?.value||'').trim();
 const marcado=id=>Boolean(document.getElementById(id)?.checked);
 const fiscal={
  vencimento:campo('gnrePaVencimento'),pagamento:campo('gnrePaPagamento'),
  convenio:campo('gnrePaConvenio'),
  vencimentoConfirmado:marcado('gnrePaVencimentoConfirmado'),
  obrigacaoConfirmada:marcado('gnrePaObrigacaoConfirmada'),
  convenioConfirmado:marcado('gnrePaConvenioConfirmado')
 };
 el.textContent='Preparando estrutura e conferindo duplicidade, sem transmitir...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Autorização administrativa necessária; nenhuma guia transmitida.';return;}
  const r=await fetch('/api/integracoes?action=gnre-preenvio-pa',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:JSON.stringify({nfe,fiscal}),cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok){el.textContent='Pré-envio indisponível: '+(d.erro||'servidor não respondeu')+'. Nenhuma GNRE emitida.';return;}
  const pend=Array.isArray(d.pendencias)?d.pendencias:[];
  el.textContent=(d.apto_para_revisao?'Estrutura PA/100102 pronta para revisão técnica.':
    'Pré-envio PA/100102 com pendências.')
   +'\nNF-e: '+(d.resumo?.numero_nfe||nfe.numero)
   +' | DIFAL: R$ '+(d.resumo?.valor_difal||nfe.valorDifal)
   +' | FCP NF-e: R$ '+(d.resumo?.valor_fcp_nfe||nfe.valorFcp)
   +'\nDocumento de origem: tipo 24 — CHAVE DO DFe (44 dígitos)'
   +'\nDetalhamento: não aplicável | Campos adicionais: não aplicáveis'
   +(d.plano?'\nSHA-256 do lote candidato: '+d.plano.lote_sha256:'')
   +'\nA1 compatível: '+(d.certificado_verificado?'sim':'não confirmado')
   +'\nDuplicidade local verificada: '+(d.duplicidade_verificada?'sem ocorrência':'não confirmada')
   +(pend.length?'\nPendências:\n- '+pend.join('\n- '):'')
   +'\nNenhuma guia foi transmitida ou emitida. Não usar este pré-envio para pagamento.';
 }catch(e){
  el.textContent='Falha na conferência: '+String(e.message||e)+'. Nenhum lote enviado.';
 }
}

// Confirmacao independente do endpoint ConfigUF HTTPS 443, aprovado em SOAP 450.
// Nao transmite guias. Os endpoints de recepcao/resultado usam 443 apenas na homologacao Preview.
async function compararGnreConfigUf443(){
 const el=document.getElementById('gnreComparacao443Resultado');
 if(!el)return;
 el.textContent='Consultando WSDL na porta HTTPS padrão (443) e, se válido, a configuração geral MG. Nenhuma guia será enviada...';
 try{
   const chave=await obterChaveIntegracoesCotacao();
   if(!chave){el.textContent='Teste cancelado: autorização administrativa necessária.';return}
   const resposta=await fetch('/api/integracoes?action=gnre-configuf-consulta',{
     method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
     body:JSON.stringify({tipo_teste:'comparar_443'})
   });
   const d=await resposta.json();
   const codigo=d.codigo_situacao||d.codigo||'não informado';
   const situacao=d.ok?'CONFIGURAÇÃO MG CONFIRMADA':'configuração MG NÃO confirmada';
   const wsdl=String(d.http_status_wsdl||'não disponível');
   const http=String(d.http_status||'não disponível');
   el.textContent='Comparação GNRE HTTPS 443 — '+situacao
     +'\nWSDL HTTP: '+wsdl+' | consulta SOAP HTTP: '+http+' | código GNRE: '+codigo
     +'\nMensagem: '+(d.descricao_situacao||d.fault||d.erro||d.conclusao||'Não informada')
     +'\nEndereço testado: '+(d.endereco_testado||'https://www.testegnre.pe.gov.br/gnreWS/services/GnreConfigUF')
     +'\nEndereço anunciado no WSDL: '+(d.endereco_anunciado_wsdl||'não disponível')
     +'\nDiagnóstico: '+(d.conclusao||d.fase||'Consulte o resultado')
     +'\nConfigUF, recepcao e consulta de lotes usam HTTPS 443 na homologacao Preview. Nenhuma guia foi transmitida.';
 }catch(e){
   el.textContent='Não foi possível concluir a comparação HTTPS 443. '+String(e?.message||'Falha desconhecida')
     +'. Nenhuma guia foi transmitida.';
 }
}


// Consulta os contratos de recepcao/resultado GNRE sem enviar nenhum lote.
async function verificarGnreLotesWsdl443(){
 const el=document.getElementById('gnreLotesWsdl443Resultado');
 if(!el)return;
 el.textContent='Verificando WSDLs dos servicos de recepcao e consulta em HTTPS 443 (somente leitura)...';
 try{
  const chave=await obterChaveIntegracoesCotacao();
  if(!chave){el.textContent='Autorizacao administrativa necessaria.';return;}
  const response=await fetch('/api/integracoes?action=gnre-lotes-wsdl443',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
   body:'{}'
  });
  const d=await response.json();
  if(!Array.isArray(d.contratos)){
   el.textContent='Nao foi possivel confirmar os contratos: '+(d.erro||'Resposta inesperada')+'. Nenhuma guia foi enviada.';
   return;
  }
  const linhas=d.contratos.map(x=>x.servico+': '+(x.contrato_aprovado?'WSDL 443 CONFIRMADO':'WSDL 443 NAO confirmado')
   +' | HTTP '+(x.wsdl_http||'indisponivel')
   +' | SOAP 1.2: '+(x.wsdl_soap12?'sim':'nao confirmado')
   +' | endpoint '+(x.endpoint_anunciado||'nao confirmado')
   +(x.codigo?' | codigo '+x.codigo:''));
  el.textContent='Preflight GNRE — '+(d.ok?'contratos de lote CONFIRMADOS':'verificacao incompleta')
   +'\n'+linhas.join('\n')
   +'\nSomente leitura. Nenhuma guia fiscal foi transmitida.';
 }catch(e){el.textContent='Falha ao verificar WSDLs: '+String(e?.message||'Erro')+'. Nenhuma guia foi transmitida.';}
}
