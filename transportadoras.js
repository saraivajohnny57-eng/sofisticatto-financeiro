
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
  preencherSelectCoberturaTransportadora();
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
  const cobSel=document.getElementById('coberturaTransportadora'); if(cobSel){cobSel.value=String(t.id); renderCoberturasCadastro();}
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

/* V96 — cobertura inteligente: cadastro + API oficial quando disponível */
let freteCoberturas = [];
let freteCoberturaApi = new Map();
let freteCoberturaTimer = null;
function normCobertura(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
async function carregarCoberturasFrete(){
  // V242: Supabase limita consultas REST a 1.000 linhas por resposta.
  // A base já ultrapassa esse limite (TRF + G5), então carregamos todas as páginas.
  try{
    const todas=[]; const tamanho=1000;
    for(let inicio=0;;inicio+=tamanho){
      const r=await banco.from('frete_transportadora_cobertura').select('*').or('ativo.eq.true,ativo.is.null').order('id',{ascending:true}).range(inicio,inicio+tamanho-1);
      if(r.error){console.warn('Coberturas:',r.error.message);freteCoberturas=[];const el=document.getElementById('coberturaResumo');if(el)el.innerHTML='<b>Erro ao carregar cobertura:</b> '+escaparHtmlEmail(r.error.message);return;}
      const lote=r.data||[]; todas.push(...lote); if(lote.length<tamanho)break;
    }
    freteCoberturas=todas;
    renderCoberturasCadastro();
  }catch(e){console.warn('Coberturas:',e);freteCoberturas=[];}
}
function coberturaNativa(t,cidade,uf,cep){
  const nome=normCobertura(t.nome), estado=normCobertura(uf);
  // Fonte oficial Braspress: informa atendimento em todo o território nacional.
  if(nome.includes('BRASPRESS') && estado) return {status:'atende',texto:'Atendimento nacional confirmado',fonte:'site oficial Braspress'};
  // A API da Alfa foi desativada em 23/09/2026; não presumimos cobertura.
  if(nome.includes('ALFA')) return {status:'nao_confirmado',texto:'API desativada — confirmar atendimento manualmente',fonte:'acesso API cancelado'};
  return null;
}

function coberturaDaTransportadora(t,cidade,uf,cep){
  const chave=`${t.id}|${String(cep||'').replace(/\D/g,'')}|${normCobertura(cidade)}|${normCobertura(uf)}`;
  if(freteCoberturaApi.has(chave)) return freteCoberturaApi.get(chave);
  const nativa=coberturaNativa(t,cidade,uf,cep); if(nativa)return nativa;
  const cid=normCobertura(cidade), estado=normCobertura(uf), cepNum=String(cep||'').replace(/\D/g,'');
  const regras=freteCoberturas.filter(r=>String(r.transportadora_id)===String(t.id));
  if(!regras.length) return {status:'nao_confirmado',texto:'Verificação pendente'};
  const baseOk=r=>{const ufOk=!r.uf||normCobertura(r.uf)===estado;const ini=String(r.cep_inicio||'').replace(/\D/g,''),fim=String(r.cep_fim||'').replace(/\D/g,'');const cepOk=!ini||!fim||!cepNum||(cepNum>=ini&&cepNum<=fim);return ufOk&&cepOk;};
  // V241: prioriza cidade exata. Só depois usa regra regional/estadual/nacional.
  // Isso evita uma regra regional esconder uma cidade confirmada individualmente.
  const exatas=regras.filter(r=>baseOk(r)&&r.cidade&&normCobertura(r.cidade)===cid);
  const amplas=regras.filter(r=>baseOk(r)&&!r.cidade);
  const aplicaveis=exatas.length?exatas:amplas;
  if(!aplicaveis.length)return {status:'nao_confirmado',texto:'Verificação pendente'};
  const bloqueio=aplicaveis.find(r=>r.atende===false);if(bloqueio)return {status:'nao_atende',texto:'Não atende esta cidade',regra:bloqueio};
  const ok=aplicaveis.find(r=>r.atende!==false);
  if(ok){const nivel=String(ok.nivel_confianca||'confirmado').toLowerCase(); if(nivel==='regional') return {status:'regional',texto:'Cobertura regional informada',regra:ok}; return {status:'atende',texto:'Atendimento confirmado',regra:ok};}
  return {status:'nao_confirmado',texto:'Verificação pendente'};
}
async function consultarCoberturaApis(){
  const cidade=document.getElementById('freteCidade')?.value||'',uf=document.getElementById('freteUf')?.value||'',cep=document.getElementById('freteCep')?.value||'';
  const doc=document.getElementById('freteCpfCnpj')?.value||'',bairro=document.getElementById('freteBairro')?.value||'';
  if(String(cep).replace(/\D/g,'').length!==8||String(doc).replace(/\D/g,'').length<11)return;
  const chaveAdmin=sessionStorage.getItem('integrations_admin_key'); if(!chaveAdmin)return;
  const candidatos=freteTransportadoras.filter(t=>t.ativa!==false && /RODONAVES|RTE/i.test(t.nome||''));
  await Promise.all(candidatos.map(async t=>{
    const k=`${t.id}|${String(cep).replace(/\D/g,'')}|${normCobertura(cidade)}|${normCobertura(uf)}`;
    freteCoberturaApi.set(k,{status:'consultando',texto:'Consultando malha...'}); atualizarSugestoesTransportadoras(false);
    try{const r=await fetch('/api/integracoes?action=verificar-cobertura',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chaveAdmin},body:JSON.stringify({transportadora_nome:t.nome,cep_destino:cep,cidade_destino:cidade,uf_destino:uf,cpf_cnpj_destino:doc,bairro_destino:bairro,cnpj_remetente:'05451985000195'})});const d=await r.json();const st=d.status||'nao_confirmado';freteCoberturaApi.set(k,{status:st,texto:st==='atende'?'Atende esta cidade':st==='nao_atende'?'Não atende esta cidade':'Não foi possível confirmar',fonte:d.fonte});}catch(e){freteCoberturaApi.set(k,{status:'nao_confirmado',texto:'Não foi possível confirmar'});}
  })); atualizarSugestoesTransportadoras(false);
}
function filtrarTransportadorasCotacao(){atualizarSugestoesTransportadoras(false);}
function atualizarSugestoesTransportadoras(agendarApi=true){
  const cidade=document.getElementById('freteCidade')?.value||'',uf=document.getElementById('freteUf')?.value||'',cep=document.getElementById('freteCep')?.value||'';const box=document.getElementById('freteTransportadorasSelecao');if(!box)return;
  const busca=normCobertura(document.getElementById('freteBuscaTransportadora')?.value||'');
  const ativas=freteTransportadoras.filter(t=>t.ativa!==false && (!busca||normCobertura(t.nome).includes(busca))),ordem={atende:0,regional:1,consultando:2,nao_confirmado:3,nao_atende:4};
  const avaliadas=ativas.map(t=>({t,c:coberturaDaTransportadora(t,cidade,uf,cep)})).sort((a,b)=>(ordem[a.c.status]??2)-(ordem[b.c.status]??2)||String(a.t.nome).localeCompare(String(b.t.nome)));
  box.innerHTML=avaliadas.map(({t,c})=>`<label class="frete-check frete-cobertura-${c.status}" title="${escaparHtmlEmail(c.texto)}"><input class="frete-trans-check" type="checkbox" value="${t.id}" ${c.status==='nao_atende'?'data-nao-atende="1"':''}><span><b>${escaparHtmlEmail(t.nome)}</b> <em class="frete-cobertura-badge ${c.status}">${c.status==='atende'?'✓':c.status==='regional'?'◐':c.status==='nao_atende'?'✕':c.status==='consultando'?'↻':'?'} ${escaparHtmlEmail(c.texto)}</em><br><small>${escaparHtmlEmail(t.frete_modelos?.nome||'Sem modelo')}</small></span></label>`).join('')||'<div class="texto-vazio">Cadastre transportadoras primeiro.</div>';
  const resumo=document.getElementById('freteSugestaoCobertura');if(resumo){const n=avaliadas.filter(x=>x.c.status==='atende').length, nr=avaliadas.filter(x=>x.c.status==='regional').length;resumo.innerHTML=cidade&&uf?`<b>Sugestão para ${escaparHtmlEmail(cidade)}/${escaparHtmlEmail(uf)}:</b> ${n?n+' confirmada(s)':''}${n&&nr?' • ':''}${nr?nr+' com cobertura regional':''}${!n&&!nr?'verificando cobertura disponível...':''}`:'Preencha cidade/UF para ver as transportadoras sugeridas.';}
  if(agendarApi){clearTimeout(freteCoberturaTimer);freteCoberturaTimer=setTimeout(consultarCoberturaApis,700);}
}
function validarCoberturaSelecionada(){
  const ruins=[...document.querySelectorAll('.frete-trans-check:checked[data-nao-atende="1"]')];
  if(!ruins.length)return true;
  const nomes=ruins.map(el=>freteTransportadoras.find(t=>String(t.id)===String(el.value))?.nome).filter(Boolean);
  alert(`Atenção: ${nomes.join(', ')} ${nomes.length>1?'não atendem':'não atende'} a cidade de destino conforme a cobertura cadastrada.\n\nEscolha outra transportadora ou atualize a cobertura no cadastro.`); return false;
}

