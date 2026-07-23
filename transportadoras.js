
/* =========================================================
   TRANSPORTADORAS E MODELOS DE COTAÇÃO
   ========================================================= */
let freteModelos = [];
let freteTransportadoras = [];

async function carregarModelosFrete(){
  const resposta = await banco.from("frete_modelos").select("*").order("nome");
  if(resposta.error){
    console.warn("Modelos de frete:", resposta.error.message);
    return;
  }

  freteModelos = resposta.data || [];
  montarTabelaModelosFrete();
  montarSelectModelosFrete();
}

function montarSelectModelosFrete(){
  const select = document.getElementById("freteTransModelo");
  if(!select) return;

  const atual = select.value;
  select.innerHTML =
    '<option value="">Selecione</option>' +
    freteModelos.map(m => `<option value="${m.id}">${escaparHtmlEmail(m.nome)}</option>`).join("");

  select.value = atual;
}

function montarTabelaModelosFrete(){
  const tbody = document.getElementById("freteTabelaModelos");
  if(!tbody) return;

  tbody.innerHTML = freteModelos.length
    ? freteModelos.map(modelo => {
        const quantidade = freteTransportadoras.filter(
          t => String(t.modelo_id) === String(modelo.id)
        ).length;

        return `<tr>
          <td>${escaparHtmlEmail(modelo.nome)}</td>
          <td>${quantidade}</td>
          <td>
            <button class="btn azul" onclick="editarModeloFrete('${modelo.id}')">Editar</button>
            <button class="btn vermelho" onclick="excluirModeloFrete('${modelo.id}')">Excluir</button>
          </td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="3">Nenhum modelo cadastrado.</td></tr>';
}

async function salvarModeloFrete(){
  const id = freteValor("freteModeloId");
  const nome = freteValor("freteModeloNome");
  const texto = freteValor("freteModeloTexto");

  if(!nome || !texto){
    alert("Informe o nome e o texto do modelo.");
    return;
  }

  const dados = { nome, texto_modelo: texto, ativo: true };
  const resposta = id
    ? await banco.from("frete_modelos").update(dados).eq("id", id)
    : await banco.from("frete_modelos").insert([dados]);

  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  limparModeloFrete();
  await carregarModelosFrete();
  await carregarTransportadorasFrete();
}

function editarModeloFrete(id){
  const modelo = freteModelos.find(m => String(m.id) === String(id));
  if(!modelo) return;

  freteCampo("freteModeloId").value = modelo.id;
  freteCampo("freteModeloNome").value = modelo.nome;
  freteCampo("freteModeloTexto").value = modelo.texto_modelo;
}

function limparModeloFrete(){
  ["freteModeloId","freteModeloNome","freteModeloTexto"].forEach(id => {
    const el = freteCampo(id);
    if(el) el.value = "";
  });
}

async function excluirModeloFrete(id){
  if(!confirm("Excluir este modelo?")) return;

  const resposta = await banco.from("frete_modelos").delete().eq("id", id);
  if(resposta.error){
    alert("Não foi possível excluir. Verifique se há transportadoras vinculadas.");
    return;
  }

  carregarModelosFrete();
}

async function carregarTransportadorasFrete(){
  const resposta = await banco
    .from("frete_transportadoras")
    .select("*,frete_modelos(nome,texto_modelo)")
    .order("nome");

  if(resposta.error){
    console.warn("Transportadoras:", resposta.error.message);
    return;
  }

  freteTransportadoras = resposta.data || [];
  montarTransportadorasSelecao();
  montarTabelaTransportadorasFrete();
  montarTabelaModelosFrete();
}

function montarTransportadorasSelecao(){
  const box = document.getElementById("freteTransportadorasSelecao");
  if(!box) return;

  const ativas = freteTransportadoras.filter(t => t.ativa !== false);

  box.innerHTML = ativas.length
    ? ativas.map(t => `
      <label class="frete-check">
        <input class="frete-trans-check" type="checkbox" value="${t.id}">
        <span>
          <b>${escaparHtmlEmail(t.nome)}</b><br>
          <small>${escaparHtmlEmail(t.frete_modelos?.nome || "Sem modelo")}</small>
        </span>
      </label>
    `).join("")
    : '<div class="texto-vazio">Cadastre transportadoras primeiro.</div>';
}

function montarTabelaTransportadorasFrete(){
  const tbody = document.getElementById("freteTabelaTransportadoras");
  if(!tbody) return;

  tbody.innerHTML = freteTransportadoras.length
    ? freteTransportadoras.map(t => `
      <tr>
        <td>${escaparHtmlEmail(t.nome)}</td>
        <td>${escaparHtmlEmail(t.frete_modelos?.nome || "")}</td>
        <td>${escaparHtmlEmail(t.contato || t.whatsapp || t.email || "")}</td>
        <td>${t.ativa !== false ? "Sim" : "Não"}</td>
        <td>
          <button class="btn azul" onclick="editarTransportadoraFrete('${t.id}')">Editar</button>
          <button class="btn vermelho" onclick="excluirTransportadoraFrete('${t.id}')">Excluir</button>
        </td>
      </tr>
    `).join("")
    : '<tr><td colspan="5">Nenhuma transportadora cadastrada.</td></tr>';
}

async function salvarTransportadoraFrete(){
  const id = freteValor("freteTransportadoraId");
  const nome = freteValor("freteTransNome");

  if(!nome){
    alert("Informe o nome da transportadora.");
    return;
  }

  const dados = {
    nome,
    whatsapp: freteValor("freteTransWhatsapp"),
    email: freteValor("freteTransEmail"),
    contato: freteValor("freteTransContato"),
    modelo_id: freteValor("freteTransModelo") || null,
    ativa: freteValor("freteTransAtiva") === "true",
    observacao: freteValor("freteTransObs")
  };

  const resposta = id
    ? await banco.from("frete_transportadoras").update(dados).eq("id", id)
    : await banco.from("frete_transportadoras").insert([dados]);

  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  limparTransportadoraFrete();
  carregarTransportadorasFrete();
}

function editarTransportadoraFrete(id){
  const t = freteTransportadoras.find(item => String(item.id) === String(id));
  if(!t) return;

  const set = (campo, valor) => {
    const el = freteCampo(campo);
    if(el) el.value = valor ?? "";
  };

  set("freteTransportadoraId", t.id);
  set("freteTransNome", t.nome);
  set("freteTransWhatsapp", t.whatsapp);
  set("freteTransEmail", t.email);
  set("freteTransContato", t.contato);
  set("freteTransModelo", t.modelo_id);
  set("freteTransAtiva", String(t.ativa !== false));
  set("freteTransObs", t.observacao);
}

function limparTransportadoraFrete(){
  [
    "freteTransportadoraId","freteTransNome","freteTransWhatsapp",
    "freteTransEmail","freteTransContato","freteTransObs"
  ].forEach(id => {
    const el = freteCampo(id);
    if(el) el.value = "";
  });

  if(freteCampo("freteTransModelo")) freteCampo("freteTransModelo").value = "";
  if(freteCampo("freteTransAtiva")) freteCampo("freteTransAtiva").value = "true";
}

async function excluirTransportadoraFrete(id){
  if(!confirm("Excluir esta transportadora?")) return;

  const resposta = await banco.from("frete_transportadoras").delete().eq("id", id);
  if(resposta.error){
    alert(resposta.error.message);
    return;
  }

  carregarTransportadorasFrete();
}
