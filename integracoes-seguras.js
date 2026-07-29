/* =========================================================
   CREDENCIAIS SEGURAS E HOMOLOGAÇÃO — V14
   ========================================================= */
let integracaoSeguraAtual=null;

function chaveAdminIntegracoes(){
  return sessionStorage.getItem("integrations_admin_key") || "";
}

function cabecalhosIntegracoes(){
  return {
    "Content-Type":"application/json",
    "x-integrations-admin-key":chaveAdminIntegracoes()
  };
}

function statusCampoIntegracao(id,texto,tipo=""){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=texto;
  el.className=`integracao-chave-status ${tipo}`.trim();
}

function alternarSenhaIntegracao(id){
  const campo=document.getElementById(id);
  if(campo)campo.type=campo.type==="password"?"text":"password";
}

async function requisicaoIntegracoes(url,opcoes={}){
  const resposta=await fetch(url,{
    ...opcoes,
    headers:{...cabecalhosIntegracoes(),...(opcoes.headers||{})}
  });

  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={erro:texto}}

  if(!resposta.ok){
    throw new Error(dados.erro||dados.message||`Erro HTTP ${resposta.status}`);
  }

  return dados;
}

async function validarChaveIntegracoes(){
  const campo=document.getElementById("integracaoAdminKey");
  const chave=campo?.value?.trim();

  if(!chave){
    statusCampoIntegracao("integracaoAdminKeyStatus","Informe a chave.","erro");
    return;
  }

  sessionStorage.setItem("integrations_admin_key",chave);

  try{
    await requisicaoIntegracoes("/api/integracoes/validar-chave",{method:"POST",body:"{}"});
    statusCampoIntegracao("integracaoAdminKeyStatus","Chave validada","ok");
    await carregarStatusCredenciaisIntegracao();
  }catch(erro){
    sessionStorage.removeItem("integrations_admin_key");
    statusCampoIntegracao("integracaoAdminKeyStatus",erro.message,"erro");
  }
}

async function abrirIntegracaoSegura(conviteId){
  const convite=(integracoesTransportadoras||[]).find(
    item=>String(item.id)===String(conviteId)
  );

  integracaoSeguraAtual=convite||{id:conviteId};
  document.getElementById("integracaoSeguraConviteId").value=conviteId;
  document.getElementById("integracaoSeguraCard").style.display="block";
  document.getElementById("integracaoSeguraSubtitulo").textContent=
    `${convite?.transportadora_nome||"Transportadora"} — credenciais, ambientes e testes`;

  const chave=chaveAdminIntegracoes();
  if(chave){
    document.getElementById("integracaoAdminKey").value=chave;
    statusCampoIntegracao("integracaoAdminKeyStatus","Chave armazenada nesta sessão","ok");
  }

  await carregarConfiguracaoIntegracao();
  if(chave)await carregarStatusCredenciaisIntegracao();

  document.getElementById("integracaoSeguraCard")
    .scrollIntoView({behavior:"smooth",block:"start"});
}

function fecharIntegracaoSegura(){
  document.getElementById("integracaoSeguraCard").style.display="none";
}

function configuracaoTelaIntegracao(){
  return {
    convite_id:document.getElementById("integracaoSeguraConviteId").value,
    ambiente:document.getElementById("integracaoAmbiente").value,
    status_tecnico:document.getElementById("integracaoStatusTecnico").value,
    url_homologacao:document.getElementById("integracaoUrlHomologacao").value.trim(),
    url_producao:document.getElementById("integracaoUrlProducao").value.trim(),
    metodo:document.getElementById("integracaoMetodo").value,
    formato:document.getElementById("integracaoFormato").value,
    auth_tipo:document.getElementById("integracaoAuthTipo").value,
    api_key_header:document.getElementById("integracaoApiKeyHeader").value.trim()||"x-api-key",
    token_url:document.getElementById("integracaoTokenUrl").value.trim(),
    usuario_campo:document.getElementById("integracaoUsuarioCampo").value.trim()||"username",
    senha_campo:document.getElementById("integracaoSenhaCampo").value.trim()||"password",
    token_resposta_campo:document.getElementById("integracaoTokenRespostaCampo").value.trim()||"access_token"
  };
}

