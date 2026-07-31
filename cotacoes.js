
/* =========================================================
   COTAÇÕES, GNRE, HISTÓRICO E AUTORIZAÇÃO
   ========================================================= */
let freteAliquotas = [];
let freteHistorico = [];
let freteRespostasAtuais = [];
let freteModuloCarregado = false;
let freteAndamento = [];
let freteTimerAndamento = null;

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

function dadosFormularioFrete(){
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
  return {
    altura_cm:Number(nums[0]||0),
    largura_cm:Number(nums[1]||0),
    comprimento_cm:Number(nums[2]||0)
  };
}

async function cotarAutomaticamenteRodonaves(transportadoraId,tipoFrete){
  const dados=dadosFormularioFrete();
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
    // Salva a cotação primeiro para manter o histórico.
    const salva=await salvarCotacaoFrete("rascunho");
    if(!salva)throw new Error("Não foi possível salvar a cotação antes da consulta.");

    const resposta=await fetch("/api/integracoes/cotar-rodonaves",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-integrations-admin-key":sessionStorage.getItem("integrations_admin_key")||""
      },
      body:JSON.stringify({
        cotacao_id:salva.id,
        cliente_nome:dados.cliente_nome,
        cpf_cnpj_destino:documento,
        cep_destino:cep,
        peso_total:dados.peso_total,
        valor_nf:dados.valor_nf,
        volumes:dados.volumes,
        solicitante:dados.solicitante||"Johnny",
        tipo_frete:tipoFrete,
        embalagem:dados.embalagem||"Caixas",
        ...extrairMedidasRodonaves(dados.medidas),
        peso_unitario:dados.volumes?Number(dados.peso_total)/Number(dados.volumes):null
      })
    });

    const corpo=await resposta.json().catch(()=>({}));

    if(!resposta.ok){
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
      alert(
        "Cotação concluída.\n\n"+
        corpo.aviso
      );
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
        </div>

        <div class="email-acoes">
          <button class="btn roxo" onclick="autorizarRespostaFrete('${id}','${tipoResposta}')">✅ Marcar autorizada</button>
          <span class="frete-status ${existente.status || "aguardando"}">
            ${existente.status === "autorizada" ? "AUTORIZADA" : "AGUARDANDO"}
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
