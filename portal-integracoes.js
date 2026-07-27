
/* =========================================================
   CENTRAL E PORTAL DE INTEGRAÇÕES — V13
   ========================================================= */
let integracoesTransportadoras=[];
let integracaoPortalAtual=null;
let portalEtapaAtual=1;
let portalArquivosSelecionados=[];

function tokenIntegracaoUrl(){
  return new URLSearchParams(location.search).get("integracao");
}

function gerarTokenIntegracao(){
  if(window.crypto?.randomUUID){
    return crypto.randomUUID().replaceAll("-","")+
      crypto.randomUUID().replaceAll("-","").slice(0,16);
  }
  return Array.from({length:48},()=>Math.floor(Math.random()*36).toString(36)).join("");
}

function escaparIntegracao(valor){
  if(typeof escaparHtmlEmail==="function") return escaparHtmlEmail(valor||"");
  const div=document.createElement("div");div.textContent=valor||"";return div.innerHTML;
}

function formatarDataIntegracao(data){
  return data ? new Date(data).toLocaleString("pt-BR") : "—";
}

function statusIntegracaoTexto(status){
  return {
    convidado:"Convite enviado",
    rascunho:"Em preenchimento",
    enviado:"Enviado para análise",
    revisao:"Ajustes solicitados",
    aprovado:"Aprovado",
    inativo:"Inativo"
  }[status] || status || "Convidado";
}

function abrirNovaIntegracaoTransportadora(){
  ["integracaoConviteNome","integracaoConviteCnpj","integracaoConviteEmail","integracaoConviteContato"].forEach(id=>{
    const campo=document.getElementById(id);if(campo)campo.value="";
  });
  document.getElementById("integracaoConviteValidade").value="30";
  document.getElementById("modalNovaIntegracao").style.display="flex";
}
function fecharNovaIntegracaoTransportadora(){
  document.getElementById("modalNovaIntegracao").style.display="none";
}

async function criarConviteIntegracao(){
  const nome=document.getElementById("integracaoConviteNome").value.trim();
  if(!nome){alert("Informe o nome da transportadora.");return}
  const dias=Number(document.getElementById("integracaoConviteValidade").value||30);
  const expira=new Date(Date.now()+dias*86400000).toISOString();
  const token=gerarTokenIntegracao();

  const dados={
    token,
    transportadora_nome:nome,
    cnpj:document.getElementById("integracaoConviteCnpj").value.trim()||null,
    contato_nome:document.getElementById("integracaoConviteContato").value.trim()||null,
    contato_email:document.getElementById("integracaoConviteEmail").value.trim()||null,
    status:"convidado",
    progresso:0,
    expira_em:expira,
    criado_por:window.usuarioLogado?.login||null,
    atualizado_em:new Date().toISOString()
  };

  const resposta=await banco.from("integracao_convites").insert([dados]).select().single();
  if(resposta.error){alert("Não foi possível criar o convite: "+resposta.error.message);return}

  fecharNovaIntegracaoTransportadora();
  await carregarIntegracoesTransportadoras();
  copiarLinkIntegracao(token);
}

async function carregarIntegracoesTransportadoras(){
  if(!window.banco) return;
  const resposta=await banco.from("integracao_convites").select("*").order("created_at",{ascending:false});
  if(resposta.error){
    console.warn("Central de Integrações:",resposta.error.message);
    return;
  }
  integracoesTransportadoras=resposta.data||[];
  montarTabelaIntegracoes();
}

