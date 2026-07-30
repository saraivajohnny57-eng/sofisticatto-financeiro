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
