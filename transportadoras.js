
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
  await carregarCoberturasFrete();
  montarTransportadorasSelecao();
  montarTabelaTransportadorasFrete();
  preencherSelectModelosColetaTransportadora();
  montarTabelaModelosFrete();
  atualizarSugestoesTransportadoras();
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


async function preencherSelectModelosColetaTransportadora(){
  const select=freteCampo("freteTransModeloColeta");
  if(!select)return;

  try{
    const resposta=await banco
      .from("coleta_modelos")
      .select("id,nome")
      .eq("ativo",true)
      .order("nome");

    const atual=select.value;
    select.innerHTML='<option value="">Perguntar/escolher depois</option>'+
      (resposta.data||[]).map(modelo=>
        `<option value="${modelo.id}">${escaparHtmlEmail(modelo.nome||"")}</option>`
      ).join("");
    select.value=atual;
  }catch(erro){
    console.warn("Modelos de coleta:",erro);
  }
}

function montarTabelaTransportadorasFrete(){
  const tbody = document.getElementById("freteTabelaTransportadoras");
  if(!tbody) return;

  tbody.innerHTML = freteTransportadoras.length
    ? freteTransportadoras.map(t => `
      <tr>
        <td>${escaparHtmlEmail(t.nome)}</td>
        <td>${escaparHtmlEmail(t.frete_modelos?.nome || "")}</td>
        <td>${t.criar_coleta_ao_autorizar ? "Sim" : "Não"}</td>
        <td>${escaparHtmlEmail(t.contato || t.whatsapp || t.email || "")}</td>
        <td>${t.ativa !== false ? "Sim" : "Não"}</td>
        <td>
          <button class="btn azul" onclick="editarTransportadoraFrete('${t.id}')">Editar</button>
          <button class="btn vermelho" onclick="excluirTransportadoraFrete('${t.id}')">Excluir</button>
        </td>
      </tr>
    `).join("")
    : '<tr><td colspan="6">Nenhuma transportadora cadastrada.</td></tr>';
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
    modelo_coleta_id: freteValor("freteTransModeloColeta") || null,
    criar_coleta_ao_autorizar: freteValor("freteTransColetaAutomatica") === "true",
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
  preencherSelectModelosColetaTransportadora().then(()=>{
    set("freteTransModeloColeta",t.modelo_coleta_id);
  });
  set("freteTransColetaAutomatica",String(t.criar_coleta_ao_autorizar===true));
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

  if(freteCampo("freteTransModelo")) freteCampo("freteTransModelo").value="";
  if(freteCampo("freteTransModeloColeta")) freteCampo("freteTransModeloColeta").value="";
  if(freteCampo("freteTransColetaAutomatica")) freteCampo("freteTransColetaAutomatica").value="false";
  if(freteCampo("freteTransAtiva")) freteCampo("freteTransAtiva").value="true";
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

/* V95 — cobertura/sugestão de transportadoras por cidade/UF */
let freteCoberturas = [];
function normCobertura(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
async function carregarCoberturasFrete(){
  try{
    const r=await banco.from('frete_transportadora_cobertura').select('*').eq('ativo',true);
    if(r.error){ if(!/does not exist|schema cache/i.test(r.error.message||'')) console.warn('Cobertura transportadoras:',r.error.message); freteCoberturas=[]; return; }
    freteCoberturas=r.data||[];
  }catch(e){freteCoberturas=[];console.warn('Cobertura transportadoras:',e);}
}
function coberturaDaTransportadora(t,cidade,uf,cep){
  const cid=normCobertura(cidade), estado=normCobertura(uf), cepNum=String(cep||'').replace(/\D/g,'');
  const regras=freteCoberturas.filter(r=>String(r.transportadora_id)===String(t.id));
  if(!regras.length) return {status:'nao_confirmado',texto:'Atendimento não confirmado'};
  const aplicaveis=regras.filter(r=>{
    const ufOk=!r.uf||normCobertura(r.uf)===estado;
    const cidOk=!r.cidade||normCobertura(r.cidade)===cid;
    const ini=String(r.cep_inicio||'').replace(/\D/g,''), fim=String(r.cep_fim||'').replace(/\D/g,'');
    const cepOk=!ini||!fim||!cepNum||(cepNum>=ini&&cepNum<=fim);
    return ufOk&&cidOk&&cepOk;
  });
  if(!aplicaveis.length)return {status:'nao_confirmado',texto:'Atendimento não confirmado'};
  const bloqueio=aplicaveis.find(r=>r.atende===false);
  if(bloqueio)return {status:'nao_atende',texto:'Não atende esta cidade',regra:bloqueio};
  const ok=aplicaveis.find(r=>r.atende!==false);
  return ok?{status:'atende',texto:'Atende esta cidade',regra:ok}:{status:'nao_confirmado',texto:'Atendimento não confirmado'};
}
function atualizarSugestoesTransportadoras(){
  const cidade=document.getElementById('freteCidade')?.value||'', uf=document.getElementById('freteUf')?.value||'', cep=document.getElementById('freteCep')?.value||'';
  const box=document.getElementById('freteTransportadorasSelecao'); if(!box)return;
  const ativas=freteTransportadoras.filter(t=>t.ativa!==false);
  const ordem={atende:0,nao_confirmado:1,nao_atende:2};
  const avaliadas=ativas.map(t=>({t,c:coberturaDaTransportadora(t,cidade,uf,cep)})).sort((a,b)=>ordem[a.c.status]-ordem[b.c.status]||String(a.t.nome).localeCompare(String(b.t.nome)));
  box.innerHTML=avaliadas.map(({t,c})=>`<label class="frete-check frete-cobertura-${c.status}" title="${escaparHtmlEmail(c.texto)}"><input class="frete-trans-check" type="checkbox" value="${t.id}" ${c.status==='nao_atende'?'data-nao-atende="1"':''}><span><b>${escaparHtmlEmail(t.nome)}</b> <em class="frete-cobertura-badge ${c.status}">${c.status==='atende'?'✓':c.status==='nao_atende'?'✕':'?'} ${escaparHtmlEmail(c.texto)}</em><br><small>${escaparHtmlEmail(t.frete_modelos?.nome||'Sem modelo')}</small></span></label>`).join('')||'<div class="texto-vazio">Cadastre transportadoras primeiro.</div>';
  const resumo=document.getElementById('freteSugestaoCobertura');
  if(resumo){const n=avaliadas.filter(x=>x.c.status==='atende').length; resumo.innerHTML=cidade&&uf?`<b>Sugestão para ${escaparHtmlEmail(cidade)}/${escaparHtmlEmail(uf)}:</b> ${n?n+' transportadora(s) com atendimento cadastrado.':'nenhuma cobertura confirmada; as opções com ? ainda precisam de confirmação.'}`:'Preencha cidade/UF para ver as transportadoras sugeridas.';}
}
function validarCoberturaSelecionada(){
  const ruins=[...document.querySelectorAll('.frete-trans-check:checked[data-nao-atende="1"]')];
  if(!ruins.length)return true;
  const nomes=ruins.map(el=>freteTransportadoras.find(t=>String(t.id)===String(el.value))?.nome).filter(Boolean);
  alert(`Atenção: ${nomes.join(', ')} ${nomes.length>1?'não atendem':'não atende'} a cidade de destino conforme a cobertura cadastrada.\n\nEscolha outra transportadora ou atualize a cobertura no cadastro.`); return false;
}