function montarTabelaIntegracoes(){
  const tbody=document.getElementById("integracoesTabela");
  if(!tbody)return;
  const busca=String(document.getElementById("integracoesBusca")?.value||"").toLowerCase();
  const lista=integracoesTransportadoras.filter(i=>
    String(i.transportadora_nome||"").toLowerCase().includes(busca)||
    String(i.contato_email||"").toLowerCase().includes(busca)
  );

  const total=integracoesTransportadoras.length;
  const rascunho=integracoesTransportadoras.filter(i=>i.status==="rascunho").length;
  const enviados=integracoesTransportadoras.filter(i=>i.status==="enviado").length;
  const aprovados=integracoesTransportadoras.filter(i=>i.status==="aprovado").length;
  const kpi=document.getElementById("integracoesKpis");
  if(kpi)kpi.innerHTML=`
    <div><span>Convites</span><b>${total}</b></div>
    <div><span>Em preenchimento</span><b>${rascunho}</b></div>
    <div><span>Enviados para análise</span><b>${enviados}</b></div>
    <div><span>Aprovados</span><b>${aprovados}</b></div>`;

  tbody.innerHTML=lista.length?lista.map(i=>`
    <tr>
      <td><strong>${escaparIntegracao(i.transportadora_nome)}</strong><br><small>${escaparIntegracao(i.cnpj||"")}</small></td>
      <td>${escaparIntegracao(i.contato_nome||"")}<br><small>${escaparIntegracao(i.contato_email||"")}</small></td>
      <td><span class="integracao-status ${i.status}">${statusIntegracaoTexto(i.status)}</span></td>
      <td><div class="integracao-progresso-mini"><span style="width:${Number(i.progresso||0)}%"></span></div><small>${Number(i.progresso||0)}%</small></td>
      <td>${formatarDataIntegracao(i.atualizado_em||i.created_at)}</td>
      <td>
        <button class="btn azul" onclick="copiarLinkIntegracao('${i.token}')">Copiar link</button>
        <button class="btn roxo" onclick="verDetalhesIntegracao('${i.id}')">Ver</button>
        ${i.status==="enviado"?`<button class="btn verde" onclick="alterarStatusIntegracao('${i.id}','aprovado')">Aprovar</button>`:""}
      </td>
    </tr>`).join(""):'<tr><td colspan="6">Nenhum convite cadastrado.</td></tr>';
}