function preencherConfiguracaoIntegracao(config={}){
  const mapa={
    integracaoAmbiente:config.ambiente||"homologacao",
    integracaoStatusTecnico:config.status_tecnico||"aguardando_credenciais",
    integracaoUrlHomologacao:config.url_homologacao||"",
    integracaoUrlProducao:config.url_producao||"",
    integracaoMetodo:config.metodo||"POST",
    integracaoFormato:config.formato||"json",
    integracaoAuthTipo:config.auth_tipo||"none",
    integracaoApiKeyHeader:config.api_key_header||"x-api-key",
    integracaoTokenUrl:config.token_url||"",
    integracaoUsuarioCampo:config.usuario_campo||"username",
    integracaoSenhaCampo:config.senha_campo||"password",
    integracaoTokenRespostaCampo:config.token_resposta_campo||"access_token"
  };
  Object.entries(mapa).forEach(([id,valor])=>{
    const el=document.getElementById(id);
    if(el)el.value=valor;
  });
  atualizarCamposAuthIntegracao();
}

async function carregarConfiguracaoIntegracao(){
  const conviteId=document.getElementById("integracaoSeguraConviteId").value;
  if(!conviteId)return;

  const resposta=await banco
    .from("integracao_configuracoes")
    .select("*")
    .eq("convite_id",conviteId)
    .maybeSingle();

  if(resposta.error){
    console.warn("Configuração da integração:",resposta.error.message);
    return;
  }

  preencherConfiguracaoIntegracao(resposta.data||{});
}

async function salvarConfiguracaoIntegracao(){
  const config=configuracaoTelaIntegracao();
  if(!config.convite_id)return alert("Selecione a transportadora.");

  if(config.url_homologacao && !config.url_homologacao.startsWith("https://")){
    return alert("A URL de homologação precisa começar com https://");
  }

  const resposta=await banco
    .from("integracao_configuracoes")
    .upsert({
      ...config,
      atualizado_em:new Date().toISOString(),
      atualizado_por:usuarioLogado?.login||null
    },{onConflict:"convite_id"})
    .select()
    .single();

  if(resposta.error){
    alert("Não foi possível salvar a configuração: "+resposta.error.message);
    return null;
  }

  alert("Configuração salva.");
  return resposta.data;
}

function atualizarCamposAuthIntegracao(){
  const tipo=document.getElementById("integracaoAuthTipo")?.value;
  const tokenUrl=document.getElementById("integracaoTokenUrl");
  const apiHeader=document.getElementById("integracaoApiKeyHeader");
  if(tokenUrl)tokenUrl.disabled=tipo!=="login_token";
  if(apiHeader)apiHeader.disabled=tipo!=="api_key";
}

function credenciaisTelaIntegracao(){
  return {
    username:document.getElementById("integracaoCredUsuario").value,
    password:document.getElementById("integracaoCredSenha").value,
    token:document.getElementById("integracaoCredToken").value,
    api_key:document.getElementById("integracaoCredApiKey").value,
    client_id:document.getElementById("integracaoCredClientId").value,
    client_secret:document.getElementById("integracaoCredClientSecret").value
  };
}

async function salvarCredenciaisIntegracao(){
  const conviteId=document.getElementById("integracaoSeguraConviteId").value;
  const ambiente=document.getElementById("integracaoAmbiente").value;

  if(!chaveAdminIntegracoes()){
    return alert("Valide a chave administrativa primeiro.");
  }

  try{
    const resposta=await requisicaoIntegracoes("/api/integracoes/salvar-credenciais",{
      method:"POST",
      body:JSON.stringify({
        convite_id:conviteId,
        ambiente,
        credenciais:credenciaisTelaIntegracao()
      })
    });

    ["integracaoCredSenha","integracaoCredToken","integracaoCredApiKey","integracaoCredClientSecret"]
      .forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});

    statusCampoIntegracao(
      "integracaoCredenciaisStatus",
      `Credenciais salvas em ${new Date(resposta.atualizado_em).toLocaleString("pt-BR")}`,
      "ok"
    );
  }catch(erro){
    statusCampoIntegracao("integracaoCredenciaisStatus",erro.message,"erro");
  }
}

