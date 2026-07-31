/* =========================================================
   MOTOR DE INTEGRAÇÕES V1 — V15
   ========================================================= */
let motorIntegracoes=[],motorEndpoints=[],motorLogs=[];

function mi(id){return document.getElementById(id)}
function miv(id){return mi(id)?.value?.trim()||""}
function escaparMotor(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

async function abrirMotorIntegracoes(){
  mi("motorIntegracoesCard").style.display="block";
  await carregarMotorIntegracoes();
  mi("motorIntegracoesCard").scrollIntoView({behavior:"smooth",block:"start"});
}
function fecharMotorIntegracoes(){mi("motorIntegracoesCard").style.display="none"}

async function carregarMotorIntegracoes(){
  const [integracoes,endpoints,logs]=await Promise.all([
    banco.from("transportadora_integracoes").select("*").order("created_at",{ascending:false}),
    banco.from("transportadora_endpoints").select("*").order("operacao"),
    banco.from("integracao_logs").select("*").order("created_at",{ascending:false}).limit(100)
  ]);
  motorIntegracoes=integracoes.error?[]:integracoes.data||[];
  motorEndpoints=endpoints.error?[]:endpoints.data||[];
  motorLogs=logs.error?[]:logs.data||[];

  const select=mi("motorConviteId");
  select.innerHTML='<option value="">Selecione</option>'+
    (integracoesTransportadoras||[]).map(c=>`<option value="${c.id}">${escaparMotor(c.transportadora_nome)}</option>`).join("");

  montarKpisMotor();
  montarEndpointsMotor();
  montarLogsMotor();
  carregarChecklistHomologacaoRodonaves();
  carregarHistoricoRodonavesMotor();
  cubagemRodonavesTela();
  atualizarPreviewPacksRodonaves();
}

function montarKpisMotor(){
  const box=mi("motorIntegracoesKpis");
  const homologacao=motorIntegracoes.filter(x=>x.status_tecnico==="homologacao").length;
  const ativas=motorIntegracoes.filter(x=>x.status_tecnico==="producao").length;
  const sucessos=motorLogs.filter(x=>x.sucesso).length;
  box.innerHTML=`
    <div><span>Transportadoras</span><b>${motorIntegracoes.length}</b></div>
    <div><span>Em homologação</span><b>${homologacao}</b></div>
    <div><span>Ativas</span><b>${ativas}</b></div>
    <div><span>Testes com sucesso</span><b>${sucessos}</b></div>`;
}

function integracaoMotorAtual(){
  return motorIntegracoes.find(x=>String(x.convite_id)===miv("motorConviteId"));
}
function selecionarIntegracaoMotor(){
  const it=integracaoMotorAtual();
  mi("motorApiVersao").value=it?.api_versao||"v1";
  mi("motorStatus").value=it?.status_tecnico||"configurando";
  mi("motorCotacaoAtiva").checked=!!it?.cotacao_ativa;
  mi("motorPrazoAtivo").checked=!!it?.prazo_ativo;
  mi("motorColetaAtiva").checked=!!it?.coleta_ativa;
  mi("motorRastreioAtivo").checked=!!it?.rastreamento_ativo;
  montarEndpointsMotor();
  montarLogsMotor();
}

async function salvarIntegracaoMotor(){
  const conviteId=miv("motorConviteId");
  if(!conviteId)return alert("Selecione a transportadora.");
  const convite=(integracoesTransportadoras||[]).find(x=>String(x.id)===conviteId);
  const payload={
    convite_id:conviteId,
    transportadora_nome:convite?.transportadora_nome||"Transportadora",
    api_versao:miv("motorApiVersao")||"v1",
    status_tecnico:miv("motorStatus"),
    cotacao_ativa:mi("motorCotacaoAtiva").checked,
    prazo_ativo:mi("motorPrazoAtivo").checked,
    coleta_ativa:mi("motorColetaAtiva").checked,
    rastreamento_ativo:mi("motorRastreioAtivo").checked,
    atualizado_em:new Date().toISOString()
  };
  const r=await banco.from("transportadora_integracoes").upsert(payload,{onConflict:"convite_id"}).select().single();
  if(r.error)return alert(r.error.message);
  alert("Ficha técnica salva.");
  await carregarMotorIntegracoes();
  mi("motorConviteId").value=conviteId;
  selecionarIntegracaoMotor();
}

function abrirCredenciaisMotor(){
  const id=miv("motorConviteId");
  if(!id)return alert("Selecione a transportadora.");
  abrirIntegracaoSegura(id);
}

function montarEndpointsMotor(){
  const box=mi("motorEndpointsLista");
  if(!box)return;
  const conviteId=miv("motorConviteId");
  if(!conviteId){box.innerHTML="Selecione uma transportadora.";return}
  const lista=motorEndpoints.filter(x=>String(x.convite_id)===conviteId);
  box.innerHTML=lista.length?lista.map(e=>`
    <div class="motor-endpoint-item">
      <div><span class="motor-endpoint-badge">${escaparMotor(e.operacao)} • ${escaparMotor(e.ambiente)}</span>
      <strong>${escaparMotor(e.metodo)} — ${escaparMotor(e.formato)}</strong>
      <small>${escaparMotor(e.url)}</small></div>
      <div class="motor-endpoint-acoes">
        <button class="btn azul" onclick="editarEndpointMotor('${e.id}')">Editar</button>
        <button class="btn vermelho" onclick="excluirEndpointMotor('${e.id}')">Excluir</button>
      </div>
    </div>`).join(""):"Nenhum endpoint cadastrado.";
}
function novoEndpointMotor(){
  if(!miv("motorConviteId"))return alert("Selecione a transportadora.");
  ["motorEndpointId","motorEndpointUrl","motorEndpointObservacao"].forEach(id=>mi(id).value="");
  mi("motorEndpointOperacao").value="token";mi("motorEndpointAmbiente").value="homologacao";
  mi("motorEndpointMetodo").value="POST";mi("motorEndpointFormato").value="form";
  mi("motorEndpointEditor").style.display="block";
}
function fecharEndpointMotor(){mi("motorEndpointEditor").style.display="none"}
function editarEndpointMotor(id){
  const e=motorEndpoints.find(x=>String(x.id)===String(id));if(!e)return;
  mi("motorEndpointId").value=e.id;mi("motorEndpointOperacao").value=e.operacao;
  mi("motorEndpointAmbiente").value=e.ambiente;mi("motorEndpointMetodo").value=e.metodo;
  mi("motorEndpointFormato").value=e.formato;mi("motorEndpointUrl").value=e.url;
  mi("motorEndpointObservacao").value=e.observacao||"";
  mi("motorEndpointEditor").style.display="block";
}
async function salvarEndpointMotor(){
  const url=miv("motorEndpointUrl");
  if(!url.startsWith("https://"))return alert("A URL precisa começar com https://");
  const payload={
    convite_id:miv("motorConviteId"),operacao:miv("motorEndpointOperacao"),
    ambiente:miv("motorEndpointAmbiente"),metodo:miv("motorEndpointMetodo"),
    formato:miv("motorEndpointFormato"),url,observacao:miv("motorEndpointObservacao")||null,
    atualizado_em:new Date().toISOString()
  };
  const id=miv("motorEndpointId");
  const r=id?await banco.from("transportadora_endpoints").update(payload).eq("id",id):
    await banco.from("transportadora_endpoints").insert([payload]);
  if(r.error)return alert(r.error.message);
  fecharEndpointMotor();await carregarMotorIntegracoes();mi("motorConviteId").value=payload.convite_id;selecionarIntegracaoMotor();
}
async function excluirEndpointMotor(id){
  if(!confirm("Excluir este endpoint?"))return;
  const r=await banco.from("transportadora_endpoints").delete().eq("id",id);
  if(r.error)alert(r.error.message);else{await carregarMotorIntegracoes();selecionarIntegracaoMotor()}
}

async function criarPresetRodonaves(){
  let convite=(integracoesTransportadoras||[]).find(x=>/rodonaves/i.test(x.transportadora_nome||""));
  if(!convite){
    alert("Crie primeiro um convite com o nome Rodonaves na Central de Integrações.");
    return;
  }
  await banco.from("transportadora_integracoes").upsert({
    convite_id:convite.id,transportadora_nome:convite.transportadora_nome,api_versao:"v1",
    status_tecnico:"configurando",cotacao_ativa:true,prazo_ativo:true,
    coleta_ativa:false,rastreamento_ativo:true,atualizado_em:new Date().toISOString()
  },{onConflict:"convite_id"});

  const endpoints=[
    {operacao:"token",ambiente:"homologacao",metodo:"POST",formato:"form",url:"https://quotation-apigateway.rte.com.br/token",observacao:"auth_type=DEV; grant_type=password"},
    {operacao:"cotacao",ambiente:"homologacao",metodo:"POST",formato:"json",url:"https://quotation-apigateway.rte.com.br/api/v1/gera-cotacao",observacao:"Bearer Token; content-type application/json"},
    {operacao:"rastreamento",ambiente:"homologacao",metodo:"GET",formato:"json",url:"https://tracking-apigateway.rte.com.br/api/v1/tracking",observacao:"Bearer Token"}
  ].map(x=>({...x,convite_id:convite.id,atualizado_em:new Date().toISOString()}));

  for(const ep of endpoints){
    const existente=await banco.from("transportadora_endpoints").select("id").eq("convite_id",convite.id).eq("operacao",ep.operacao).eq("ambiente",ep.ambiente).maybeSingle();
    if(existente.data?.id)await banco.from("transportadora_endpoints").update(ep).eq("id",existente.data.id);
    else await banco.from("transportadora_endpoints").insert([ep]);
  }
  await carregarMotorIntegracoes();mi("motorConviteId").value=convite.id;selecionarIntegracaoMotor();
  alert("Preset inicial da Rodonaves criado. Agora salve as credenciais e teste a autenticação.");
}

async function carregarLogsMotor(){
  const r=await banco.from("integracao_logs").select("*").order("created_at",{ascending:false}).limit(100);
  motorLogs=r.error?[]:r.data||[];montarLogsMotor();montarKpisMotor();
}
function montarLogsMotor(){
  const tb=mi("motorLogsTabela");if(!tb)return;
  const conviteId=miv("motorConviteId");
  const lista=conviteId?motorLogs.filter(x=>String(x.convite_id)===conviteId):motorLogs;
  tb.innerHTML=lista.length?lista.map(l=>`<tr>
    <td>${new Date(l.created_at).toLocaleString("pt-BR")}</td>
    <td>${escaparMotor(l.transportadora_nome||"—")}</td>
    <td>${escaparMotor(l.operacao)}</td><td>${escaparMotor(l.ambiente)}</td>
    <td>${l.http_status??"—"}</td><td>${l.tempo_ms!=null?l.tempo_ms+" ms":"—"}</td>
    <td>${l.sucesso?"✅ Sucesso":"❌ "+escaparMotor(l.mensagem||"Falha")}</td>
  </tr>`).join(""):'<tr><td colspan="7">Nenhum teste registrado.</td></tr>';
}

async function testarCotacaoRodonavesMotor(){
  const conviteId=miv("motorConviteId"),resultado=mi("testeRodoResultado");
  if(!conviteId)return alert("Selecione a Rodonaves.");
  const convite=(integracoesTransportadoras||[]).find(x=>String(x.id)===String(conviteId));
  if(!/rodonaves/i.test(convite?.transportadora_nome||""))return alert("Teste exclusivo da Rodonaves.");
  const adminKey=sessionStorage.getItem("integrations_admin_key")||"";
  if(!adminKey)return alert("Valide a chave administrativa em Credenciais/Teste.");

  const documento=miv("testeRodoDocumento"),cep=miv("testeRodoCep");
  const peso=numeroMotorBR(miv("testeRodoPeso"));
  const volumes=Number(miv("testeRodoVolumes"));
  const valor=numeroMotorBR(miv("testeRodoValor"));
  const altura=numeroMotorBR(miv("testeRodoAltura"));
  const largura=numeroMotorBR(miv("testeRodoLargura"));
  const comprimento=numeroMotorBR(miv("testeRodoComprimento"));
  const pesoUnitario=numeroMotorBR(miv("testeRodoPesoUnitario"))||(peso/volumes);
  const cubagem=cubagemRodonavesTela();

  if(documento.replace(/\D/g,"").length<11)return alert("Informe CNPJ/CPF válido.");
  if(cep.replace(/\D/g,"").length!==8)return alert("Informe CEP válido.");
  if(!peso||!volumes||!valor)return alert("Informe peso, volumes e valor.");

  resultado.className="integracao-resultado-teste";
  resultado.textContent="Executando homologação completa...";

  try{
    const r=await fetch("/api/integracoes/cotar-rodonaves",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-integrations-admin-key":adminKey},
      body:JSON.stringify({
        cotacao_id:null,
        cliente_nome:miv("testeRodoCliente")||"Cliente de teste",
        cpf_cnpj_destino:documento,
        cep_destino:cep,
        peso_total:peso,
        valor_nf:valor,
        volumes,
        solicitante:"Johnny",
        tipo_frete:"CIF",
        servico:miv("testeRodoServico"),
        embalagem:miv("testeRodoEmbalagem"),
        altura_cm:altura,
        largura_cm:largura,
        comprimento_cm:comprimento,
        peso_unitario:pesoUnitario,
        cubagem_total:cubagem,
        enviar_packs:!!mi("testeRodoEnviarPacks")?.checked,
        modo_packs:miv("testeRodoModoPacks")||"agrupado",
        packs:atualizarPreviewPacksRodonaves()
      })
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);
    window.__ultimaCotacaoRodonaves=d;

    mi("checkRodoAuth").checked=true;
    mi("checkRodoCidades").checked=true;
    mi("checkRodoCotacao").checked=true;
    mi("checkRodoPrazo").checked=!!d.prazo_dias;
    mi("checkRodoProtocolo").checked=!!d.numero_cotacao;
    atualizarProgressoRodonaves();

    resultado.className="integracao-resultado-teste sucesso";
    resultado.textContent=[
      "HOMOLOGAÇÃO RODONAVES: OK","",
      "AUTENTICAÇÃO: OK",
      `ORIGEM: ${d.cidade_origem||"OK"}`,
      `DESTINO: ${d.cidade_destino||"OK"}`,"",
      `PESO: ${peso.toLocaleString("pt-BR")} kg`,
      `VOLUMES: ${volumes}`,
      `DIMENSÕES: ${altura} x ${largura} x ${comprimento} cm`,
      `CUBAGEM REGISTRADA: ${cubagem.toLocaleString("pt-BR",{minimumFractionDigits:3})} m³`,
      `EMBALAGEM: ${miv("testeRodoEmbalagem")}`,
      `PACKS ENVIADO: ${d.packs_enviados?"SIM":"NÃO"}`,
      `FORMATO PACKS: ${d.modo_packs||"—"}`,
      `OBJETOS EM PACKS: ${d.quantidade_packs||0}`,"",
      `HTTP: ${r.status}`,
      `VALOR: ${Number(d.valor_frete||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`,
      `PRAZO: ${d.prazo_dias?d.prazo_dias+" dias úteis":"não informado"}`,
      `PROTOCOLO: ${d.numero_cotacao||"não informado"}`,
      `TEMPO: ${d.tempo_ms||0} ms`,"",
      d.aviso||""
    ].join("\n");

    await carregarLogsMotor();
    await carregarHistoricoRodonavesMotor();
  }catch(e){
    resultado.className="integracao-resultado-teste erro";
    resultado.textContent="FALHA NA HOMOLOGAÇÃO\n\n"+e.message;
  }
}

function numeroMotorBR(valor){
  return Number(String(valor||"").replace(/\./g,"").replace(",","."));
}
function cubagemRodonavesTela(){
  const a=numeroMotorBR(miv("testeRodoAltura"));
  const l=numeroMotorBR(miv("testeRodoLargura"));
  const c=numeroMotorBR(miv("testeRodoComprimento"));
  const v=Number(miv("testeRodoVolumes"))||0;
  const cubagem=(a*l*c*v)/1000000;
  const el=mi("testeRodoCubagem");
  if(el)el.textContent=`${cubagem.toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3})} m³`;
  return cubagem;
}
["testeRodoAltura","testeRodoLargura","testeRodoComprimento","testeRodoVolumes"].forEach(id=>{
  document.addEventListener("input",e=>{if(e.target?.id===id)cubagemRodonavesTela()});
});

async function carregarHistoricoRodonavesMotor(){
  const tb=mi("historicoRodoTabela");
  if(!tb)return;
  const r=await banco.rpc("listar_rodonaves_cotacoes_seguras",{p_limite:50});
  if(r.error){
    tb.innerHTML=`<tr><td colspan="9">${escaparMotor(r.error.message)}</td></tr>`;
    return;
  }
  const lista=r.data||[];
  tb.innerHTML=lista.length?lista.map(x=>`<tr>
    <td>${new Date(x.created_at).toLocaleString("pt-BR")}</td>
    <td>${escaparMotor(x.cliente_nome||"—")}</td>
    <td>${escaparMotor(x.cep_destino||"—")}</td>
    <td>${x.peso_total??"—"} kg</td>
    <td>${x.volumes??"—"}</td>
    <td>${x.cubagem_total!=null?Number(x.cubagem_total).toLocaleString("pt-BR",{minimumFractionDigits:3})+" m³":"—"}</td>
    <td>${x.valor_frete!=null?Number(x.valor_frete).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"—"}</td>
    <td>${x.prazo_dias??"—"}</td>
    <td>${escaparMotor(x.numero_cotacao||"—")}</td>
  </tr>`).join(""):'<tr><td colspan="9">Nenhum teste registrado.</td></tr>';
}

function atualizarProgressoRodonaves(){
  const ids=["checkRodoAuth","checkRodoCidades","checkRodoCotacao","checkRodoPrazo","checkRodoProtocolo","checkRodoComparado","checkRodoCubagem"];
  const feitos=ids.filter(id=>mi(id)?.checked).length;
  const pct=Math.round((feitos/ids.length)*100);
  if(mi("progressoRodoBarra"))mi("progressoRodoBarra").style.width=`${pct}%`;
  if(mi("progressoRodoTexto"))mi("progressoRodoTexto").textContent=`${pct}% concluído`;
  const selo=mi("seloHomologacaoRodo");
  const basico=
    mi("checkRodoAuth")?.checked &&
    mi("checkRodoCidades")?.checked &&
    mi("checkRodoCotacao")?.checked &&
    mi("checkRodoPrazo")?.checked &&
    mi("checkRodoProtocolo")?.checked &&
    mi("checkRodoComparado")?.checked;
  if(selo){
    const completa=basico&&mi("checkRodoCubagem")?.checked;
    selo.className=`selo-homologacao-rodo ${completa?"completo":basico?"ok":"pendente"}`;
    selo.textContent=completa
      ?"✅ Cotação CIF Rodonaves homologada — 100%"
      :basico
        ?"✅ CIF básico homologado — cubagem ainda pendente"
        :"⏳ Cotação CIF aguardando homologação";
  }
  return {pct,ids,basico,completa:basico&&mi("checkRodoCubagem")?.checked};
}
document.addEventListener("change",e=>{
  if(/^checkRodo/.test(e.target?.id||""))atualizarProgressoRodonaves();
});

async function salvarChecklistHomologacaoRodonaves(){
  const conviteId=miv("motorConviteId");
  if(!conviteId)return alert("Selecione a Rodonaves.");
  const {pct,ids}=atualizarProgressoRodonaves();
  const payload={
    convite_id:conviteId,
    autenticacao:mi("checkRodoAuth").checked,
    cidades:mi("checkRodoCidades").checked,
    cotacao:mi("checkRodoCotacao").checked,
    prazo:mi("checkRodoPrazo").checked,
    protocolo:mi("checkRodoProtocolo").checked,
    comparado_portal:mi("checkRodoComparado").checked,
    cubagem_validada:mi("checkRodoCubagem").checked,
    percentual:pct,
    atualizado_em:new Date().toISOString()
  };
  const r=await banco.from("integracao_homologacao_checklist").upsert(payload,{onConflict:"convite_id"});
  if(r.error)alert(r.error.message);else alert("Checklist salvo.");
}

async function carregarChecklistHomologacaoRodonaves(){
  const conviteId=miv("motorConviteId");
  if(!conviteId)return;
  const r=await banco.from("integracao_homologacao_checklist").select("*").eq("convite_id",conviteId).maybeSingle();
  const x=r.data||{};
  const mapa={
    checkRodoAuth:x.autenticacao,checkRodoCidades:x.cidades,checkRodoCotacao:x.cotacao,
    checkRodoPrazo:x.prazo,checkRodoProtocolo:x.protocolo,checkRodoComparado:x.comparado_portal,
    checkRodoCubagem:x.cubagem_validada
  };
  Object.entries(mapa).forEach(([id,v])=>{if(mi(id))mi(id).checked=!!v});
  atualizarProgressoRodonaves();
}


function normalizarCepRodo(v){return String(v||"").replace(/\D/g,"")}
function quaseIgualRodo(a,b,tolerancia=0.01){return Math.abs(Number(a||0)-Number(b||0))<=tolerancia}

function preencherComparacaoComDadosTeste(){
  mi("testeRodoCepPortal").value=miv("testeRodoCep");
  mi("testeRodoPesoPortal").value=miv("testeRodoPeso");
  mi("testeRodoVolumesPortal").value=miv("testeRodoVolumes");
  mi("testeRodoNfPortal").value=miv("testeRodoValor");
  mi("testeRodoAlturaPortal").value=miv("testeRodoAltura");
  mi("testeRodoLarguraPortal").value=miv("testeRodoLargura");
  mi("testeRodoComprimentoPortal").value=miv("testeRodoComprimento");
  mi("testeRodoPesoUnitarioPortal").value=miv("testeRodoPesoUnitario");
}

function validarDadosComparacaoRodonaves(){
  const campos=[
    ["CEP destino",normalizarCepRodo(miv("testeRodoCep")),normalizarCepRodo(miv("testeRodoCepPortal")),"texto"],
    ["Peso total",numeroMotorBR(miv("testeRodoPeso")),numeroMotorBR(miv("testeRodoPesoPortal")),"numero"],
    ["Volumes",Number(miv("testeRodoVolumes")),Number(miv("testeRodoVolumesPortal")),"numero"],
    ["Valor da NF",numeroMotorBR(miv("testeRodoValor")),numeroMotorBR(miv("testeRodoNfPortal")),"numero"],
    ["Altura",numeroMotorBR(miv("testeRodoAltura")),numeroMotorBR(miv("testeRodoAlturaPortal")),"numero"],
    ["Largura",numeroMotorBR(miv("testeRodoLargura")),numeroMotorBR(miv("testeRodoLarguraPortal")),"numero"],
    ["Comprimento",numeroMotorBR(miv("testeRodoComprimento")),numeroMotorBR(miv("testeRodoComprimentoPortal")),"numero"],
    ["Peso por volume",numeroMotorBR(miv("testeRodoPesoUnitario")),numeroMotorBR(miv("testeRodoPesoUnitarioPortal")),"numero"]
  ];
  return campos.filter(([nome,a,b,tipo])=>{
    if(tipo==="texto")return !a||!b||a!==b;
    return !a||!b||!quaseIgualRodo(a,b,0.02);
  }).map(([nome,a,b])=>`${nome}: teste "${a||"vazio"}" × portal "${b||"vazio"}"`);
}

async function compararCotacaoRodonaves(){
  const divergencias=validarDadosComparacaoRodonaves();
  const box=mi("comparacaoRodoResultado");
  if(divergencias.length){
    box.className="integracao-resultado-teste erro";
    box.textContent=[
      "COMPARAÇÃO BLOQUEADA",
      "",
      "Os dados do teste e do Portal Rodonaves não são iguais:",
      ...divergencias.map(x=>"• "+x),
      "",
      "Corrija os campos e gere novamente a cotação no portal."
    ].join("\n");
    mi("checkRodoComparado").checked=false;
    mi("checkRodoCubagem").checked=false;
    atualizarProgressoRodonaves();
    return;
  }
  const portal=numeroMotorBR(miv("testeRodoValorPortal"));
  const prazoPortal=Number(miv("testeRodoPrazoPortal"))||0;
  const apiValor=Number(window.__ultimaCotacaoRodonaves?.valor_frete||0);
  const apiPrazo=Number(window.__ultimaCotacaoRodonaves?.prazo_dias||0);
  if(!portal||!apiValor){
    box.className="integracao-resultado-teste erro";
    box.textContent="Execute uma cotação e informe o valor do portal.";
    return;
  }
  const dif=apiValor-portal;
  const pctDif=(dif/portal)*100;
  const prazoDif=apiPrazo-prazoPortal;
  const valorOk=Math.abs(pctDif)<=2;
  const prazoOk=!prazoPortal||prazoDif===0;
  const comparacaoOk=valorOk&&prazoOk;

  box.className=`integracao-resultado-teste ${comparacaoOk?"sucesso":"erro"}`;
  box.textContent=[
    `API: ${apiValor.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`,
    `Portal: ${portal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`,
    `Diferença: ${dif.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} (${pctDif.toFixed(2)}%)`,
    `Prazo API: ${apiPrazo||"—"} | Portal: ${prazoPortal||"—"} | Diferença: ${prazoDif}`,
    "",
    comparacaoOk
      ?packsUsados?"Cotação CIF, cubagem e Packs validados. Homologação concluída em 100%.":"CIF básico validado e registrado automaticamente."
      :"A comparação não foi aprovada automaticamente."
  ].join("\n");

  mi("checkRodoComparado").checked=comparacaoOk;
  const packsUsados=!!window.__ultimaCotacaoRodonaves?.packs_enviados;
  if(comparacaoOk&&packsUsados)mi("checkRodoCubagem").checked=true;
  atualizarProgressoRodonaves();

  const conviteId=miv("motorConviteId");
  if(conviteId){
    const {pct,basico}=atualizarProgressoRodonaves();
    const r=await banco.from("integracao_homologacao_checklist").upsert({
      convite_id:conviteId,
      autenticacao:mi("checkRodoAuth").checked,
      cidades:mi("checkRodoCidades").checked,
      cotacao:mi("checkRodoCotacao").checked,
      prazo:mi("checkRodoPrazo").checked,
      protocolo:mi("checkRodoProtocolo").checked,
      comparado_portal:comparacaoOk,
      cubagem_validada:mi("checkRodoCubagem").checked,
      percentual:pct,
      valor_api:apiValor,
      valor_portal:portal,
      diferenca_valor:dif,
      diferenca_percentual:pctDif,
      prazo_api:apiPrazo||null,
      prazo_portal:prazoPortal||null,
      cep_portal:normalizarCepRodo(miv("testeRodoCepPortal"))||null,
      peso_portal:numeroMotorBR(miv("testeRodoPesoPortal"))||null,
      volumes_portal:Number(miv("testeRodoVolumesPortal"))||null,
      nf_portal:numeroMotorBR(miv("testeRodoNfPortal"))||null,
      altura_portal:numeroMotorBR(miv("testeRodoAlturaPortal"))||null,
      largura_portal:numeroMotorBR(miv("testeRodoLarguraPortal"))||null,
      comprimento_portal:numeroMotorBR(miv("testeRodoComprimentoPortal"))||null,
      peso_unitario_portal:numeroMotorBR(miv("testeRodoPesoUnitarioPortal"))||null,
      homologacao_cif_basica:basico,
      homologacao_completa:basico&&mi("checkRodoCubagem").checked,
      packs_modo_validado:mi("checkRodoCubagem").checked?(miv("testeRodoModoPacks")||"agrupado"):null,
      homologado_em:basico&&mi("checkRodoCubagem").checked?new Date().toISOString():null,
      comparado_em:new Date().toISOString(),
      atualizado_em:new Date().toISOString()
    },{onConflict:"convite_id"});
    if(r.error)console.warn("Salvar comparação:",r.error.message);
  }
}

function montarPacksRodonavesTela(){
  const volumes=Math.max(0,Number(miv("testeRodoVolumes"))||0);
  const pesoTotal=numeroMotorBR(miv("testeRodoPeso"));
  const pesoInformado=numeroMotorBR(miv("testeRodoPesoUnitario"));
  const pesoUnitario=pesoInformado||(volumes?pesoTotal/volumes:0);
  const altura=numeroMotorBR(miv("testeRodoAltura"));
  const largura=numeroMotorBR(miv("testeRodoLargura"));
  const comprimento=numeroMotorBR(miv("testeRodoComprimento"));
  const modo=miv("testeRodoModoPacks")||"agrupado";

  if(!volumes||!pesoUnitario||!altura||!largura||!comprimento)return [];

  const pacote={
    AmountPackages:modo==="agrupado"?volumes:1,
    Weight:Number(pesoUnitario.toFixed(3)),
    Length:Number(comprimento.toFixed(3)),
    Height:Number(altura.toFixed(3)),
    Width:Number(largura.toFixed(3))
  };

  return modo==="agrupado"
    ? [pacote]
    : Array.from({length:volumes},()=>({...pacote}));
}

function atualizarPreviewPacksRodonaves(){
  const ativo=!!mi("testeRodoEnviarPacks")?.checked;
  const packs=ativo?montarPacksRodonavesTela():[];
  const preview=mi("testeRodoPacksPreview");
  if(preview)preview.textContent=JSON.stringify({Packs:packs},null,2);
  return packs;
}

["testeRodoPeso","testeRodoPesoUnitario","testeRodoAltura","testeRodoLargura","testeRodoComprimento","testeRodoVolumes"]
.forEach(id=>{
  document.addEventListener("input",e=>{
    if(e.target?.id===id)atualizarPreviewPacksRodonaves();
  });
});