function linkPublicoIntegracao(token){
  const url=new URL(location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("integracao",token);
  return url.toString();
}
async function copiarLinkIntegracao(token){
  const link=linkPublicoIntegracao(token);
  try{await navigator.clipboard.writeText(link);alert("Link copiado:\n\n"+link)}
  catch{prompt("Copie o link:",link)}
}

async function alterarStatusIntegracao(id,status){
  const resposta=await banco.from("integracao_convites").update({
    status,atualizado_em:new Date().toISOString()
  }).eq("id",id);
  if(resposta.error)alert(resposta.error.message);else carregarIntegracoesTransportadoras();
}

async function verDetalhesIntegracao(id){
  const convite=integracoesTransportadoras.find(i=>String(i.id)===String(id));
  if(!convite)return;
  const [form,arquivos]=await Promise.all([
    banco.from("integracao_formularios").select("*").eq("convite_id",id).maybeSingle(),
    banco.from("integracao_arquivos").select("*").eq("convite_id",id).order("created_at",{ascending:false})
  ]);
  const dados=form.data?.dados||{};
  document.getElementById("integracaoDetalhesCard").style.display="block";
  document.getElementById("integracaoDetalhesTitulo").textContent=convite.transportadora_nome;
  document.getElementById("integracaoDetalhesSubtitulo").textContent=
    `${statusIntegracaoTexto(convite.status)} • Atualizado em ${formatarDataIntegracao(convite.atualizado_em)}`;
  const grupos=[
    ["Empresa",["razao_social","nome_fantasia","cnpj","site","contato_tecnico","email_tecnico"]],
    ["Integração",["tipo_integracao","formato","autenticacao","url_homologacao","url_producao"]],
    ["Cotação",["cotacao_disponivel","endpoint_cotacao","campos_cotacao","taxas_cotacao"]],
    ["Coleta",["coleta_disponivel","endpoint_coleta","regras_coleta"]],
    ["Rastreamento",["rastreio_disponivel","endpoint_rastreio","webhook_disponivel","eventos_webhook"]],
    ["Documentação",["link_documentacao","limites_regras","suporte_tecnico"]]
  ];
  const arquivosHtml=(arquivos.data||[]).map(a=>`<li>${escaparIntegracao(a.nome_arquivo)} <small>(${Math.round((a.tamanho||0)/1024)} KB)</small></li>`).join("");
  document.getElementById("integracaoDetalhesConteudo").innerHTML=`
    <div class="integracao-detalhes-grid">
      ${grupos.map(([titulo,campos])=>`<div class="integracao-detalhes-bloco"><h3>${titulo}</h3><p>${
        campos.map(c=>`${c.replaceAll("_"," ")}: ${dados[c]||"—"}`).join("\n")
      }</p></div>`).join("")}
      <div class="integracao-detalhes-bloco"><h3>Arquivos</h3>${arquivosHtml?`<ul>${arquivosHtml}</ul>`:"<p>Nenhum arquivo.</p>"}</div>
    </div>`;
  document.getElementById("integracaoDetalhesCard").scrollIntoView({behavior:"smooth"});
}
function fecharDetalhesIntegracao(){document.getElementById("integracaoDetalhesCard").style.display="none"}

function camposPortal(){
  return {
    razao_social:"piRazaoSocial",nome_fantasia:"piNomeFantasia",cnpj:"piCnpj",site:"piSite",
    contato_comercial:"piContatoComercial",email_comercial:"piEmailComercial",telefone_comercial:"piTelefoneComercial",
    contato_tecnico:"piContatoTecnico",email_tecnico:"piEmailTecnico",telefone_tecnico:"piTelefoneTecnico",
    tipo_integracao:"piTipoIntegracao",formato:"piFormato",autenticacao:"piAutenticacao",
    tem_homologacao:"piTemHomologacao",url_homologacao:"piUrlHomologacao",url_producao:"piUrlProducao",
    token_expira:"piTokenExpira",validade_token:"piValidadeToken",exige_ip:"piExigeIp",exige_certificado:"piExigeCertificado",
    cotacao_disponivel:"piCotacaoDisponivel",endpoint_cotacao:"piEndpointCotacao",retorna_numero:"piRetornaNumero",
    retorna_prazo:"piRetornaPrazo",cif_fob:"piCifFob",validade_cotacao:"piValidadeCotacao",
    campos_cotacao:"piCamposCotacao",taxas_cotacao:"piTaxasCotacao",
    exemplo_req_cotacao:"piExemploReqCotacao",exemplo_resp_cotacao:"piExemploRespCotacao",
    coleta_disponivel:"piColetaDisponivel",endpoint_coleta:"piEndpointColeta",cancelar_coleta:"piCancelarColeta",
    consultar_coleta:"piConsultarColeta",regras_coleta:"piRegrasColeta",retorno_coleta:"piRetornoColeta",
    rastreio_disponivel:"piRastreioDisponivel",endpoint_rastreio:"piEndpointRastreio",
    webhook_disponivel:"piWebhookDisponivel",eventos_webhook:"piEventosWebhook",
    etiqueta_disponivel:"piEtiquetaDisponivel",formato_etiqueta:"piFormatoEtiqueta",chaves_rastreio:"piChavesRastreio",
    link_documentacao:"piLinkDocumentacao",limites_regras:"piLimitesRegras",suporte_tecnico:"piSuporteTecnico"
  };
}
function lerDadosPortal(){
  return Object.fromEntries(Object.entries(camposPortal()).map(([chave,id])=>[chave,document.getElementById(id)?.value?.trim()||""]));
}
function preencherDadosPortal(dados){
  Object.entries(camposPortal()).forEach(([chave,id])=>{const el=document.getElementById(id);if(el)el.value=dados?.[chave]||""});
}
function progressoPortal(dados=lerDadosPortal()){
  const importantes=["razao_social","cnpj","contato_tecnico","email_tecnico","tipo_integracao","cotacao_disponivel","coleta_disponivel","rastreio_disponivel"];
  return Math.min(100,Math.round(importantes.filter(c=>dados[c]).length/importantes.length*75+(portalEtapaAtual/7*25)));
}

function irEtapaPortal(etapa){
  portalEtapaAtual=Math.max(1,Math.min(7,etapa));
  document.querySelectorAll(".portal-etapa").forEach(s=>s.classList.toggle("ativa",Number(s.dataset.etapa)===portalEtapaAtual));
  document.querySelectorAll(".portal-etapas button").forEach(b=>b.classList.toggle("ativo",Number(b.dataset.etapa)===portalEtapaAtual));
  const nomes=["Empresa e contatos","Tipo de integração","Cotação de frete","Solicitação de coleta","Rastreamento e etiquetas","Documentação","Revisão e envio"];
  const percentual=Math.round(portalEtapaAtual/7*100);
  document.getElementById("portalEtapaNome").textContent=nomes[portalEtapaAtual-1];
  document.getElementById("portalProgressoTexto").textContent=`Etapa ${portalEtapaAtual} de 7`;
  document.getElementById("portalProgressoPercentual").textContent=`${percentual}%`;
  document.getElementById("portalBarraInterna").style.width=`${percentual}%`;
  document.getElementById("portalBtnAnterior").style.visibility=portalEtapaAtual===1?"hidden":"visible";
  document.getElementById("portalBtnProximo").style.display=portalEtapaAtual===7?"none":"inline-block";
  document.getElementById("portalBtnEnviar").style.display=portalEtapaAtual===7?"inline-block":"none";
  scrollTo({top:0,behavior:"smooth"});
}
function proximaEtapaPortal(){irEtapaPortal(portalEtapaAtual+1)}
function etapaAnteriorPortal(){irEtapaPortal(portalEtapaAtual-1)}


async function aguardarBancoPortal(){
  const inicio=Date.now();

  while(!window.banco && Date.now()-inicio<18000){
    if(typeof carregarSupabase==="function" && !window.banco){
      try{
        await carregarSupabase();
      }catch(e){}
    }

    if(window.banco) return window.banco;
    await new Promise(resolve=>setTimeout(resolve,150));
  }

  throw new Error("Não foi possível conectar ao banco de dados.");
}

async function carregarPortalIntegracao(){
  const token=tokenIntegracaoUrl();
  if(!token)return false;

  document.documentElement.classList.add("modo-portal-publico");

  const login=document.getElementById("loginTela");
  const carregando=document.getElementById("carregandoSistema");
  const sidebar=document.querySelector(".sidebar");
  const main=document.querySelector(".main");
  const portal=document.getElementById("portalIntegracaoTransportadora");

  if(login)login.style.display="none";
  if(carregando)carregando.style.display="none";
  if(sidebar)sidebar.style.display="none";
  if(main)main.style.display="none";
  if(portal)portal.style.display="block";

  try{
    await aguardarBancoPortal();
  }catch(erro){
    document.getElementById("portalNomeTransportadora").textContent="Falha de conexão";
    document.querySelector(".portal-formulario-card").innerHTML=
      `<h2>Não foi possível abrir o cadastro.</h2><p>${escaparIntegracao(erro.message)}</p>`;
    return true;
  }

  const convite=await banco.from("integracao_convites").select("*").eq("token",token).maybeSingle();
  if(convite.error||!convite.data){
    document.getElementById("portalNomeTransportadora").textContent="Link inválido";
    document.querySelector(".portal-formulario-card").innerHTML="<h2>Este link não existe ou foi desativado.</h2>";
    return true;
  }
  if(convite.data.expira_em && new Date(convite.data.expira_em)<new Date()){
    document.getElementById("portalNomeTransportadora").textContent=convite.data.transportadora_nome;
    document.querySelector(".portal-formulario-card").innerHTML="<h2>Este convite expirou.</h2><p>Solicite um novo link à Sofisticatto Cosméticos.</p>";
    return true;
  }
  integracaoPortalAtual=convite.data;
  document.getElementById("portalNomeTransportadora").textContent=convite.data.transportadora_nome;
  document.getElementById("piRazaoSocial").value=convite.data.transportadora_nome||"";
  document.getElementById("piCnpj").value=convite.data.cnpj||"";
  document.getElementById("piContatoComercial").value=convite.data.contato_nome||"";
  document.getElementById("piEmailComercial").value=convite.data.contato_email||"";

  const formulario=await banco.from("integracao_formularios").select("*").eq("convite_id",convite.data.id).maybeSingle();
  if(formulario.data?.dados)preencherDadosPortal(formulario.data.dados);
  document.getElementById("piArquivos").addEventListener("change",e=>{
    portalArquivosSelecionados=[...e.target.files];montarArquivosPortal();
  });
  irEtapaPortal(1);
  return true;
}

function montarArquivosPortal(){
  const box=document.getElementById("piArquivosLista");
  box.innerHTML=portalArquivosSelecionados.map((f,i)=>`
    <div class="portal-arquivo-item"><span>📄 ${escaparIntegracao(f.name)}</span><button type="button" onclick="removerArquivoPortal(${i})">Remover</button></div>`).join("");
}
function removerArquivoPortal(i){portalArquivosSelecionados.splice(i,1);montarArquivosPortal()}

async function salvarFormularioPortal(status="rascunho"){
  if(!integracaoPortalAtual)return false;
  const dados=lerDadosPortal();
  const progresso=progressoPortal(dados);
  const payload={
    convite_id:integracaoPortalAtual.id,
    dados,
    etapa_atual:portalEtapaAtual,
    atualizado_em:new Date().toISOString()
  };
  const existente=await banco.from("integracao_formularios").select("id").eq("convite_id",integracaoPortalAtual.id).maybeSingle();
  const resposta=existente.data
    ? await banco.from("integracao_formularios").update(payload).eq("id",existente.data.id)
    : await banco.from("integracao_formularios").insert([payload]);
  if(resposta.error)throw resposta.error;
  await banco.from("integracao_convites").update({
    status,progresso:status==="enviado"?100:progresso,atualizado_em:new Date().toISOString()
  }).eq("id",integracaoPortalAtual.id);
  return true;
}

async function enviarArquivosPortal(){
  for(const arquivo of portalArquivosSelecionados){
    const caminho=`${integracaoPortalAtual.id}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const upload=await banco.storage.from("integracoes-documentos").upload(caminho,arquivo,{upsert:false});
    if(upload.error)throw upload.error;
    const meta=await banco.from("integracao_arquivos").insert([{
      convite_id:integracaoPortalAtual.id,nome_arquivo:arquivo.name,caminho,
      tamanho:arquivo.size,tipo_mime:arquivo.type||null
    }]);
    if(meta.error)throw meta.error;
  }
  portalArquivosSelecionados=[];montarArquivosPortal();
}

async function salvarRascunhoPortal(){
  try{
    await salvarFormularioPortal("rascunho");
    if(portalArquivosSelecionados.length)await enviarArquivosPortal();
    const m=document.getElementById("portalMensagemFinal");
    m.className="portal-mensagem-final sucesso";m.textContent="Rascunho salvo com sucesso. Você pode continuar depois usando o mesmo link.";
  }catch(e){
    const m=document.getElementById("portalMensagemFinal");
    m.className="portal-mensagem-final erro";m.textContent="Não foi possível salvar: "+e.message;
  }
}

async function enviarIntegracaoPortal(){
  const dados=lerDadosPortal();
  const faltando=[];
  if(!dados.razao_social)faltando.push("Razão social");
  if(!dados.cnpj)faltando.push("CNPJ");
  if(!dados.contato_tecnico)faltando.push("Responsável técnico");
  if(!dados.email_tecnico)faltando.push("E-mail técnico");
  if(!document.getElementById("piConfirmacao").checked)faltando.push("Confirmação de autorização");
  if(faltando.length){alert("Preencha antes de enviar:\n\n"+faltando.join("\n"));return}
  try{
    await salvarFormularioPortal("enviado");
    if(portalArquivosSelecionados.length)await enviarArquivosPortal();
    const m=document.getElementById("portalMensagemFinal");
    m.className="portal-mensagem-final sucesso";
    m.textContent="Cadastro enviado com sucesso. A equipe da Sofisticatto iniciará a análise técnica.";
    document.getElementById("portalBtnEnviar").disabled=true;
  }catch(e){
    const m=document.getElementById("portalMensagemFinal");
    m.className="portal-mensagem-final erro";m.textContent="Não foi possível enviar: "+e.message;
  }
}

document.addEventListener("DOMContentLoaded",async()=>{
  if(tokenIntegracaoUrl()){
    await carregarPortalIntegracao();
  }
});