async function carregarStatusCredenciaisIntegracao(){
  const conviteId=document.getElementById("integracaoSeguraConviteId").value;
  const ambiente=document.getElementById("integracaoAmbiente").value;
  if(!conviteId||!chaveAdminIntegracoes())return;

  try{
    const resposta=await requisicaoIntegracoes(
      `/api/integracoes/status-credenciais?convite_id=${encodeURIComponent(conviteId)}&ambiente=${encodeURIComponent(ambiente)}`
    );

    statusCampoIntegracao(
      "integracaoCredenciaisStatus",
      resposta.existe
        ? `Credenciais protegidas — atualizadas em ${new Date(resposta.atualizado_em).toLocaleString("pt-BR")}`
        : "Ainda não existem credenciais neste ambiente",
      resposta.existe?"ok":""
    );
  }catch(erro){
    statusCampoIntegracao("integracaoCredenciaisStatus",erro.message,"erro");
  }
}

async function testarHomologacaoIntegracao(){
  if(!chaveAdminIntegracoes()){
    return alert("Valide a chave administrativa primeiro.");
  }

  const config=await salvarConfiguracaoIntegracao();
  if(!config)return;

  const resultado=document.getElementById("integracaoResultadoTeste");
  resultado.className="integracao-resultado-teste";
  resultado.textContent="Testando conexão...";

  let corpo={};
  try{
    corpo=JSON.parse(document.getElementById("integracaoTesteJson").value||"{}");
  }catch{
    resultado.className="integracao-resultado-teste erro";
    resultado.textContent="O corpo de teste não é um JSON válido.";
    return;
  }

  try{
    const resposta=await requisicaoIntegracoes("/api/integracoes/testar-homologacao",{
      method:"POST",
      body:JSON.stringify({
        convite_id:config.convite_id,
        corpo
      })
    });

    resultado.className="integracao-resultado-teste sucesso";
    resultado.textContent=[
      "TESTE CONCLUÍDO",
      `HTTP: ${resposta.http_status}`,
      `Tempo: ${resposta.tempo_ms} ms`,
      `URL: ${resposta.url}`,
      "",
      "RESPOSTA:",
      JSON.stringify(resposta.resposta,null,2)
    ].join("\n");

    document.getElementById("integracaoStatusTecnico").value="homologacao";
    await salvarConfiguracaoIntegracao();
  }catch(erro){
    resultado.className="integracao-resultado-teste erro";
    resultado.textContent="FALHA NO TESTE\n\n"+erro.message;
  }
}

async function aprovarHomologacaoIntegracao(){
  const resultado=document.getElementById("integracaoResultadoTeste");
  if(!resultado.classList.contains("sucesso")){
    return alert("Realize um teste com sucesso antes de aprovar.");
  }

  if(!confirm("Confirmar que a homologação foi revisada e aprovada?"))return;

  document.getElementById("integracaoStatusTecnico").value="homologacao_aprovada";
  const config=await salvarConfiguracaoIntegracao();
  if(!config)return;

  await banco.from("integracao_convites").update({
    status:"aprovado",
    atualizado_em:new Date().toISOString()
  }).eq("id",config.convite_id);

  alert("Homologação aprovada. A produção continuará bloqueada até a ativação final.");
  carregarIntegracoesTransportadoras();
}

document.addEventListener("change",evento=>{
  if(evento.target?.id==="integracaoAmbiente"){
    carregarStatusCredenciaisIntegracao();
  }
});
