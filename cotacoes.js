
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

function calcularGnreFrete(){
  const modo = freteValor("freteGnreModo");
  const campo = freteCampo("freteGnreValor");
  const informacao = freteCampo("freteAliquotaInfo");
  if(!campo || !informacao) return;

  campo.readOnly = modo === "automatico";

  if(modo === "nao"){
    campo.value = "";
    informacao.value = "Não se aplica";
    return;
  }

  if(modo === "manual"){
    informacao.value = "Valor informado manualmente";
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
      "x-integrations-admin-key":String(chave||"").trim()
    },
    body:"{}"
  });
  const dados=await resposta.json().catch(()=>({}));
  if(!resposta.ok){
    const erro=new Error(dados.erro||`Falha ao validar a chave (HTTP ${resposta.status}).`);
    erro.status=resposta.status;
    throw erro;
  }
  return !!dados.ok;
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
        <h3>🔐 Liberar cotação automática</h3>
        <p>Informe a mesma chave administrativa cadastrada na Vercel. Ela ficará guardada somente nesta sessão do navegador.</p>
        <label>Chave administrativa
          <div class="modal-chave-integracoes-campo">
            <input id="campoChaveIntegracoesCotacao" type="password" autocomplete="off" placeholder="Digite a chave administrativa">
            <button type="button" id="verChaveIntegracoesCotacao">👁</button>
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

    fundo.querySelector("#verChaveIntegracoesCotacao").onclick=()=>{
      input.type=input.type==="password"?"text":"password";
    };
    fundo.querySelector("#cancelarChaveIntegracoesCotacao").onclick=()=>{
      fundo.remove();resolve("");
    };
    btn.onclick=async()=>{
      const chave=input.value.trim();
      if(!chave){erro.textContent="Informe a chave administrativa.";return;}
      btn.disabled=true;btn.textContent="Validando...";erro.textContent="";
      try{
        const ok=await validarChaveIntegracoesCotacao(chave);
        if(!ok){erro.textContent="Chave inválida. Confira o valor cadastrado na Vercel.";return;}
        sessionStorage.setItem("integrations_admin_key", chave);
      if(confirm("Deseja manter esta chave salva neste computador para não precisar digitá-la novamente?\n\nUse somente em um computador confiável.")){
        localStorage.setItem("integrations_admin_key", chave);
      }
        fundo.remove();resolve(chave);
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
      if(await validarChaveIntegracoesCotacao(chave))return chave;
    }catch(erro){
      // V71: mantém a chave salva; erro de rede/deploy não significa chave incorreta.
      console.warn("Falha ao validar chave salva:",erro);
      const trocar=confirm(
        "A chave salva não pôde ser validada agora.\n\n"+
        (erro?.message||"Falha na validação.")+"\n\n"+
        "Deseja informar outra chave?\n\nCancelar mantém a chave atual."
      );
      if(!trocar) throw erro;
    }
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
    const r=await fetch("/api/integracoes?action=cotar-alfa",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({
      cotacao_id:salva.id,cliente_nome:dados.cliente_nome,cpf_cnpj_destino:documento,cep_destino:cep,
      peso_total:dados.peso_total,valor_nf:dados.valor_nf,volumes:dados.volumes,medidas:dados.medidas,tipo_frete:tipoFrete
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
  const original=botao?.textContent||"⚡ Cotar SSW automaticamente";if(botao){botao.disabled=true;botao.textContent="Consultando SSW...";}
  try{
    const adm=await chaveAdminColeta();if(!adm)throw new Error("Informe a chave administrativa.");
    const r=await fetch("/api/integracoes?action=cotar-ssw",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":adm},body:JSON.stringify({transportadora_id:transportadoraId,tipo_frete:tipoFrete,cnpj_pagador:cnpjPagador,cnpj_remetente:cnpjRem,cnpj_destinatario:cnpjDestino,cep_origem:String(FRETE_REMETENTE.cep||"").replace(/\D/g,""),cep_destino:cep,valor_nf:dados.valor_nf,quantidade:dados.volumes||1,peso:dados.peso_total||0,medidas:dados.medidas||"",coletar:dados.coleta||"Sim"})});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);
    if(!Number(d.valor||0))throw new Error(d.mensagem||"O SSW não retornou valor de frete.");
    freteCampo(`freteRespNumero_${chave}`).value="SSW";
    freteCampo(`freteRespValor_${chave}`).value=Number(d.valor).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
    freteCampo(`freteRespPrazo_${chave}`).value=d.prazo?`${d.prazo} dias corridos`:"";
    registrarRespostaFrete(transportadoraId,tipoFrete);
    mostrarBalaoSistema(`Cotação ${tr?.nome||"SSW"} recebida`,`${Number(d.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}${d.prazo?` • ${d.prazo} dias`:""}${d.mensagem?` • ${d.mensagem}`:""}`);
  }catch(e){console.error("Cotação automática SSW:",e);alert(`Não foi possível gerar a cotação automática de ${tr?.nome||"SSW"}:\n\n${e.message||e}`);}finally{if(botao){botao.disabled=false;botao.textContent=original;}}
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


function gerarCotacoesFrete(){
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
            ${/(^|\s)alfa(\s|$)|alfa transportes/i.test(transportadora?.nome||"")
              ? `<button class="btn roxo" id="btnAlfa_${chave}" onclick="cotarAutomaticamenteAlfa('${id}','${tipoResposta}')">⚡ Cotar Alfa automaticamente</button>` : ""}
            ${/(accert|tg\s+transportes|tgtransportes)/i.test(transportadora?.nome||"")
              ? `<button class="btn roxo" id="btnSSW_${chave}" onclick="cotarAutomaticamenteSSW('${id}','${tipoResposta}')">⚡ Cotar SSW automaticamente</button>` : ""}
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