/* =========================================================
   V242 — ADMINISTRAÇÃO DE COBERTURA / IMPORTAÇÃO EXCEL
   ========================================================= */
function preencherSelectCoberturaTransportadora(){
  const sel=document.getElementById('coberturaTransportadora'); if(!sel)return;
  const atual=sel.value;
  sel.innerHTML='<option value="">Selecione</option>'+freteTransportadoras.map(t=>`<option value="${t.id}">${escaparHtmlEmail(t.nome)}</option>`).join('');
  if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
}
function coberturasDaSelecionada(){
  const id=document.getElementById('coberturaTransportadora')?.value;
  return freteCoberturas.filter(r=>String(r.transportadora_id)===String(id));
}
function renderCoberturasCadastro(){
  preencherSelectCoberturaTransportadora();
  const id=document.getElementById('coberturaTransportadora')?.value, tbody=document.getElementById('coberturaTabela'), resumo=document.getElementById('coberturaResumo');
  if(!tbody)return; if(!id){tbody.innerHTML='<tr><td colspan="7">Selecione uma transportadora.</td></tr>'; if(resumo)resumo.textContent='Selecione uma transportadora.';return;}
  const busca=normCobertura(document.getElementById('coberturaBusca')?.value||'');
  let rows=coberturasDaSelecionada().filter(r=>!busca||normCobertura(`${r.uf||''} ${r.cidade||''}`).includes(busca));
  rows.sort((a,b)=>String(a.uf||'').localeCompare(String(b.uf||''))||String(a.cidade||'').localeCompare(String(b.cidade||'')));
  const total=coberturasDaSelecionada().length; if(resumo)resumo.innerHTML=`<b>${total.toLocaleString('pt-BR')}</b> regra(s) de cobertura cadastrada(s) • exibindo ${rows.length.toLocaleString('pt-BR')}`;
  tbody.innerHTML=rows.length?rows.map(r=>`<tr><td><input type="checkbox" class="cobertura-check" value="${r.id}"></td><td>${escaparHtmlEmail(r.uf||'TODAS')}</td><td>${escaparHtmlEmail(r.cidade||'Todas do estado/nacional')}</td><td>${escaparHtmlEmail([r.cep_inicio,r.cep_fim].filter(Boolean).join(' a ')||'')}</td><td>${escaparHtmlEmail(r.nivel_confianca||'confirmado')}</td><td>${escaparHtmlEmail(r.observacao||r.fonte||'')}</td><td><button class="btn vermelho" onclick="excluirCobertura('${r.id}')">Excluir</button></td></tr>`).join(''):'<tr><td colspan="7">Nenhuma cidade cadastrada para esta transportadora.</td></tr>';
}
async function adicionarCoberturaManual(){
  const transportadora_id=document.getElementById('coberturaTransportadora')?.value, uf=normCobertura(document.getElementById('coberturaUf')?.value).slice(0,2), cidade=(document.getElementById('coberturaCidade')?.value||'').trim();
  if(!transportadora_id||!uf){alert('Selecione a transportadora e informe a UF.');return;}
  const dados={transportadora_id,uf,cidade:cidade||null,cep_inicio:(document.getElementById('coberturaCepInicio')?.value||'').replace(/\D/g,'')||null,cep_fim:(document.getElementById('coberturaCepFim')?.value||'').replace(/\D/g,'')||null,atende:true,ativo:true,nivel_confianca:document.getElementById('coberturaNivel')?.value||'confirmado',fonte:'Cadastro manual no portal',observacao:(document.getElementById('coberturaObs')?.value||'').trim()||null};
  const existe=freteCoberturas.some(r=>String(r.transportadora_id)===String(transportadora_id)&&normCobertura(r.uf)===uf&&normCobertura(r.cidade)===normCobertura(cidade));
  if(existe&&!confirm('Esta cidade/UF já possui uma regra. Deseja cadastrar outra mesmo assim?'))return;
  const r=await banco.from('frete_transportadora_cobertura').insert([dados]); if(r.error){alert('Não foi possível salvar: '+r.error.message);return;}
  ['coberturaCidade','coberturaCepInicio','coberturaCepFim','coberturaObs'].forEach(x=>{const e=document.getElementById(x);if(e)e.value=''});
  await carregarCoberturasFrete(); renderCoberturasCadastro(); atualizarSugestoesTransportadoras(false);
}
async function excluirCobertura(id){if(!confirm('Excluir esta regra de cobertura?'))return;const r=await banco.from('frete_transportadora_cobertura').delete().eq('id',id);if(r.error){alert(r.error.message);return;}await carregarCoberturasFrete();renderCoberturasCadastro();atualizarSugestoesTransportadoras(false);}
async function excluirCoberturasSelecionadas(){const ids=[...document.querySelectorAll('.cobertura-check:checked')].map(x=>x.value);if(!ids.length){alert('Selecione pelo menos uma linha.');return;}if(!confirm(`Excluir ${ids.length} regra(s) selecionada(s)?`))return;const r=await banco.from('frete_transportadora_cobertura').delete().in('id',ids);if(r.error){alert(r.error.message);return;}await carregarCoberturasFrete();renderCoberturasCadastro();atualizarSugestoesTransportadoras(false);}
function campoPlanilha(obj,...nomes){const mapa={};Object.keys(obj||{}).forEach(k=>mapa[normCobertura(k)]=obj[k]);for(const n of nomes){const v=mapa[normCobertura(n)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return '';}
async function importarCoberturaExcel(file){
  const transportadora_id=document.getElementById('coberturaTransportadora')?.value;if(!transportadora_id){alert('Selecione primeiro a transportadora que receberá as cidades.');return;}if(!file)return;
  if(typeof XLSX==='undefined'){alert('O leitor de Excel não carregou. Verifique a internet e atualize a página.');return;}
  try{const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],linhas=XLSX.utils.sheet_to_json(ws,{defval:''});
    const validas=[],vistos=new Set(); for(const l of linhas){const cidade=campoPlanilha(l,'Cidade','Município','Municipio','Praça','Praca'),uf=normCobertura(campoPlanilha(l,'UF','Estado')).slice(0,2);if(!cidade||uf.length!==2)continue;const key=uf+'|'+normCobertura(cidade);if(vistos.has(key))continue;vistos.add(key);validas.push({transportadora_id,uf,cidade,cep_inicio:campoPlanilha(l,'CEP inicial','CEP Inicio','CEP De').replace(/\D/g,'')||null,cep_fim:campoPlanilha(l,'CEP final','CEP Fim','CEP Até','CEP Ate').replace(/\D/g,'')||null,atende:true,ativo:true,nivel_confianca:'confirmado',fonte:'Planilha importada no portal',observacao:campoPlanilha(l,'Observação','Observacao','Frequência','Frequencia')||null});}
    if(!validas.length){alert('Não encontrei linhas válidas. Use as colunas Cidade e UF ou baixe o modelo Excel.');return;}
    const existentes=new Set(freteCoberturas.filter(r=>String(r.transportadora_id)===String(transportadora_id)).map(r=>normCobertura(r.uf)+'|'+normCobertura(r.cidade)));
    const novas=validas.filter(x=>!existentes.has(normCobertura(x.uf)+'|'+normCobertura(x.cidade)));if(!novas.length){alert('Todas as cidades da planilha já estão cadastradas.');return;}
    if(!confirm(`Planilha: ${validas.length} cidade(s) válida(s).\nNovas: ${novas.length}.\nDuplicadas ignoradas: ${validas.length-novas.length}.\n\nImportar agora?`))return;
    for(let i=0;i<novas.length;i+=500){const r=await banco.from('frete_transportadora_cobertura').insert(novas.slice(i,i+500));if(r.error)throw r.error;}
    await carregarCoberturasFrete();renderCoberturasCadastro();atualizarSugestoesTransportadoras(false);alert(`${novas.length} cidade(s) importada(s) com sucesso.`);
  }catch(e){console.error(e);alert('Erro ao importar a planilha: '+(e.message||e));}
}
function baixarModeloCoberturaExcel(){
  if(typeof XLSX==='undefined'){alert('O gerador de Excel não carregou. Atualize a página com internet ativa.');return;}
  const dados=[{Cidade:'Guanambi',UF:'BA','CEP inicial':'','CEP final':'',Observação:'Atendimento confirmado pela transportadora'},{Cidade:'Salvador',UF:'BA','CEP inicial':'','CEP final':'',Observação:''}];
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(dados);XLSX.utils.book_append_sheet(wb,ws,'Cidades atendidas');XLSX.writeFile(wb,'modelo_cidades_atendidas.xlsx');
}
