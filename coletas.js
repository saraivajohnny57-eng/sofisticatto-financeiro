
/* =========================================================
   AGENDAMENTO DE COLETA — V13.4
   ========================================================= */
let coletaModelos=[],coletaAgendamentos=[],coletaTransportadoras=[],coletaInicializado=false;

const COLETA_MODELOS_PADRAO=[
 {nome:"Modelo 1 — WhatsApp",texto:`Para solicitar *Coleta*:

Nome: *{{solicitante}}*
Telefone de onde iremos coletar: *{{telefone_origem}}*
Frete pago pelo remetente ou destino: *{{tipo_frete}}*
CNPJ da origem: *{{cnpj_origem}} {{razao_origem}}*
CNPJ do destino: *{{cnpj_destino}} {{razao_destino}}*
Cidade destino: *{{cidade_destino}}*
Qtd. de volumes: *{{volumes}} Vol*
Peso: *{{peso}} Kg*
Tipo de mercadoria: *{{mercadoria}}, vão em {{embalagem}}*
Até que horas podemos coletar? *{{horario_limite}}*
FACHADA E PONTO DE REFERÊNCIA: *{{referencia}}*

{{localizacao}}`},
 {nome:"Modelo 2 — Dados para coleta",texto:`Dados para *Coleta:*

Nome e telefone do solicitante: *{{solicitante}} — {{telefone_origem}}*
CNPJ do remetente: *{{cnpj_origem}} {{razao_origem}}*
CNPJ do tomador do frete: *{{cnpj_destino}} {{razao_destino}}*
Endereço completo da coleta: *{{endereco_origem}}*
Quantidade de volume: *{{volumes}}*
Peso aproximado: *{{peso}} Kg*
Natureza da nota: *{{natureza}}*
O que é a mercadoria?: *{{mercadoria}}*
A empresa fica aberta até as 17:30 h?: *{{horario_limite}}*
Endereço de coleta: *{{endereco_origem}}*

{{localizacao}}`},
 {nome:"Modelo 3 — Completo",texto:`* CNPJ do remetente ou do local de coleta: *{{cnpj_origem}} {{razao_origem}}*
* CEP e Cidade origem (coleta): *{{cep_origem}}*
* CEP e Cidade Destino (entrega): *{{cep_destino}} — {{cidade_destino}}*
* Endereço de Coleta: *{{endereco_origem}}*

* Valor total da nota fiscal: *{{valor_nf}}*
* Quantidade de volumes: *{{volumes}}*
* Medidas dos volumes (altura x largura x comprimento): *{{medidas}}*
* Peso total: *{{peso}} Kg*

* Tipo de produto?: *{{mercadoria}}*
* Tipo de embalagem?: *{{embalagem}}*
* Horário de atendimento para coleta?: *{{horario_limite}}*
* Possui pausa?: *{{pausa}}*

* CNPJ do destino: *{{cnpj_destino}} {{razao_destino}}*
* Frete pago pelo *{{tipo_frete}}*
* N° da NF: *{{numero_nf}}*

{{localizacao}}`}
];

function ce(id){return document.getElementById(id)}
function cv(id){return ce(id)?.value?.trim()||""}
function coletaMoeda(v){let n=Number(String(v||"").replace(/\./g,"").replace(",","."));return Number.isFinite(n)&&n? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):""}
function mostrarPainelColeta(p){["nova","historico","rodonaves","saidas","entregues","entradas","transportadoras","modelos"].forEach(x=>{ce("coletaPainel"+x[0].toUpperCase()+x.slice(1))?.classList.toggle("ativo",x===p);ce("coletaTab"+x[0].toUpperCase()+x.slice(1))?.classList.toggle("ativo",x===p)});if(p==="historico")montarHistoricoColetas();if(p==="rodonaves"){carregarPainelRodonaves();iniciarSincronizacaoAutomaticaColetas()}else{pararSincronizacaoAutomaticaColetas()}if(p==="saidas")carregarRastreamentosLogistica("saida");if(p==="entregues")carregarRastreamentosEntregues();if(p==="entradas")carregarRastreamentosLogistica("entrada");if(p==="transportadoras")carregarTransportadorasLogistica();if(p==="modelos")montarModelosColeta()}
async function inicializarModuloColetas(){if(coletaInicializado){atualizarPreviaColeta();return}coletaInicializado=true;await Promise.all([carregarTransportadorasColeta(),carregarModelosColeta(),carregarAgendamentosColeta()]);montarClientesColeta();atualizarPreviaColeta()}
async function carregarTransportadorasColeta(){const r=await banco.from("frete_transportadoras").select("*").order("nome");coletaTransportadoras=r.error?[]:r.data||[];const opts='<option value="">Selecione</option>'+coletaTransportadoras.map(t=>`<option value="${t.id}">${escaparHtmlEmail(t.nome||"")}</option>`).join("");ce("coletaTransportadoraId").innerHTML=opts;ce("coletaModeloTransportadoraId").innerHTML='<option value="">Modelo geral</option>'+opts.replace('<option value="">Selecione</option>','')}
async function carregarModelosColeta(){const r=await banco.from("coleta_modelos").select("*").eq("ativo",true).order("nome");coletaModelos=r.error?[]:r.data||[];if(!coletaModelos.length)coletaModelos=COLETA_MODELOS_PADRAO.map((m,i)=>({id:`padrao-${i+1}`,...m,ativo:true}));ce("coletaModeloId").innerHTML=coletaModelos.map(m=>`<option value="${m.id}">${escaparHtmlEmail(m.nome)}</option>`).join("");montarModelosColeta()}
async function carregarAgendamentosColeta(){const r=await banco.from("coleta_agendamentos").select("*,frete_transportadoras(nome),coleta_modelos(nome)").order("created_at",{ascending:false});coletaAgendamentos=r.error?[]:r.data||[];montarHistoricoColetas()}
function montarClientesColeta(){const dl=ce("coletaClientesLista");if(!dl)return;dl.innerHTML=(emailClientes||[]).map(c=>`<option value="${escaparHtmlEmail(c.nome||"")}"></option>`).join("")}
function pesquisarClienteColeta(){ce("coletaClienteId").value="";const q=normalizarNomeEmail(cv("coletaClienteBusca"));const box=ce("coletaClienteResultados");if(q.length<2){box.style.display="none";return}const lista=(emailClientes||[]).filter(c=>normalizarNomeEmail([c.nome,c.cpf_cnpj,c.cidade,c.uf].filter(Boolean).join(" ")).includes(q)).slice(0,12);box.innerHTML=lista.map(c=>`<button type="button" class="coleta-resultado" onclick="selecionarClienteColeta('${c.id}')"><strong>${escaparHtmlEmail(c.nome||"")}</strong><span>${escaparHtmlEmail([c.cpf_cnpj,c.cidade,c.uf].filter(Boolean).join(" • "))}</span></button>`).join("")||'<div class="frete-cliente-sem-resultado">Nenhum cliente encontrado.</div>';box.style.display="block"}
function selecionarClienteColetaPorNome(){const c=(emailClientes||[]).find(x=>normalizarNomeEmail(x.nome)===normalizarNomeEmail(cv("coletaClienteBusca")));if(c)selecionarClienteColeta(c.id)}
function selecionarClienteColeta(id){
  const c=(emailClientes||[]).find(x=>String(x.id)===String(id));
  if(!c)return;

  const valor=(...campos)=>{
    for(const campo of campos){
      if(c?.[campo]!==undefined&&c?.[campo]!==null&&String(c[campo]).trim()!==""){
        return String(c[campo]).trim();
      }
    }
    return "";
  };

  ce("coletaClienteId").value=c.id||"";
  ce("coletaClienteBusca").value=valor("nome","razao_social");
  ce("coletaCnpjDestino").value=valor("cpf_cnpj","cnpj","documento");
  ce("coletaRazaoDestino").value=valor("nome","razao_social");
  ce("coletaCepDestino").value=valor("cep");
  ce("coletaCidadeDestino").value=[
    valor("cidade"),
    valor("uf","estado")
  ].filter(Boolean).join("/");

  if(ce("coletaEnderecoDestino")){
    ce("coletaEnderecoDestino").value=valor(
      "logradouro","endereco","rua","endereco_logradouro"
    );
  }
  if(ce("coletaNumeroDestino")){
    ce("coletaNumeroDestino").value=valor(
      "numero","numero_endereco","endereco_numero"
    );
  }
  if(ce("coletaComplementoDestino")){
    ce("coletaComplementoDestino").value=valor(
      "complemento","endereco_complemento"
    );
  }
  if(ce("coletaBairroDestino")){
    ce("coletaBairroDestino").value=valor(
      "bairro","endereco_bairro"
    );
  }

  ce("coletaClienteResultados").style.display="none";
  atualizarPreviaColeta();

  const faltando=[];
  if(!cv("coletaEnderecoDestino"))faltando.push("logradouro");
  if(!cv("coletaNumeroDestino"))faltando.push("número");
  if(!cv("coletaBairroDestino"))faltando.push("bairro");
  if(faltando.length){
    mostrarBalaoSistema(
      "Cliente selecionado",
      "Confira o endereço do destino. Faltando: "+faltando.join(", ")
    );
  }
}
function dadosColeta(){return{solicitante:cv("coletaSolicitante"),telefone_origem:cv("coletaTelefoneOrigem"),tipo_frete:cv("coletaTipoFrete")==="FOB"?"DESTINO (FOB)":"REMETENTE (CIF)",cnpj_origem:cv("coletaCnpjOrigem"),razao_origem:cv("coletaRazaoOrigem"),cep_origem:cv("coletaCepOrigem"),endereco_origem:cv("coletaEnderecoOrigem"),cnpj_destino:cv("coletaCnpjDestino"),razao_destino:cv("coletaRazaoDestino"),cep_destino:cv("coletaCepDestino"),cidade_destino:cv("coletaCidadeDestino"),volumes:cv("coletaVolumes"),peso:cv("coletaPeso"),valor_nf:coletaMoeda(cv("coletaValorNf")),numero_nf:cv("coletaNumeroNf"),medidas:cv("coletaMedidas"),natureza:cv("coletaNatureza"),mercadoria:cv("coletaMercadoria"),embalagem:cv("coletaEmbalagem"),horario_limite:cv("coletaHorarioLimite"),pausa:cv("coletaPausa"),referencia:cv("coletaReferencia"),localizacao:cv("coletaLocalizacao")}}
function modeloAtualColeta(){return coletaModelos.find(m=>String(m.id)===cv("coletaModeloId"))||coletaModelos[0]}
function renderizarModeloColeta(texto,d){return String(texto||"").replace(/\{\{([a-z0-9_]+)\}\}/gi,(_,k)=>d[k]||"-").replace(/\n{3,}/g,"\n\n").trim()}
function atualizarPreviaColeta(){const m=modeloAtualColeta();ce("coletaPreviaMensagem").value=m?renderizarModeloColeta(m.texto,dadosColeta()):""}
function aplicarModeloDaTransportadoraColeta(){const tid=cv("coletaTransportadoraId");const m=coletaModelos.find(x=>String(x.transportadora_id||"")===tid);if(m)ce("coletaModeloId").value=m.id;atualizarPreviaColeta()}
async function copiarMensagemColeta(){atualizarPreviaColeta();const t=cv("coletaPreviaMensagem");if(!t)return alert("Preencha os dados da coleta.");try{await navigator.clipboard.writeText(t);alert("Mensagem copiada para o WhatsApp.")}catch{ce("coletaPreviaMensagem").select();document.execCommand("copy")}}
function whatsappTransportadoraColeta(){const t=coletaTransportadoras.find(x=>String(x.id)===cv("coletaTransportadoraId"));return String(t?.whatsapp||t?.telefone||"").replace(/\D/g,"")}
async function registrarSolicitacaoCanalExternoColeta(canal){
  const d=dadosColeta();
  if(!d.razao_destino)throw new Error("Informe o cliente/destino.");
  if(!cv("coletaTransportadoraId"))throw new Error("Selecione a transportadora.");
  atualizarPreviaColeta();

  let id=cv("coletaAgendamentoId");
  const atual=id?(coletaAgendamentos||[]).find(x=>String(x.id)===String(id)):null;
  const agora=new Date().toISOString();
  const payload={
    cotacao_id:cv("coletaCotacaoId")||null,
    resposta_cotacao_id:cv("coletaRespostaId")||null,
    cliente_id:cv("coletaClienteId")||null,
    cliente_nome:d.razao_destino,
    transportadora_id:cv("coletaTransportadoraId")||null,
    modelo_id:String(cv("coletaModeloId")).startsWith("padrao-")?null:cv("coletaModeloId")||null,
    tipo_frete:cv("coletaTipoFrete")||"CIF",
    dados:{
      ...(atual?.dados||{}),
      ...d,
      origem_externa:canal,
      solicitado_externo_em:agora
    },
    mensagem:cv("coletaPreviaMensagem"),
    volumes:Number(d.volumes)||null,
    peso:Number(String(d.peso).replace(",","."))||null,
    numero_nf:d.numero_nf||null,
    protocolo_cotacao:protocoloAtualParaColeta()||null,
    data_programada:formatarDataHoraApiColeta()||atual?.data_programada||null,
    origem:canal,
    status:"solicitado",
    status_api:"solicitado",
    observacao:cv("coletaObservacao")||null,
    atualizado_em:agora
  };

  let r;
  if(id){
    r=await banco.from("coleta_agendamentos").update(payload).eq("id",id).select().single();
  }else{
    payload.criado_por=usuarioLogado?.login||null;
    r=await banco.from("coleta_agendamentos").insert([payload]).select().single();
  }
  if(r.error)throw r.error;

  id=r.data.id;
  ce("coletaAgendamentoId").value=id;
  await registrarEventoColeta(
    id,
    atual?statusColetaPainel(atual):"rascunho",
    "solicitado",
    canal,
    {registro_automatico:true}
  );
  await criarOuVincularRastreioDaColeta(id,r.data,canal);
  await carregarAgendamentosColeta();
  return r.data;
}

async function abrirWhatsAppColeta(){
  try{
    await registrarSolicitacaoCanalExternoColeta("whatsapp");
    atualizarPreviaColeta();
    const tel=whatsappTransportadoraColeta();
    const url=tel
      ?`https://wa.me/55${tel.replace(/^55/,"")}?text=${encodeURIComponent(cv("coletaPreviaMensagem"))}`
      :`https://wa.me/?text=${encodeURIComponent(cv("coletaPreviaMensagem"))}`;
    window.open(url,"_blank");
  }catch(erro){
    alert("Não foi possível registrar a solicitação antes de abrir o WhatsApp: "+erro.message);
  }
}

async function registrarColetaViaPortalTransportadora(){
  try{
    await registrarSolicitacaoCanalExternoColeta("portal_transportadora");
    mostrarBalaoSistema("Solicitação registrada","Registrada como enviada pelo portal da transportadora.");
    await carregarPainelRodonaves();
  }catch(erro){alert("Não foi possível registrar: "+erro.message)}
}

async function registrarColetaViaTelefone(){
  try{
    await registrarSolicitacaoCanalExternoColeta("telefone");
    mostrarBalaoSistema("Solicitação registrada","Registrada como solicitada por telefone.");
    await carregarPainelRodonaves();
  }catch(erro){alert("Não foi possível registrar: "+erro.message)}
}
async function salvarAgendamentoColeta(){
  const d=dadosColeta();
  if(!d.razao_destino)return alert("Informe o cliente/destino.");
  if(!cv("coletaModeloId"))return alert("Selecione um modelo.");
  if(!(await verificarColetaDuplicadaAntesDeSalvar()))return;

  atualizarPreviaColeta();
  const id=cv("coletaAgendamentoId");
  const payload={
    cotacao_id:cv("coletaCotacaoId")||null,
    resposta_cotacao_id:cv("coletaRespostaId")||null,
    cliente_id:cv("coletaClienteId")||null,
    cliente_nome:d.razao_destino,
    transportadora_id:cv("coletaTransportadoraId")||null,
    modelo_id:String(cv("coletaModeloId")).startsWith("padrao-")?null:cv("coletaModeloId"),
    tipo_frete:cv("coletaTipoFrete"),
    dados:d,
    mensagem:cv("coletaPreviaMensagem"),
    volumes:Number(d.volumes)||null,
    peso:Number(String(d.peso).replace(",","."))||null,
    numero_nf:d.numero_nf||null,
    protocolo_cotacao:protocoloAtualParaColeta()||null,
    data_programada:formatarDataHoraApiColeta()||null,
    origem:cv("coletaCotacaoId")?"autorizacao_cotacao":"manual",
    observacao:cv("coletaObservacao")||null,
    criado_por:usuarioLogado?.login||null,
    atualizado_em:new Date().toISOString()
  };
  if(!id)payload.status="rascunho";

  const r=id
    ?await banco.from("coleta_agendamentos").update(payload).eq("id",id)
    :await banco.from("coleta_agendamentos").insert([payload]);

  if(r.error)return alert(r.error.message);
  alert(id?"Agendamento atualizado.":"Rascunho salvo.");
  await carregarAgendamentosColeta();
  mostrarPainelColeta("historico");
}
function limparFormularioColeta(){["coletaAgendamentoId","coletaCotacaoId","coletaRespostaId","coletaClienteId","coletaClienteBusca","coletaCnpjDestino","coletaRazaoDestino","coletaCepDestino","coletaCidadeDestino","coletaVolumes","coletaPeso","coletaValorNf","coletaNumeroNf","coletaLocalizacao","coletaObservacao","coletaProtocoloCotacao","coletaComentarioApi","coletaEnderecoDestino","coletaNumeroDestino","coletaComplementoDestino","coletaBairroDestino"].forEach(id=>{if(ce(id))ce(id).value=""});atualizarPreviaColeta()}
function montarHistoricoColetas(){
  const tb=ce("coletaTabelaHistorico");if(!tb)return;
  const q=normalizarNomeEmail(cv("coletaBuscaHistorico")),s=cv("coletaFiltroStatus");
  const lista=coletaAgendamentos.filter(a=>(!s||a.status===s)&&(!q||normalizarNomeEmail([a.cliente_nome,a.numero_nf,a.protocolo_cotacao,a.codigo_coleta,a.frete_transportadoras?.nome].filter(Boolean).join(" ")).includes(q)));
  tb.innerHTML=lista.length?lista.map(a=>`<tr>
    <td>${new Date(a.created_at).toLocaleDateString("pt-BR")}</td>
    <td>${new Date(a.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</td>
    <td>${escaparHtmlEmail(a.cliente_nome||"")}</td>
    <td>${escaparHtmlEmail(a.frete_transportadoras?.nome||"—")}</td>
    <td>${escaparHtmlEmail(a.protocolo_cotacao||"—")}</td>
    <td>${escaparHtmlEmail(a.codigo_coleta||"—")}</td>
    <td>${a.volumes||"—"}</td>
    <td>${a.peso?`${Number(a.peso).toLocaleString("pt-BR",{maximumFractionDigits:3})} Kg`:"—"}</td>
    <td><span class="coleta-status ${a.status}">${statusLabelColeta(a.status)}</span></td>
    <td><button class="btn azul" onclick="editarAgendamentoColeta('${a.id}')">Editar</button><button class="btn verde" onclick="copiarAgendamentoColeta('${a.id}')">Copiar</button>${a.codigo_coleta?`<button class="btn roxo" onclick="consultarColetaPainelRodonaves('${a.id}')">Atualizar API</button>`:""}</td>
  </tr>`).join(""):'<tr><td colspan="10">Nenhum agendamento encontrado.</td></tr>';
}
function editarAgendamentoColeta(id){const a=coletaAgendamentos.find(x=>String(x.id)===String(id));if(!a)return;const d=a.dados||{};ce("coletaAgendamentoId").value=a.id;ce("coletaCotacaoId").value=a.cotacao_id||"";ce("coletaRespostaId").value=a.resposta_cotacao_id||"";ce("coletaClienteId").value=a.cliente_id||"";ce("coletaClienteBusca").value=a.cliente_nome||"";ce("coletaTransportadoraId").value=a.transportadora_id||"";if(a.modelo_id)ce("coletaModeloId").value=a.modelo_id;ce("coletaTipoFrete").value=a.tipo_frete||"CIF";const map={solicitante:"coletaSolicitante",telefone_origem:"coletaTelefoneOrigem",cnpj_origem:"coletaCnpjOrigem",razao_origem:"coletaRazaoOrigem",cep_origem:"coletaCepOrigem",endereco_origem:"coletaEnderecoOrigem",cnpj_destino:"coletaCnpjDestino",razao_destino:"coletaRazaoDestino",cep_destino:"coletaCepDestino",cidade_destino:"coletaCidadeDestino",volumes:"coletaVolumes",peso:"coletaPeso",numero_nf:"coletaNumeroNf",medidas:"coletaMedidas",natureza:"coletaNatureza",mercadoria:"coletaMercadoria",embalagem:"coletaEmbalagem",horario_limite:"coletaHorarioLimite",pausa:"coletaPausa",referencia:"coletaReferencia",localizacao:"coletaLocalizacao"};Object.entries(map).forEach(([k,id])=>{if(ce(id))ce(id).value=d[k]||""});ce("coletaObservacao").value=a.observacao||"";atualizarPreviaColeta();mostrarPainelColeta("nova")
if(ce("coletaNumeroNfRastreio"))ce("coletaNumeroNfRastreio").value=a.numero_nf||a?.dados?.numero_nf||a?.dados?.numero_nfe||"";
if(ce("coletaChaveNfeRastreio"))ce("coletaChaveNfeRastreio").value=a.chave_nfe||a?.dados?.chave_nfe||a?.dados?.chave_nf||"";
if(ce("coletaNumeroCteRastreio"))ce("coletaNumeroCteRastreio").value=a.numero_cte||a?.dados?.numero_cte||"";
if(ce("coletaProtocoloRastreio"))ce("coletaProtocoloRastreio").value=a.protocolo_rastreio||a.protocolo_cotacao||"";
}
async function copiarAgendamentoColeta(id){const a=coletaAgendamentos.find(x=>String(x.id)===String(id));if(a){await navigator.clipboard.writeText(a.mensagem||"");alert("Mensagem copiada.")}}
async function alterarStatusColeta(id,status){const r=await banco.from("coleta_agendamentos").update({status,atualizado_em:new Date().toISOString()}).eq("id",id);if(r.error)alert(r.error.message);else carregarAgendamentosColeta()}
function montarModelosColeta(){const box=ce("coletaListaModelos");if(!box)return;box.innerHTML=coletaModelos.map(m=>`<div class="coleta-modelo-card"><h3>${escaparHtmlEmail(m.nome)}</h3><p>${escaparHtmlEmail(m.texto)}</p><div class="email-acoes">${!String(m.id).startsWith("padrao-")?`<button class="btn azul" onclick="editarModeloColeta('${m.id}')">Editar</button><button class="btn vermelho" onclick="excluirModeloColeta('${m.id}')">Excluir</button>`:"<small>Modelo padrão</small>"}</div></div>`).join("")}
function editarModeloColeta(id){const m=coletaModelos.find(x=>String(x.id)===String(id));if(!m)return;ce("coletaModeloEditarId").value=m.id;ce("coletaModeloNome").value=m.nome||"";ce("coletaModeloTransportadoraId").value=m.transportadora_id||"";ce("coletaModeloTexto").value=m.texto||""}
function limparModeloColeta(){["coletaModeloEditarId","coletaModeloNome","coletaModeloTexto"].forEach(id=>ce(id).value="");ce("coletaModeloTransportadoraId").value=""}
async function salvarModeloColeta(){const nome=cv("coletaModeloNome"),texto=cv("coletaModeloTexto");if(!nome||!texto)return alert("Informe nome e texto do modelo.");const p={nome,texto,transportadora_id:cv("coletaModeloTransportadoraId")||null,ativo:true,atualizado_em:new Date().toISOString()};const id=cv("coletaModeloEditarId");const r=id?await banco.from("coleta_modelos").update(p).eq("id",id):await banco.from("coleta_modelos").insert([p]);if(r.error)return alert(r.error.message);limparModeloColeta();await carregarModelosColeta();alert("Modelo salvo.")}
async function excluirModeloColeta(id){if(!confirm("Excluir este modelo?"))return;const r=await banco.from("coleta_modelos").update({ativo:false}).eq("id",id);if(r.error)alert(r.error.message);else carregarModelosColeta()}


function dadosColetaDaCotacao(cotacao,tipoFrete){
  return {
    solicitante:cotacao.solicitante||"Johnny",
    telefone_origem:"(62) 3293-0035",
    tipo_frete:tipoFrete==="FOB"?"DESTINO (FOB)":"REMETENTE (CIF)",
    cnpj_origem:"05.451.985/0001-95",
    razao_origem:"SOFISTICATTO COSMÉTICOS",
    cep_origem:"74550-470",
    endereco_origem:"Rua 03, Qd.35, Lt.14E, Nº217, Vila Abajá - Goiânia/GO",
    cnpj_destino:cotacao.cpf_cnpj_destino||"",
    razao_destino:cotacao.cliente_nome||"",
    cep_destino:cotacao.cep_destino||"",
    cidade_destino:[cotacao.cidade_destino,cotacao.uf_destino].filter(Boolean).join("/"),
    volumes:cotacao.volumes||"",
    peso:cotacao.peso_total||"",
    valor_nf:cotacao.valor_nf||"",
    numero_nf:cotacao.numero_nf||"",
    medidas:cotacao.medidas||"38 x 29 x 35",
    natureza:"Vendas",
    mercadoria:cotacao.material||"Cosméticos",
    embalagem:cotacao.embalagem||"Caixas",
    horario_limite:"Hoje até as 17:30 h",
    pausa:"Das 13:00 h às 14:00 h",
    referencia:"Próximo ao Tático de Campinas",
    localizacao:""
  };
}

async function abrirColetaComDadosCotacao(cotacao,resposta,transportadora,agendamentoId=""){
  mostrarAbaEmail("coletas");
  await inicializarModuloColetas();
  mostrarPainelColeta("nova");

  const d=dadosColetaDaCotacao(cotacao,resposta.tipo_frete);
  ce("coletaAgendamentoId").value=agendamentoId||"";
  ce("coletaCotacaoId").value=cotacao.id||"";
  ce("coletaRespostaId").value=resposta.id||"";
  ce("coletaClienteId").value=cotacao.cliente_id||"";
  ce("coletaClienteBusca").value=cotacao.cliente_nome||"";
  ce("coletaTransportadoraId").value=transportadora?.id||resposta.transportadora_id||"";
  ce("coletaTipoFrete").value=resposta.tipo_frete||cotacao.tipo_frete||"CIF";
  if(ce("coletaProtocoloCotacao")){
    ce("coletaProtocoloCotacao").value=
      resposta.protocolo_usado_coleta||
      resposta.numero_cotacao||
      "";
  }
  if(ce("coletaDataApi")&&!ce("coletaDataApi").value)ce("coletaDataApi").value=dataAmanhaColeta();
  atualizarAreaApiColeta();

  if(transportadora?.modelo_coleta_id){
    ce("coletaModeloId").value=transportadora.modelo_coleta_id;
  }

  const mapa={
    solicitante:"coletaSolicitante",telefone_origem:"coletaTelefoneOrigem",
    cnpj_origem:"coletaCnpjOrigem",razao_origem:"coletaRazaoOrigem",
    cep_origem:"coletaCepOrigem",endereco_origem:"coletaEnderecoOrigem",
    cnpj_destino:"coletaCnpjDestino",razao_destino:"coletaRazaoDestino",
    cep_destino:"coletaCepDestino",cidade_destino:"coletaCidadeDestino",
    volumes:"coletaVolumes",peso:"coletaPeso",numero_nf:"coletaNumeroNf",
    medidas:"coletaMedidas",natureza:"coletaNatureza",mercadoria:"coletaMercadoria",
    embalagem:"coletaEmbalagem",horario_limite:"coletaHorarioLimite",
    pausa:"coletaPausa",referencia:"coletaReferencia",localizacao:"coletaLocalizacao"
  };
  Object.entries(mapa).forEach(([chave,id])=>{if(ce(id))ce(id).value=d[chave]??""});
  ce("coletaValorNf").value=Number(cotacao.valor_nf||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  atualizarPreviaColeta();
  setTimeout(()=>ce("coletaPreviaMensagem")?.scrollIntoView({behavior:"smooth",block:"center"}),150);
}

async function criarColetaAutomaticaDaCotacao(cotacao,resposta,transportadora){
  const existente=await banco
    .from("coleta_agendamentos")
    .select("id")
    .eq("cotacao_id",cotacao.id)
    .eq("transportadora_id",transportadora.id)
    .neq("status","cancelado")
    .maybeSingle();

  if(existente.data?.id)return existente.data.id;

  const dados=dadosColetaDaCotacao(cotacao,resposta.tipo_frete);
  const modelo=coletaModelos.find(m=>String(m.id)===String(transportadora.modelo_coleta_id))
    ||coletaModelos[0];
  const mensagem=renderizarModeloColeta(modelo?.texto||"",dados);

  const payload={
    cotacao_id:cotacao.id,
    resposta_cotacao_id:resposta.id||null,
    cliente_id:cotacao.cliente_id||null,
    cliente_nome:cotacao.cliente_nome,
    transportadora_id:transportadora.id,
    modelo_id:String(modelo?.id||"").startsWith("padrao-")?null:modelo?.id||null,
    tipo_frete:resposta.tipo_frete||"CIF",
    dados,
    mensagem,
    volumes:Number(cotacao.volumes)||null,
    peso:Number(cotacao.peso_total)||null,
    numero_nf:cotacao.numero_nf||null,
    status:"rascunho",
    protocolo_cotacao:resposta.protocolo_usado_coleta||resposta.numero_cotacao||null,
    valor_frete_negociado:resposta.valor_usado_coleta||resposta.valor_frete||null,
    origem:"autorizacao_cotacao",
    criado_por:usuarioLogado?.login||null,
    atualizado_em:new Date().toISOString()
  };

  const salvo=await banco.from("coleta_agendamentos").insert([payload]).select().single();
  if(salvo.error)throw salvo.error;
  await carregarAgendamentosColeta();
  return salvo.data.id;
}

async function tratarColetaAposAutorizacao(cotacao,resposta,transportadora){
  await inicializarModuloColetas();

  if(transportadora?.criar_coleta_ao_autorizar){
    try{
      const id=await criarColetaAutomaticaDaCotacao(cotacao,resposta,transportadora);
      mostrarBalaoSistema("Coleta criada","O agendamento foi criado automaticamente no histórico.");
      if(confirm("O agendamento de coleta foi criado automaticamente. Deseja abrir agora para conferir e enviar pelo WhatsApp?")){
        await abrirColetaComDadosCotacao(cotacao,resposta,transportadora,id);
      }
    }catch(erro){
      console.error("Erro ao criar coleta automática:",erro);
      if(confirm("Não foi possível criar automaticamente. Deseja abrir o agendamento preenchido manualmente?")){
        await abrirColetaComDadosCotacao(cotacao,resposta,transportadora);
      }
    }
    return;
  }

  if(confirm(`Transportadora autorizada: ${transportadora?.nome||resposta.transportadora_nome}.\n\nDeseja agendar a coleta agora?`)){
    await abrirColetaComDadosCotacao(cotacao,resposta,transportadora);
  }
}


/* =========================================================
   V16.8 — AGENDAMENTO AUTOMÁTICO RODONAVES
   ========================================================= */
function coletaTransportadoraAtual(){
  return coletaTransportadoras.find(t=>String(t.id)===String(cv("coletaTransportadoraId")));
}
function coletaEhRodonaves(){
  return /rodonaves/i.test(coletaTransportadoraAtual()?.nome||"");
}
function coletaEhAccert(){
  return /accert/i.test(coletaTransportadoraAtual()?.nome||"");
}
function dataAmanhaColeta(){
  const d=new Date();
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
function atualizarAreaApiColeta(){
  const bloco=ce("coletaApiRodonavesBloco");
  if(!bloco)return;
  const mostrar=coletaEhRodonaves()&&cv("coletaTipoFrete")==="CIF";
  bloco.style.display=mostrar?"block":"none";
  const accert=ce("coletaApiAccertBloco");
  if(accert) accert.style.display=coletaEhAccert()?"block":"none";
  if(mostrar&&!cv("coletaDataApi"))ce("coletaDataApi").value=dataAmanhaColeta();
  if(mostrar){
    atualizarModoEnderecoColeta();
    carregarLocaisColeta();
    const salva=localStorage.getItem("integrations_admin_key")||sessionStorage.getItem("integrations_admin_key");
    atualizarStatusChaveColeta(salva?"Chave salva — será validada ao enviar":"Chave não informada",!!salva);
  }
}
function respostaAtualDaColeta(){
  const respostaId=cv("coletaRespostaId");
  const cotacaoId=cv("coletaCotacaoId");
  for(const lista of [freteAndamento||[],freteHistorico||[]]){
    const cotacao=lista.find(c=>String(c.id)===String(cotacaoId));
    const resposta=(cotacao?.frete_cotacao_respostas||[]).find(r=>String(r.id)===String(respostaId));
    if(resposta)return resposta;
  }
  return null;
}
function protocoloAtualParaColeta(){
  return cv("coletaProtocoloCotacao") ||
    respostaAtualDaColeta()?.protocolo_usado_coleta ||
    respostaAtualDaColeta()?.numero_cotacao ||
    "";
}
function formatarDataHoraApiColeta(){
  const data=cv("coletaDataApi");
  const hora=cv("coletaHoraApi")||"09:00";
  if(!data)return "";
  return `${data}T${hora}:00`;
}
function resultadoApiColeta(classe,texto){
  const box=ce("coletaApiResultado");
  if(!box)return;
  box.className=`coleta-api-resultado ${classe||""}`;
  box.textContent=texto||"";
}
async function validarChaveColetaNoServidor(chave){
  const valor=String(chave||"").trim();
  if(!valor)throw new Error("Informe a chave administrativa.");

  const r=await fetch("/api/integracoes?action=validar-chave",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-integrations-admin-key":valor
    }
  });

  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok){
    throw new Error(d.erro||"Chave administrativa inválida ou não configurada.");
  }
  return true;
}

function atualizarStatusChaveColeta(texto,ok=false){
  const el=ce("coletaChaveStatus");
  if(!el)return;
  el.textContent=texto;
  el.style.background=ok?"#d8f4e2":"#fff0cf";
  el.style.color=ok?"#17683d":"#7b5919";
}

async function solicitarChaveColeta(){
  const digitada=prompt(
    "Informe o valor secreto da variável INTEGRATIONS_ADMIN_KEY cadastrada na Vercel:",
    ""
  );
  const valor=String(digitada||"").trim();
  if(!valor)return "";
  await validarChaveColetaNoServidor(valor);
  sessionStorage.setItem("integrations_admin_key",valor);
  if(confirm("Deseja manter esta chave salva neste computador? Use somente em computador confiável.")){
    localStorage.setItem("integrations_admin_key",valor);
  }
  atualizarStatusChaveColeta("Chave validada",true);
  return valor;
}

async function chaveAdminColeta(forcarTroca=false){
  if(forcarTroca){
    localStorage.removeItem("integrations_admin_key");
    sessionStorage.removeItem("integrations_admin_key");
  }

  let chave=localStorage.getItem("integrations_admin_key")||
            sessionStorage.getItem("integrations_admin_key")||"";

  if(!chave)return solicitarChaveColeta();

  try{
    atualizarStatusChaveColeta("Validando chave...");
    await validarChaveColetaNoServidor(chave);
    atualizarStatusChaveColeta("Chave salva e validada",true);
    return chave;
  }catch{
    localStorage.removeItem("integrations_admin_key");
    sessionStorage.removeItem("integrations_admin_key");
    atualizarStatusChaveColeta("Chave inválida");
    return solicitarChaveColeta();
  }
}

async function validarOuTrocarChaveColeta(){
  try{
    const chave=await chaveAdminColeta(true);
    if(chave)alert("Chave administrativa validada e pronta para uso.");
  }catch(erro){
    alert("Não foi possível validar a chave: "+erro.message);
  }
}
async function agendarColetaRodonavesPorProtocolo(){
  const protocolo=protocoloAtualParaColeta().replace(/\D/g,"");
  const dataHora=formatarDataHoraApiColeta();
  const agendamentoId=cv("coletaAgendamentoId");
  const respostaId=cv("coletaRespostaId");
  const cotacaoId=cv("coletaCotacaoId");

  if(!protocolo)return alert("Informe o protocolo atual da cotação Rodonaves.");
  if(!dataHora)return alert("Informe a data e o horário da coleta.");

  const pesoInterpretado=numeroColetaApi(cv("coletaPeso"));
  const volumesInterpretados=numeroColetaApi(cv("coletaVolumes"));
  if(!(pesoInterpretado>0)){
    return alert("Informe um peso total maior que zero. Valor atual: "+cv("coletaPeso"));
  }
  if(!(volumesInterpretados>0)){
    return alert("Informe uma quantidade de volumes maior que zero.");
  }
  if(!cotacaoId)return alert("Abra o agendamento a partir de uma cotação autorizada.");
  if(cv("coletaTipoFrete")!=="CIF")return alert("O agendamento automático está liberado somente para CIF.");

  const confirmar=confirm(
    `CONFIRMAR COLETA REAL NA RODONAVES?\n\n`+
    `Protocolo: ${protocolo}\n`+
    `Data/hora: ${new Date(dataHora).toLocaleString("pt-BR")}\n`+
    `Cliente: ${cv("coletaRazaoDestino")}\n\n`+
    `Depois de confirmar, uma solicitação real poderá ser criada no Portal Rodonaves.`
  );
  if(!confirmar)return;

  const chave=await chaveAdminColeta();
  if(!chave)return;

  const btn=ce("btnAgendarRodonavesApi");
  btn.disabled=true;
  btn.textContent="Agendando...";
  resultadoApiColeta("processando","Enviando solicitação para a Rodonaves...");

  try{
    let id=agendamentoId;
    if(!id){
      await salvarAgendamentoColetaSemAviso();
      id=cv("coletaAgendamentoId");
    }

    const resposta=await fetch("/api/integracoes?action=agendar-coleta-rodonaves",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-integrations-admin-key":chave
      },
      body:JSON.stringify({
        agendamento_id:id||null,
        cotacao_id:cotacaoId,
        resposta_cotacao_id:respostaId||null,
        protocol_id:Number(protocolo),
        pickup_service_type:Number(cv("coletaServicoApi")||1),
        schedule_date:dataHora,
        comment:cv("coletaComentarioApi")||cv("coletaObservacao")||"",
        register_source:2
      })
    });
    const dados=await resposta.json().catch(()=>({}));
    if(!resposta.ok){
      if(resposta.status===404){
        throw new Error("Endpoint de sincronização não publicado. Confirme se o deploy atual contém api/integracoes.js.");
      }
      throw new Error([dados.erro,dados.diagnostico?.mensagem,dados.detalhe].filter(Boolean).join(" — ")||`HTTP ${resposta.status}`);
    }

    ce("coletaAgendamentoId").value=dados.agendamento_id||id||"";
    ce("coletaApiStatus").textContent=dados.status||"Solicitada";
    ce("btnConsultarRodonavesApi").style.display=dados.pickup_id?"inline-flex":"none";
    ce("btnConsultarRodonavesApi").dataset.pickupId=dados.pickup_id||"";
    resultadoApiColeta("sucesso",[
      "COLETA SOLICITADA COM SUCESSO",
      `Protocolo da cotação: ${protocolo}`,
      `Código da coleta: ${dados.pickup_id||"não informado"}`,
      `Status: ${dados.status||"solicitada"}`,
      `Data programada: ${new Date(dataHora).toLocaleString("pt-BR")}`
    ].join("\n"));

    await carregarAgendamentosColeta();
    mostrarBalaoSistema("Coleta Rodonaves solicitada",dados.pickup_id?`Código ${dados.pickup_id}`:"Solicitação registrada");
  }catch(erro){
    console.error("Agendamento Rodonaves:",erro);
    resultadoApiColeta("erro","Não foi possível agendar:\n"+erro.message);
  }finally{
    btn.disabled=false;
    btn.textContent="Agendar no Portal Rodonaves";
  }
}
async function salvarAgendamentoColetaSemAviso(){
  const d=dadosColeta();
  atualizarPreviaColeta();
  const payload={
    cotacao_id:cv("coletaCotacaoId")||null,
    resposta_cotacao_id:cv("coletaRespostaId")||null,
    cliente_id:cv("coletaClienteId")||null,
    cliente_nome:d.razao_destino||"Cliente",
    transportadora_id:cv("coletaTransportadoraId")||null,
    modelo_id:String(cv("coletaModeloId")).startsWith("padrao-")?null:cv("coletaModeloId")||null,
    tipo_frete:cv("coletaTipoFrete"),
    dados:d,
    mensagem:cv("coletaPreviaMensagem"),
    volumes:Number(d.volumes)||null,
    peso:Number(String(d.peso).replace(",","."))||null,
    numero_nf:d.numero_nf||null,
    status:"rascunho",
    origem:cv("coletaCotacaoId")?"autorizacao_cotacao":"manual",
    observacao:cv("coletaObservacao")||null,
    protocolo_cotacao:protocoloAtualParaColeta()||null,
    modo_endereco:cv("coletaModoEnderecoApi")||"protocolo",
    local_coleta_id:cv("coletaLocalSalvoId")||null,
    endereco_coleta_alternativo:cv("coletaModoEnderecoApi")==="alternativo"?localColetaTela():null,
    data_programada:formatarDataHoraApiColeta()||null,
    criado_por:usuarioLogado?.login||null,
    atualizado_em:new Date().toISOString()
  };
  const atual=cv("coletaAgendamentoId");
  const r=atual
    ?await banco.from("coleta_agendamentos").update(payload).eq("id",atual).select().single()
    :await banco.from("coleta_agendamentos").insert([payload]).select().single();
  if(r.error)throw r.error;
  ce("coletaAgendamentoId").value=r.data.id;
  return r.data.id;
}
async function consultarColetaRodonavesApi(){
  const pickupId=ce("btnConsultarRodonavesApi")?.dataset.pickupId ||
    coletaAgendamentos.find(a=>String(a.id)===String(cv("coletaAgendamentoId")))?.codigo_coleta;
  if(!pickupId)return alert("Código da coleta não encontrado.");

  const chave=await chaveAdminColeta();
  if(!chave)return;
  resultadoApiColeta("processando","Consultando a coleta na Rodonaves...");

  try{
    const resposta=await fetch(`/api/integracoes?action=consultar-coleta-rodonaves&id=${encodeURIComponent(pickupId)}&agendamento_id=${encodeURIComponent(cv("coletaAgendamentoId"))}`,{
      headers:{"x-integrations-admin-key":chave}
    });
    const dados=await resposta.json().catch(()=>({}));
    if(!resposta.ok)throw new Error([dados.erro,dados.diagnostico?.mensagem,dados.detalhe].filter(Boolean).join(" — ")||`HTTP ${resposta.status}`);
    ce("coletaApiStatus").textContent=dados.status||"Atualizada";
    resultadoApiColeta("sucesso",[
      `COLETA ${pickupId}`,
      `Status: ${dados.status||"não informado"}`,
      dados.unidade?`Unidade: ${dados.unidade}`:"",
      dados.observacao?`Observação: ${dados.observacao}`:""
    ].filter(Boolean).join("\n"));
    await carregarAgendamentosColeta();
  }catch(erro){
    resultadoApiColeta("erro","Falha na consulta:\n"+erro.message);
  }
}

/* =========================================================
   V16.9 — LOCAIS DE COLETA E ENDEREÇO ALTERNATIVO
   ========================================================= */
let coletaLocaisSalvos=[];

async function carregarLocaisColeta(){
  const r=await banco.from("coleta_locais").select("*").order("nome");
  coletaLocaisSalvos=r.error?[]:(r.data||[]);
  const sel=ce("coletaLocalSalvoId");
  if(!sel)return;
  sel.innerHTML='<option value="">Selecione ou preencha manualmente</option>'+
    coletaLocaisSalvos.map(l=>`<option value="${l.id}">${escaparHtmlEmail(l.nome)} — ${escaparHtmlEmail(l.logradouro)}, ${escaparHtmlEmail(l.numero||"s/n")}</option>`).join("");
}

function atualizarModoEnderecoColeta(){
  const alternativo=cv("coletaModoEnderecoApi")==="alternativo";
  if(ce("coletaEnderecoAlternativoApi"))ce("coletaEnderecoAlternativoApi").style.display=alternativo?"block":"none";
  if(ce("coletaLocalSalvoContainer"))ce("coletaLocalSalvoContainer").style.display=alternativo?"block":"none";
  if(ce("btnAgendarRodonavesApi")){
    ce("btnAgendarRodonavesApi").textContent=alternativo
      ?"Agendar com endereço alternativo"
      :"Agendar no Portal Rodonaves";
  }
  if(alternativo)carregarLocaisColeta();
}

function localColetaTela(){
  return {
    nome:cv("coletaLocalNome")||"Local de coleta",
    cnpj:String(cv("coletaCnpjOrigem")||"").replace(/\D/g,""),
    razao_social:cv("coletaRazaoOrigem"),
    telefone:cv("coletaTelefoneOrigem"),
    cep:String(cv("coletaAltCep")||"").replace(/\D/g,""),
    logradouro:cv("coletaAltLogradouro"),
    numero:cv("coletaAltNumero"),
    complemento:cv("coletaAltComplemento"),
    bairro:cv("coletaAltBairro"),
    cidade:cv("coletaAltCidade"),
    uf:cv("coletaAltUf").toUpperCase(),
    referencia:cv("coletaAltReferencia"),
    ativo:true,
    atualizado_em:new Date().toISOString()
  };
}

function validarLocalColeta(local){
  const faltando=[];
  if(local.cnpj.length!==14)faltando.push("CNPJ da origem");
  if(local.cep.length!==8)faltando.push("CEP");
  if(!local.logradouro)faltando.push("logradouro");
  if(!local.numero)faltando.push("número");
  if(!local.bairro)faltando.push("bairro");
  if(!local.cidade)faltando.push("cidade");
  if(local.uf.length!==2)faltando.push("UF");
  return faltando;
}

async function salvarLocalColetaAtual(){
  const local=localColetaTela();
  const faltando=validarLocalColeta(local);
  if(faltando.length)return alert("Preencha: "+faltando.join(", "));
  const atual=cv("coletaLocalSalvoId");
  const r=atual
    ?await banco.from("coleta_locais").update(local).eq("id",atual).select().single()
    :await banco.from("coleta_locais").insert([local]).select().single();
  if(r.error)return alert(r.error.message);
  await carregarLocaisColeta();
  ce("coletaLocalSalvoId").value=r.data.id;
  mostrarBalaoSistema("Local de coleta salvo",r.data.nome);
}

function aplicarLocalColetaSelecionado(){
  const local=coletaLocaisSalvos.find(l=>String(l.id)===String(cv("coletaLocalSalvoId")));
  if(!local)return;
  const mapa={
    coletaLocalNome:local.nome,
    coletaAltCep:local.cep,
    coletaAltLogradouro:local.logradouro,
    coletaAltNumero:local.numero,
    coletaAltComplemento:local.complemento,
    coletaAltBairro:local.bairro,
    coletaAltCidade:local.cidade,
    coletaAltUf:local.uf,
    coletaAltReferencia:local.referencia
  };
  Object.entries(mapa).forEach(([id,v])=>{if(ce(id))ce(id).value=v||""});
}

async function agendarColetaRodonaves(){
  if(cv("coletaModoEnderecoApi")==="alternativo"){
    return agendarColetaRodonavesComEndereco();
  }
  return agendarColetaRodonavesPorProtocolo();
}

function numeroColetaApi(valor){
  if(typeof valor==="number")return Number.isFinite(valor)?valor:0;
  let s=String(valor??"").trim().replace(/\s/g,"");
  if(!s)return 0;
  if(s.includes(",")&&s.includes(".")){
    s=s.lastIndexOf(",")>s.lastIndexOf(".")
      ?s.replace(/\./g,"").replace(",",".")
      :s.replace(/,/g,"");
  }else if(s.includes(",")){
    s=s.replace(",",".");
  }
  const n=Number(s.replace(/[^0-9.-]/g,""));
  return Number.isFinite(n)?n:0;
}

async function agendarColetaRodonavesComEndereco(){
  const protocolo=protocoloAtualParaColeta().replace(/\D/g,"");
  const dataHora=formatarDataHoraApiColeta();
  const local=localColetaTela();
  const faltando=validarLocalColeta(local);

  if(!protocolo)return alert("Informe o protocolo atual da cotação Rodonaves.");
  if(!dataHora)return alert("Informe a data e o horário da coleta.");
  if(faltando.length)return alert("Preencha o endereço alternativo: "+faltando.join(", "));

  const faltandoDestino=[];
  if(!String(cv("coletaCepDestino")||"").replace(/\D/g,""))faltandoDestino.push("CEP do destino");
  if(!cv("coletaEnderecoDestino"))faltandoDestino.push("logradouro do destino");
  if(!cv("coletaNumeroDestino"))faltandoDestino.push("número do destino");
  if(!cv("coletaBairroDestino"))faltandoDestino.push("bairro do destino");
  if(!cv("coletaCidadeDestino"))faltandoDestino.push("cidade/UF do destino");
  if(faltandoDestino.length){
    return alert("A Rodonaves exige o endereço completo do destino para este tipo de coleta. Preencha: "+faltandoDestino.join(", "));
  }
  if(cv("coletaTipoFrete")!=="CIF")return alert("O agendamento automático está liberado somente para CIF.");

  const confirmar=confirm(
    `CONFIRMAR COLETA REAL COM ENDEREÇO ALTERNATIVO?\n\n`+
    `Protocolo de referência: ${protocolo}\n`+
    `Local: ${local.nome}\n`+
    `${local.logradouro}, ${local.numero} — ${local.bairro}\n`+
    `${local.cidade}/${local.uf} — CEP ${local.cep}\n`+
    `Data/hora: ${new Date(dataHora).toLocaleString("pt-BR")}\n\n`+
    `A Rodonaves receberá uma solicitação completa com este endereço.`
  );
  if(!confirmar)return;

  const chave=await chaveAdminColeta();
  if(!chave)return;
  const btn=ce("btnAgendarRodonavesApi");
  btn.disabled=true;
  btn.textContent="Agendando com endereço...";
  resultadoApiColeta("processando","Enviando solicitação completa para a Rodonaves...");

  try{
    let id=cv("coletaAgendamentoId");
    if(!id){
      await salvarAgendamentoColetaSemAviso();
      id=cv("coletaAgendamentoId");
    }
    const resposta=await fetch("/api/integracoes?action=agendar-coleta-rodonaves-endereco",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-integrations-admin-key":chave
      },
      body:JSON.stringify({
        agendamento_id:id||null,
        cotacao_id:cv("coletaCotacaoId")||null,
        resposta_cotacao_id:cv("coletaRespostaId")||null,
        protocolo_referencia:protocolo,
        pickup_service_type:Number(cv("coletaServicoApi")||1),
        schedule_date:dataHora,
        comment:cv("coletaComentarioApi")||cv("coletaObservacao")||"",
        origem:local,
        destino:{
          cnpj:String(cv("coletaCnpjDestino")||"").replace(/\D/g,""),
          razao_social:cv("coletaRazaoDestino"),
          cep:String(cv("coletaCepDestino")||"").replace(/\D/g,""),
          cidade_uf:cv("coletaCidadeDestino"),
          logradouro:cv("coletaEnderecoDestino")||"",
          numero:cv("coletaNumeroDestino")||"",
          complemento:cv("coletaComplementoDestino")||"",
          bairro:cv("coletaBairroDestino")||""
        },
        carga:{
          volumes:numeroColetaApi(cv("coletaVolumes"))||1,
          peso:numeroColetaApi(cv("coletaPeso")),
          valor_nf:numeroColetaApi(cv("coletaValorNf")),
          numero_nf:cv("coletaNumeroNf"),
          medidas:cv("coletaMedidas"),
          mercadoria:cv("coletaMercadoria"),
          embalagem:cv("coletaEmbalagem")
        }
      })
    });
    const dados=await resposta.json().catch(()=>({}));
    if(!resposta.ok)throw new Error([dados.erro,dados.diagnostico?.mensagem,dados.detalhe].filter(Boolean).join(" — ")||`HTTP ${resposta.status}`);

    ce("coletaAgendamentoId").value=dados.agendamento_id||id||"";
    ce("coletaApiStatus").textContent=dados.status||"Solicitada";
    ce("btnConsultarRodonavesApi").style.display=dados.pickup_id?"inline-flex":"none";
    ce("btnConsultarRodonavesApi").dataset.pickupId=dados.pickup_id||"";
    resultadoApiColeta("sucesso",[
      "COLETA SOLICITADA COM ENDEREÇO ALTERNATIVO",
      `Protocolo de referência: ${protocolo}`,
      `Código da coleta: ${dados.pickup_id||"não informado"}`,
      `Local: ${local.logradouro}, ${local.numero} — ${local.bairro}`,
      `Status: ${dados.status||"solicitada"}`
    ].join("\n"));
    await carregarAgendamentosColeta();
  }catch(erro){
    resultadoApiColeta("erro","Não foi possível agendar com o endereço alternativo:\n"+erro.message);
  }finally{
    btn.disabled=false;
    atualizarModoEnderecoColeta();
  }
}

function esquecerChaveIntegracoesNesteComputador(){
  localStorage.removeItem("integrations_admin_key");
  sessionStorage.removeItem("integrations_admin_key");
  atualizarStatusChaveColeta("Chave removida");
  alert("A chave administrativa salva neste computador foi removida.");
}

async function preencherDestinoClienteAutomaticamente(){
  const clienteId=cv("coletaClienteId");
  let cliente=(emailClientes||[]).find(c=>String(c.id)===String(clienteId));

  if(!cliente&&cv("coletaClienteBusca")){
    cliente=(emailClientes||[]).find(c=>
      normalizarNomeEmail(c.nome)===normalizarNomeEmail(cv("coletaClienteBusca"))
    );
  }
  if(!cliente)return false;

  selecionarClienteColeta(cliente.id);
  return true;
}

function mascararDocumentoColeta(v){
  const n=String(v||"").replace(/\D/g,"");
  if(n.length<=4)return "****";
  return n.slice(0,2)+"***"+n.slice(-4);
}
function mostrarResumoSeguroColetaRodonaves(){
  const alternativo=cv("coletaModoEnderecoApi")==="alternativo";
  const box=ce("coletaPayloadResumo");
  if(!box)return;

  const linhas=[
    "RESUMO SEGURO DO ENVIO",
    `Modo: ${alternativo?"endereço alternativo":"endereço do protocolo"}`,
    `Protocolo interno: ${protocoloAtualParaColeta()||"não informado"}`,
    `Origem: ${cv("coletaAltLogradouro")||cv("coletaEnderecoColeta")||""}, ${cv("coletaAltNumero")||""}`,
    `Destino: ${cv("coletaEnderecoDestino")||""}, ${cv("coletaNumeroDestino")||""}`,
    `Documento destino: ${mascararDocumentoColeta(cv("coletaCnpjDestino"))}`,
    `Volumes: ${cv("coletaVolumes")||"0"}`,
    `Peso total: ${cv("coletaPeso")||"0"} kg`,
    `Data: ${cv("coletaDataApi")||""} ${cv("coletaHoraApi")||""}`
  ];
  box.style.display="block";
  box.className="coleta-api-resultado sucesso";
  box.textContent=linhas.join("\n");
}

let coletaEventosRodonaves=[];
function dataColetaPainel(a){return a.data_programada||a.solicitado_api_em||a.created_at}
function statusColetaPainel(a){
  const bruto=String(a.status_api||a.status||"rascunho")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .trim().replace(/[^a-z0-9]+/g,"_");
  const mapa={
    confirmada:"confirmado",
    coletada:"coletado",
    cancelada:"cancelado",
    solicitada:"solicitado"
  };
  return mapa[bruto]||bruto||"rascunho";
}
function coletaTemDadosReais(a){
  return Boolean(
    a?.cliente_nome ||
    a?.transportadora_id ||
    a?.protocolo_cotacao ||
    a?.codigo_coleta ||
    a?.data_programada ||
    a?.telefone_coleta
  );
}
function coletaEhRascunhoVazio(a){
  return statusColetaPainel(a)==="rascunho" && !a?.codigo_coleta && !coletaTemDadosReais(a);
}
function codigoColetaPodeConsultar(a){
  if(!a?.codigo_coleta)return false;
  const origemExterna=Boolean(a?.dados?.origem_externa||a?.origem==="importacao_externa");
  if(!origemExterna)return true;
  return a?.dados?.codigo_coleta_validado===true;
}
function codigoColetaAparentaSerProtocolo(a){
  const c=String(a?.codigo_coleta||"").replace(/\D/g,"");
  const p=String(a?.protocolo_cotacao||"").replace(/\D/g,"");
  return Boolean(c&&p&&c===p);
}
function enderecoColetaPainel(a){
  if(a.modo_endereco==="alternativo"){
    const e=a.endereco_coleta_alternativo||{};
    return [e.logradouro,e.numero,e.bairro,e.cidade,e.uf].filter(Boolean).join(", ");
  }
  const externo=a?.dados?.endereco_coleta_externo||a?.dados?.endereco_coleta||"";
  if(externo)return externo;
  return "Endereço vinculado ao protocolo";
}
function statusLabelColeta(s){const m={rascunho:"Rascunho",solicitado:"Solicitada",em_aberto:"Em aberto",confirmado:"Confirmada",em_coleta:"Em coleta",coletado:"Coletada",cancelamento_solicitado:"Cancelamento solicitado",cancelado:"Cancelada",erro:"Erro"};return m[s]||String(s||"—").replace(/_/g," ")}
function classeStatusColeta(s){if(/coletado|confirmado/.test(s))return"sucesso";if(/erro|cancelado/.test(s))return"erro";if(/cancelamento/.test(s))return"alerta";return"aguardando"}
async function carregarEventosRodonaves(){
  const r=await banco.from("coleta_status_eventos").select("*,coleta_agendamentos(cliente_nome,codigo_coleta)").order("created_at",{ascending:false}).limit(100);
  coletaEventosRodonaves=r.error?[]:(r.data||[]);
  const tb=ce("coletaEventosRodonavesTabela");if(!tb)return;
  tb.innerHTML=coletaEventosRodonaves.length?coletaEventosRodonaves.map(e=>`<tr><td>${new Date(e.created_at).toLocaleString("pt-BR")}</td><td>${escaparHtmlEmail(e.coleta_agendamentos?.cliente_nome||"—")}</td><td>${escaparHtmlEmail(e.coleta_agendamentos?.codigo_coleta||"—")}</td><td>${escaparHtmlEmail(statusLabelColeta(e.status_anterior))}</td><td>${escaparHtmlEmail(statusLabelColeta(e.status_novo))}</td><td>${escaparHtmlEmail(e.origem||"sistema")}</td><td>${escaparHtmlEmail(e.usuario||"—")}</td></tr>`).join(""):'<tr><td colspan="7">Nenhum evento registrado.</td></tr>';
}
function detectarDuplicidadesRodonaves(lista){const g={};lista.filter(a=>a.protocolo_cotacao&&!["cancelado","coletado"].includes(statusColetaPainel(a))).forEach(a=>{const k=String(a.protocolo_cotacao);(g[k]??=[]).push(a)});return Object.entries(g).filter(([,v])=>v.length>1)}
async function carregarPainelRodonaves(){
  await carregarAgendamentosColeta();
  const ids=(coletaAgendamentos||[]).map(x=>x.id);
  let contagemPedidos={};
  if(ids.length){
    try{
      const rp=await banco.from("coleta_pedidos_vinculados").select("agendamento_id").in("agendamento_id",ids);
      if(!rp.error)(rp.data||[]).forEach(p=>contagemPedidos[p.agendamento_id]=(contagemPedidos[p.agendamento_id]||0)+1);
    }catch(e){console.warn("Pedidos vinculados:",e)}
  }
  const lista=(coletaAgendamentos||[]);
  const hoje=new Date().toISOString().slice(0,10);

  ce("coletaKpiHoje").textContent=lista.filter(a=>String(dataColetaPainel(a)||"").slice(0,10)===hoje).length;
  ce("coletaKpiAbertas").textContent=lista.filter(a=>!["coletado","cancelado"].includes(statusColetaPainel(a))).length;
  ce("coletaKpiConfirmadas").textContent=lista.filter(a=>/confirmado|confirmada/.test(statusColetaPainel(a))).length;
  ce("coletaKpiColetadas").textContent=lista.filter(a=>/coletado|coletada/.test(statusColetaPainel(a))).length;
  ce("coletaKpiErros").textContent=lista.filter(a=>/erro/.test(statusColetaPainel(a))).length;

  const dup=detectarDuplicidadesRodonaves(lista);
  const alerta=ce("coletaAlertaDuplicidade");
  alerta.style.display=dup.length?"block":"none";
  alerta.textContent=dup.length?`⚠ Protocolos com mais de uma coleta aberta: ${dup.map(([p])=>p).join(", ")}`:"";

  const tb=ce("coletaPainelRodonavesTabela");
  const ord=[...lista].sort((a,b)=>new Date(dataColetaPainel(b)||0)-new Date(dataColetaPainel(a)||0));

  tb.innerHTML=ord.length?ord.map(a=>{
    const s=statusColetaPainel(a);
    const rascunho=coletaEhRascunhoVazio(a);
    const encerrada=["coletado","cancelado"].includes(s);
    const podeAtualizarManual=!rascunho&&!encerrada;
    const origemExterna=a?.dados?.origem_externa||a?.origem||"";
    const textoBusca=[a.cliente_nome,a.frete_transportadoras?.nome,a.numero_nf,a?.dados?.numero_nf,a?.dados?.numero_nfe,a.protocolo_cotacao,a.codigo_coleta,enderecoColetaPainel(a),statusLabelColeta(s),s,origemExterna].filter(Boolean).join(" ").toLowerCase();
    return `<tr class="linha-painel-coleta" data-status="${escaparHtmlEmail(s)}" data-busca="${escaparHtmlEmail(textoBusca)}">
      <td>${rascunho?`<input type="checkbox" class="coleta-check-rascunho" value="${a.id}" aria-label="Selecionar rascunho">`:""}</td>
      <td>${dataColetaPainel(a)?new Date(dataColetaPainel(a)).toLocaleString("pt-BR"):"—"}</td>
      <td>${escaparHtmlEmail(a.cliente_nome||"—")}</td>
      <td>${escaparHtmlEmail(a.protocolo_cotacao||"—")}</td>
      <td>${escaparHtmlEmail(a.codigo_coleta||"—")}</td>
      <td>${escaparHtmlEmail(enderecoColetaPainel(a))}</td>
      <td><span class="coleta-status-painel ${classeStatusColeta(s)}">${escaparHtmlEmail(statusLabelColeta(s))}</span></td>
      <td>${a.consultado_api_em?new Date(a.consultado_api_em).toLocaleString("pt-BR"):"—"}</td>
      <td>
        ${codigoColetaPodeConsultar(a)&&/rodonaves/i.test(a.frete_transportadoras?.nome||"")?`<button class="btn azul" onclick="consultarColetaPainelRodonaves('${a.id}')">Atualizar API</button>`:""}
        ${a?.dados?.origem_externa?`<span class="coleta-manual-tag">Origem: ${escaparHtmlEmail(String(a.dados.origem_externa).replace(/_/g," "))}</span>`:""}
        ${!/rodonaves/i.test(a.frete_transportadoras?.nome||"")?`<span class="coleta-manual-tag">Atualização manual</span>`:""}
        ${/rodonaves/i.test(a.frete_transportadoras?.nome||"")&&!codigoColetaPodeConsultar(a)?`<span class="coleta-manual-tag">${a.numero_nf||a?.dados?.numero_nf||a.protocolo_cotacao?"Monitorando pelo rastreio (protocolo/NF)":"Aguardando identificador"}</span>`:""}
        ${/rodonaves/i.test(a.frete_transportadoras?.nome||"")?`<button class="btn azul" onclick="informarNfPainelColeta('${a.id}')">Informar NF / rastrear</button>`:""}
        ${/rodonaves/i.test(a.frete_transportadoras?.nome||"")&&!codigoColetaPodeConsultar(a)?`<button class="btn roxo" onclick="abrirVinculoCodigoColeta('${a.id}')">Informar/vincular código</button>`:""}
        <button class="btn verde" onclick="editarAgendamentoColeta('${a.id}');mostrarPainelColeta('nova')">Abrir</button>
        <button class="btn azul" onclick="abrirPedidosDaColeta('${a.id}')">Pedidos (${contagemPedidos[a.id]||1})</button>
        ${a.ajuste_carga_pendente?`<span class="coleta-ajuste-pendente">⚠ Ajuste de carga pendente</span>`:""}
        ${rascunho?`<button class="btn vermelho" onclick="excluirRascunhoColetaRodonaves('${a.id}')">Excluir</button>`:""}
        ${podeAtualizarManual?`<button class="btn coleta-manual" onclick="alterarStatusManualColeta('${a.id}','coletado')">Marcar coletada</button>`:""}
        ${podeAtualizarManual?`<button class="btn coleta-alerta" onclick="alterarStatusManualColeta('${a.id}','nao_coletada')">Não coletada</button>`:""}
        ${podeAtualizarManual?`<button class="btn roxo" onclick="reagendarColetaManual('${a.id}')">Reagendar</button>`:""}
        ${podeAtualizarManual?`<button class="btn vermelho" onclick="solicitarCancelamentoColetaRodonaves('${a.id}')">Cancelar</button>`:""}
      </td>
    </tr>`;
  }).join(""):'<tr><td colspan="9">Nenhuma coleta Rodonaves registrada.</td></tr>';

  if(ce("coletaSelecionarTodosRascunhos"))ce("coletaSelecionarTodosRascunhos").checked=false;
  filtrarPainelColetas();
  await carregarEventosRodonaves();
}
async function registrarEventoColeta(id,ant,novo,origem,detalhes){const r=await banco.from("coleta_status_eventos").insert([{agendamento_id:id,status_anterior:ant||null,status_novo:novo||null,origem:origem||"sistema",detalhes:detalhes||null,usuario:usuarioLogado?.login||"sistema"}]);if(r.error)console.warn(r.error.message)}
async function consultarColetaPainelRodonaves(id){
  const a=coletaAgendamentos.find(x=>String(x.id)===String(id));
  if(!a?.codigo_coleta)return alert("Esta coleta ainda não possui código/ID da coleta.");
  if(!codigoColetaPodeConsultar(a))return alert("O número informado ainda não foi confirmado como código da coleta da Rodonaves. Clique em Informar/vincular código.");
  const chave=await chaveAdminColeta();if(!chave)return;
  try{const identificador=a.codigo_coleta||a.protocolo_cotacao;if(!identificador)throw new Error("Esta coleta não possui código nem protocolo para consulta.");const r=await fetch(`/api/integracoes?action=consultar-coleta-rodonaves&id=${encodeURIComponent(identificador)}&agendamento_id=${encodeURIComponent(a.id)}`,{headers:{"x-integrations-admin-key":chave}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);await carregarPainelRodonaves()}catch(e){
    const msg=String(e.message||e);
    if(/não encontrado|not found|404/i.test(msg)){
      alert("A Rodonaves não encontrou esse código de coleta. Verifique se foi informado o código da coleta, e não o protocolo da cotação.");
    }else{
      alert("Não foi possível consultar a coleta: "+msg);
    }
  }
}
async function atualizarTodasColetasRodonaves(){
  const abertas=(coletaAgendamentos||[]).filter(a=>/rodonaves/i.test(a.frete_transportadoras?.nome||"")&&codigoColetaPodeConsultar(a)&&!["coletado","cancelado"].includes(statusColetaPainel(a)));
  if(!abertas.length)return alert("Não há coletas abertas com código para consultar.");
  if(!confirm(`Consultar ${abertas.length} coleta(s) aberta(s)?`))return;
  for(const a of abertas){try{await consultarColetaPainelRodonaves(a.id)}catch{}}
}
async function solicitarCancelamentoColetaRodonaves(id){
  const a=coletaAgendamentos.find(x=>String(x.id)===String(id));if(!a)return;
  const motivo=prompt("Informe o motivo do cancelamento:","Coleta não será mais necessária");if(motivo===null)return;
  if(!confirm(`Registrar solicitação de cancelamento?\n\nCliente: ${a.cliente_nome}\nColeta: ${a.codigo_coleta||"sem código"}\n\nO cancelamento deverá ser concluído no portal, telefone ou WhatsApp.`))return;
  const ant=statusColetaPainel(a),agora=new Date().toISOString();
  const r=await banco.from("coleta_agendamentos").update({status:"cancelamento_solicitado",status_api:"cancelamento_solicitado",cancelamento_motivo:String(motivo||"").trim()||null,cancelamento_solicitado_em:agora,cancelamento_solicitado_por:usuarioLogado?.login||"sistema",atualizado_em:agora}).eq("id",id);
  if(r.error)return alert(r.error.message);
  await registrarEventoColeta(id,ant,"cancelamento_solicitado","usuario",{motivo});await carregarPainelRodonaves();alert("Solicitação registrada. Confirme o cancelamento com a Rodonaves.");
}

function idsRascunhosSelecionadosRodonaves(){
  return [...document.querySelectorAll(".coleta-check-rascunho:checked")].map(el=>el.value);
}
function selecionarTodosRascunhosRodonaves(marcar){
  document.querySelectorAll(".coleta-check-rascunho").forEach(el=>el.checked=!!marcar);
}
async function excluirRascunhoColetaRodonaves(id){
  const a=(coletaAgendamentos||[]).find(x=>String(x.id)===String(id));
  if(!a)return;
  if(statusColetaPainel(a)!=="rascunho"||a.codigo_coleta){
    return alert("Somente rascunhos que nunca foram enviados podem ser excluídos.");
  }
  if(!confirm(`Excluir este rascunho?\n\nCliente: ${a.cliente_nome||"—"}\nProtocolo: ${a.protocolo_cotacao||"—"}\n\nEsta operação não pode ser desfeita.`))return;
  const r=await banco.from("coleta_agendamentos").delete().eq("id",id).eq("status","rascunho").is("codigo_coleta",null);
  if(r.error)return alert("Não foi possível excluir: "+r.error.message);
  await carregarPainelRodonaves();
}
async function excluirRascunhosSelecionadosRodonaves(){
  const ids=idsRascunhosSelecionadosRodonaves();
  if(!ids.length)return alert("Selecione pelo menos um rascunho.");
  if(!confirm(`Excluir ${ids.length} rascunho(s) selecionado(s)?\n\nSomente registros ainda não enviados serão removidos.`))return;
  const r=await banco.from("coleta_agendamentos").delete().in("id",ids).eq("status","rascunho").is("codigo_coleta",null);
  if(r.error)return alert("Não foi possível excluir os rascunhos: "+r.error.message);
  await carregarPainelRodonaves();
  alert("Rascunhos excluídos com sucesso.");
}
async function limparRascunhosAntigosRodonaves(){
  const diasTexto=prompt("Excluir rascunhos sem código criados há quantos dias ou mais?","1");
  if(diasTexto===null)return;
  const dias=Math.max(1,Math.trunc(Number(diasTexto)||1));
  const limite=new Date(Date.now()-dias*86400000);
  const candidatos=(coletaAgendamentos||[]).filter(a=>
    /rodonaves/i.test(a.frete_transportadoras?.nome||"")&&
    statusColetaPainel(a)==="rascunho"&&!a.codigo_coleta&&
    new Date(a.created_at)<limite
  );
  if(!candidatos.length)return alert(`Não há rascunhos com ${dias} dia(s) ou mais.`);
  if(!confirm(`Excluir ${candidatos.length} rascunho(s) antigo(s)?\n\nCritério: sem código da coleta e criados há ${dias} dia(s) ou mais.`))return;
  const r=await banco.from("coleta_agendamentos").delete()
    .in("id",candidatos.map(a=>a.id))
    .eq("status","rascunho")
    .is("codigo_coleta",null);
  if(r.error)return alert("Não foi possível limpar: "+r.error.message);
  await carregarPainelRodonaves();
  alert("Limpeza concluída.");
}
async function verificarColetaDuplicadaAntesDeSalvar(){
  const protocolo=String(protocoloAtualParaColeta()||"").trim();
  if(!protocolo)return true;

  const atualId=String(cv("coletaAgendamentoId")||"");
  const existente=(coletaAgendamentos||[]).find(a=>
    String(a.id)!==atualId&&
    String(a.protocolo_cotacao||"").trim()===protocolo&&
    !["cancelado","coletado"].includes(statusColetaPainel(a))
  );
  if(!existente)return true;

  const abrir=confirm(
    `Já existe uma coleta ou rascunho aberto para o protocolo ${protocolo}.\n\n`+
    `Cliente: ${existente.cliente_nome||"—"}\nStatus: ${statusLabelColeta(statusColetaPainel(existente))}\n\n`+
    `Clique em OK para abrir o registro existente.\nClique em Cancelar para avaliar a criação de outro.`
  );
  if(abrir){
    editarAgendamentoColeta(existente.id);
    mostrarPainelColeta("nova");
    return false;
  }
  return confirm("Confirma a criação de outro registro para o mesmo protocolo?");
}

/* =========================================================
   V19 — FLUXO LOGÍSTICO COMPLETO
   ========================================================= */
let rastreamentosLogistica=[];
let transportadorasRastreamentoIntegrado=[];
let pedidosVinculadosColeta=[];


async function alterarStatusManualColeta(id,novoStatus){
  const a=(coletaAgendamentos||[]).find(x=>String(x.id)===String(id));
  if(!a)return;
  const rotulo=novoStatus==="coletado"?"coletada":"não coletada";
  const obs=prompt(`Observação para marcar como ${rotulo}:`,"");
  if(obs===null)return;
  if(!confirm(`Confirmar alteração para "${rotulo}"?\n\nCliente: ${a.cliente_nome||"—"}\nTransportadora: ${a.frete_transportadoras?.nome||"—"}`))return;
  const anterior=statusColetaPainel(a);
  const agora=new Date().toISOString();
  const payload={
    status:novoStatus,
    status_api:novoStatus,
    atualizado_em:agora,
    consultado_api_em:agora
  };
  if(novoStatus==="coletado")payload.coletado_em=agora;
  const r=await banco.from("coleta_agendamentos").update(payload).eq("id",id);
  if(r.error)return alert(r.error.message);
  await registrarEventoColeta(id,anterior,novoStatus,"atualizacao_manual",{observacao:obs||null});
  if(novoStatus==="coletado"){
    await criarOuVincularRastreioDaColeta(id,{...a,...payload,status:"coletado"},"atualizacao_manual");
  }
  await carregarPainelRodonaves();
  if(ce("rastreamentoTabelaSaidas"))await carregarRastreamentosLogistica("saida");
}

async function reagendarColetaManual(id){
  const a=(coletaAgendamentos||[]).find(x=>String(x.id)===String(id));
  if(!a)return;
  const dataAtual=String(a.data_programada||"").slice(0,16);
  const nova=prompt("Informe a nova data e hora no formato AAAA-MM-DD HH:MM:",dataAtual.replace("T"," "));
  if(nova===null)return;
  const normalizada=nova.trim().replace(" ","T");
  const dt=new Date(normalizada);
  if(Number.isNaN(dt.getTime()))return alert("Data e hora inválidas.");
  const anterior=statusColetaPainel(a);
  const r=await banco.from("coleta_agendamentos").update({
    status:"reagendada",
    status_api:"reagendada",
    data_programada:dt.toISOString(),
    atualizado_em:new Date().toISOString()
  }).eq("id",id);
  if(r.error)return alert(r.error.message);
  await registrarEventoColeta(id,anterior,"reagendada","atualizacao_manual",{nova_data:dt.toISOString()});
  await carregarPainelRodonaves();
}

function formularioRastreamentoHtml(sentido){
  const titulo=sentido==="entrada"?"Fornecedor/remetente":"Cliente/destinatário";
  const transportadoras='<option value="">Selecione</option>'+coletaTransportadoras.map(t=>`<option value="${t.id}">${escaparHtmlEmail(t.nome||"")}</option>`).join("");
  return `<div class="rastreamento-grid">
    <input type="hidden" id="rastId_${sentido}">
    <div><label>${titulo}</label><input id="rastParceiro_${sentido}" placeholder="${titulo}"></div>
    <div><label>Transportadora</label><select id="rastTransportadora_${sentido}">${transportadoras}</select></div>
    <div><label>Número da NF-e</label><input id="rastNfe_${sentido}"></div>
    <div><label>Chave da NF-e</label><input id="rastChave_${sentido}" maxlength="44"></div>
    <div><label>Número do CT-e</label><input id="rastCte_${sentido}"></div>
    <div><label>Protocolo de rastreio</label><input id="rastProtocolo_${sentido}"></div>
    <div class="rastreamento-consulta-inteligente">
      Consulta inteligente: Protocolo/Minuta → Nota Fiscal → CT-e → Chave da NF-e.
    </div>
    <div><label>Data de postagem/coleta</label><input id="rastData_${sentido}" type="date"></div>
    <div><label>Previsão de entrega</label><input id="rastPrevisao_${sentido}" type="date"></div>
    <div><label>Volumes</label><input id="rastVolumes_${sentido}" type="number" min="1"></div>
    <div><label>Status</label><select id="rastStatus_${sentido}">
      <option value="aguardando_coleta">Aguardando coleta</option>
      <option value="em_transito">Em trânsito</option>
      <option value="na_filial">Na filial</option>
      <option value="saiu_entrega">Saiu para entrega</option>
      <option value="${sentido==="entrada"?"recebido":"entregue"}">${sentido==="entrada"?"Recebido":"Entregue"}</option>
      <option value="atrasado">Atrasado</option>
      <option value="ocorrencia">Com ocorrência</option>
    </select></div>
    <div class="campo-largo"><label>Observação</label><textarea id="rastObs_${sentido}" rows="2"></textarea></div>
    <div class="campo-largo email-acoes">
      <button class="btn verde" onclick="salvarRastreamentoLogistica('${sentido}')">Salvar</button>
      <button class="btn azul" onclick="fecharFormularioRastreamento('${sentido}')">Fechar</button>
    </div>
  </div>`;
}
function abrirFormularioRastreamento(sentido,id=null){
  const box=ce(sentido==="entrada"?"rastreamentoFormEntrada":"rastreamentoFormSaida");
  box.innerHTML=formularioRastreamentoHtml(sentido);
  box.style.display="block";
  if(id){
    const r=rastreamentosLogistica.find(x=>String(x.id)===String(id));
    if(r){
      ce(`rastId_${sentido}`).value=r.id;
      ce(`rastParceiro_${sentido}`).value=r.parceiro_nome||"";
      ce(`rastTransportadora_${sentido}`).value=r.transportadora_id||"";
      ce(`rastNfe_${sentido}`).value=r.numero_nfe||"";
      ce(`rastChave_${sentido}`).value=r.chave_nfe||"";
      ce(`rastCte_${sentido}`).value=r.numero_cte||"";
      ce(`rastProtocolo_${sentido}`).value=r.protocolo_rastreio||"";
      ce(`rastData_${sentido}`).value=String(r.data_postagem||"").slice(0,10);
      ce(`rastPrevisao_${sentido}`).value=String(r.previsao_entrega||"").slice(0,10);
      ce(`rastVolumes_${sentido}`).value=r.volumes||"";
      ce(`rastStatus_${sentido}`).value=r.status||"em_transito";
      ce(`rastObs_${sentido}`).value=r.observacao||"";
    }
  }
}
function fecharFormularioRastreamento(sentido){
  const box=ce(sentido==="entrada"?"rastreamentoFormEntrada":"rastreamentoFormSaida");
  box.style.display="none";box.innerHTML="";
}
async function salvarRastreamentoLogistica(sentido){
  const id=cv(`rastId_${sentido}`);
  const parceiro=cv(`rastParceiro_${sentido}`).trim();
  if(!parceiro)return alert(sentido==="entrada"?"Informe o fornecedor/remetente.":"Informe o cliente/destinatário.");

  const payload={
    sentido,
    parceiro_nome:parceiro,
    transportadora_id:cv(`rastTransportadora_${sentido}`)||null,
    numero_nfe:cv(`rastNfe_${sentido}`).trim()||null,
    chave_nfe:cv(`rastChave_${sentido}`).replace(/\D/g,"")||null,
    numero_cte:cv(`rastCte_${sentido}`).trim()||null,
    protocolo_rastreio:cv(`rastProtocolo_${sentido}`).trim()||null,
    data_postagem:cv(`rastData_${sentido}`)||null,
    previsao_entrega:cv(`rastPrevisao_${sentido}`)||null,
    volumes:Number(cv(`rastVolumes_${sentido}`))||null,
    status:cv(`rastStatus_${sentido}`)||"em_transito",
    observacao:cv(`rastObs_${sentido}`)||null,
    atualizado_em:new Date().toISOString(),
    atualizado_por:usuarioLogado?.login||null
  };

  // Ao EDITAR, o próprio registro aberto é sempre a base.
  // Procuramos outro registro com a mesma NF/chave/CT-e/protocolo apenas para consolidar.
  if(id){
    const atual=(rastreamentosLogistica||[]).find(x=>String(x.id)===String(id));
    const duplicado=await localizarRastreamentoExistente({
      id,
      sentido,
      transportadoraId:payload.transportadora_id,
      numeroNfe:payload.numero_nfe,
      chaveNfe:payload.chave_nfe,
      numeroCte:payload.numero_cte,
      protocolo:payload.protocolo_rastreio,
      coletaAgendamentoId:atual?.coleta_agendamento_id||null
    });

    const consolidado={
      ...payload,
      coleta_agendamento_id:atual?.coleta_agendamento_id||duplicado?.coleta_agendamento_id||null,
      origem:atual?.origem||duplicado?.origem||null,
      status_api:atual?.status_api||duplicado?.status_api||null,
      ultima_ocorrencia:atual?.ultima_ocorrencia||duplicado?.ultima_ocorrencia||null,
      ultima_ocorrencia_em:atual?.ultima_ocorrencia_em||duplicado?.ultima_ocorrencia_em||null,
      consulta_api:atual?.consulta_api||duplicado?.consulta_api||null,
      consultado_api_em:atual?.consultado_api_em||duplicado?.consultado_api_em||null,
      metodo_consulta:atual?.metodo_consulta||duplicado?.metodo_consulta||null,
      sincronizacao_erro:null
    };

    // Se o duplicado possui um vínculo de coleta e o atual ainda não,
    // removemos o duplicado primeiro para não bater no índice único do vínculo.
    if(duplicado?.id&&duplicado.coleta_agendamento_id&&!atual?.coleta_agendamento_id){
      const del=await banco.from("logistica_rastreamentos").delete().eq("id",duplicado.id);
      if(del.error)return alert("Não foi possível consolidar o rastreio duplicado: "+del.error.message);
    }

    const upd=await banco.from("logistica_rastreamentos").update(consolidado).eq("id",id);
    if(upd.error)return alert(upd.error.message);

    if(duplicado?.id&&!(duplicado.coleta_agendamento_id&&!atual?.coleta_agendamento_id)){
      await banco.from("logistica_rastreamentos").delete().eq("id",duplicado.id);
    }

    // A função SQL também faz uma segunda conferência contra duplicidades antigas.
    try{await banco.rpc("fn_deduplicar_rastreamento",{p_id:id})}catch(e){console.warn(e)}
  }else{
    // Novo cadastro: se já houver um rastreio com algum identificador igual,
    // atualiza o existente em vez de inserir outro.
    const existente=await localizarRastreamentoExistente({
      sentido,
      transportadoraId:payload.transportadora_id,
      numeroNfe:payload.numero_nfe,
      chaveNfe:payload.chave_nfe,
      numeroCte:payload.numero_cte,
      protocolo:payload.protocolo_rastreio
    });

    const r=existente?.id
      ?await banco.from("logistica_rastreamentos").update({
          ...payload,
          coleta_agendamento_id:existente.coleta_agendamento_id||null,
          origem:existente.origem||null
        }).eq("id",existente.id)
      :await banco.from("logistica_rastreamentos").insert([payload]);

    if(r.error)return alert(r.error.message);
    if(existente?.id){
      try{await banco.rpc("fn_deduplicar_rastreamento",{p_id:existente.id})}catch(e){console.warn(e)}
    }
  }

  fecharFormularioRastreamento(sentido);
  await carregarRastreamentosLogistica(sentido);
}
async function carregarRastreamentosLogistica(sentido){
  try{
    if(sentido==="saida")await carregarTransportadorasRastreamentoIntegrado();
  }catch(e){
    console.warn("Falha ao carregar lista de integrações; continuando com o painel:",e);
  }
  const r=await banco.from("logistica_rastreamentos").select("*,frete_transportadoras(nome)").eq("sentido",sentido).order("created_at",{ascending:false});
  rastreamentosLogistica=r.error?[]:(r.data||[]);
  if(sentido==="saida"){
    rastreamentosLogistica=rastreamentosLogistica.filter(x=>
      transportadoraTemRastreamentoIntegrado(x.frete_transportadoras?.nome) &&
      !["entregue","recebido"].includes(String(x.status||"").toLowerCase())
    );
  }
  const entreguesStatus=sentido==="entrada"?"recebido":"entregue";
  const emTransito=rastreamentosLogistica.filter(x=>!["entregue","recebido","cancelado"].includes(x.status)).length;
  const entregues=rastreamentosLogistica.filter(x=>x.status===entreguesStatus).length;
  const atrasadas=rastreamentosLogistica.filter(x=>x.status==="atrasado"||(x.previsao_entrega&&new Date(x.previsao_entrega)<new Date()&&!["entregue","recebido"].includes(x.status))).length;
  if(sentido==="saida"){ce("rastSaidaTransito").textContent=emTransito;ce("rastSaidaEntregues").textContent=entregues;ce("rastSaidaAtrasadas").textContent=atrasadas}
  else{ce("rastEntradaTransito").textContent=emTransito;ce("rastEntradaRecebidas").textContent=entregues;ce("rastEntradaAtrasadas").textContent=atrasadas}
  const tb=ce(sentido==="entrada"?"rastreamentoTabelaEntradas":"rastreamentoTabelaSaidas");
  tb.innerHTML=rastreamentosLogistica.length?rastreamentosLogistica.map(x=>{
    const textoBusca=[x.parceiro_nome,x.frete_transportadoras?.nome,x.numero_nfe,x.chave_nfe,x.numero_cte,x.protocolo_rastreio,statusLabelRastreamento(x.status),x.status,x.observacao].filter(Boolean).join(" ").toLowerCase();
    return `<tr class="linha-rastreamento-logistica" data-status="${escaparHtmlEmail(x.status||"")}" data-busca="${escaparHtmlEmail(textoBusca)}">
    <td>${x.created_at?new Date(x.created_at).toLocaleDateString("pt-BR"):"—"}</td>
    <td>${escaparHtmlEmail(x.parceiro_nome||"—")}</td>
    <td>${escaparHtmlEmail(x.frete_transportadoras?.nome||"Não informada")}</td>
    <td>${escaparHtmlEmail(x.numero_nfe||"—")}</td>
    <td>${escaparHtmlEmail(x.numero_cte||x.protocolo_rastreio||"—")}</td>
    <td>${x.previsao_entrega?new Date(x.previsao_entrega+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td>
    <td>
      <span class="coleta-status-painel ${classeStatusRastreamento(x.status)}">${statusLabelRastreamento(x.status)}</span>
      ${x.ultima_ocorrencia?`<div class="rastreio-ultima-ocorrencia">${escaparHtmlEmail(x.ultima_ocorrencia)}</div>`:""}
      ${x.metodo_consulta?`<div class="rastreio-metodo">Localizado por: ${escaparHtmlEmail(x.metodo_consulta)}</div>`:""}
    </td>
    <td>
    ${transportadoraTemRastreamentoIntegrado(x.frete_transportadoras?.nome)&&(x.protocolo_rastreio||x.numero_cte||x.numero_nfe||x.chave_nfe)?`<button class="btn azul" onclick="atualizarRastreioIntegrado('${x.id}',this)">Atualizar rastreio</button>`:""}
    <button class="btn azul" onclick="abrirFormularioRastreamento('${sentido}','${x.id}')">Editar</button>
    ${!["entregue","recebido"].includes(x.status)?`<button class="btn verde" onclick="finalizarRastreamentoLogistica('${x.id}','${sentido}')">${sentido==="entrada"?"Marcar recebido":"Marcar entregue"}</button>`:""}
    <button class="btn vermelho" onclick="excluirRastreamentoLogistica('${x.id}','${sentido}')">Excluir</button></td></tr>`;
  }).join(""):'<tr><td colspan="8">Nenhum registro encontrado.</td></tr>';
  filtrarRastreamentosLogistica(sentido);
}


let rastreamentosEntregues=[];

async function salvarIdentificadoresERastrearColeta(){
  const agendamentoId=cv("coletaAgendamentoId");
  if(!agendamentoId)return alert("Abra primeiro uma coleta salva no Painel de Coletas.");
  const coleta=(coletaAgendamentos||[]).find(x=>String(x.id)===String(agendamentoId));
  if(!coleta)return alert("Coleta não encontrada.");

  const numeroNf=cv("coletaNumeroNfRastreio").trim()||null;
  const chaveNfe=cv("coletaChaveNfeRastreio").replace(/\D/g,"")||null;
  const numeroCte=cv("coletaNumeroCteRastreio").trim()||null;
  const protocolo=cv("coletaProtocoloRastreio").trim()||coleta.protocolo_cotacao||null;
  const statusEl=ce("coletaIdentificadoresStatus");

  if(!numeroNf&&!chaveNfe&&!numeroCte&&!protocolo){
    return alert("Informe pelo menos NF, chave NF-e, CT-e ou protocolo.");
  }

  try{
    if(statusEl)statusEl.textContent="Salvando identificadores...";
    const dadosAtualizados={
      ...(coleta.dados||{}),
      numero_nf:numeroNf,numero_nfe:numeroNf,chave_nfe:chaveNfe,
      numero_cte:numeroCte,protocolo_rastreio:protocolo
    };
    const up=await banco.from("coleta_agendamentos").update({
      numero_nf:numeroNf,chave_nfe:chaveNfe,numero_cte:numeroCte,
      protocolo_rastreio:protocolo,dados:dadosAtualizados,
      atualizado_em:new Date().toISOString()
    }).eq("id",agendamentoId).select().single();
    if(up.error)throw up.error;

    await criarOuVincularRastreioDaColeta(agendamentoId,{
      ...coleta,...up.data,
      numero_nf:numeroNf,numero_nfe:numeroNf,chave_nfe:chaveNfe,
      numero_cte:numeroCte,protocolo_rastreio:protocolo,
      protocolo_cotacao:protocolo||coleta.protocolo_cotacao
    },"painel_coletas");

    const existente=await localizarRastreamentoExistente({
      sentido:"saida",transportadoraId:coleta.transportadora_id,
      numeroNfe:numeroNf,chaveNfe,numeroCte,protocolo,
      coletaAgendamentoId:agendamentoId
    });

    if(existente?.id && /rodonaves/i.test(coleta.frete_transportadoras?.nome||"")){
      try{
        const {dados}=await consultarRastreioRodonavesRegistro(existente.id,{silencioso:true});
        if(statusEl)statusEl.textContent=`Rastreio localizado e atualizado: ${dados.statusBruto||statusLabelRastreamento(dados.status)||"OK"}`;
      }catch(e){if(statusEl)statusEl.textContent="Identificadores salvos. O rastreio ainda não retornou dados.";}
    }else if(existente?.id && /(^|\s)alfa(\s|$)|alfa transportes/i.test(coleta.frete_transportadoras?.nome||"")){
      try{
        const {dados}=await consultarRastreioAlfaRegistro(existente.id,{silencioso:true});
        if(statusEl)statusEl.textContent=`Rastreio Alfa localizado: ${dados.statusBruto||statusLabelRastreamento(dados.status)||"OK"}`;
      }catch(e){if(statusEl)statusEl.textContent="NF salva. A Alfa ainda não retornou rastreamento para esta nota.";}
    }else if(statusEl){
      statusEl.textContent="Identificadores salvos e vinculados.";
    }

    await carregarPainelRodonaves();
    await carregarRastreamentosLogistica("saida");
    await carregarRastreamentosEntregues();
  }catch(e){
    if(statusEl)statusEl.textContent="Falha ao salvar/rastrear.";
    alert("Não foi possível salvar e rastrear: "+e.message);
  }
}

async function carregarRastreamentosEntregues(){
  await carregarTransportadorasRastreamentoIntegrado();
  const r=await banco.from("logistica_rastreamentos")
    .select("*,frete_transportadoras(nome)")
    .eq("sentido","saida")
    .in("status",["entregue","recebido"])
    .order("ultima_ocorrencia_em",{ascending:false,nullsFirst:false})
    .order("created_at",{ascending:false});
  rastreamentosEntregues=r.error?[]:(r.data||[]).filter(x=>
    transportadoraTemRastreamentoIntegrado(x.frete_transportadoras?.nome)
  );
  renderRastreamentosEntregues();
}

function renderRastreamentosEntregues(){
  const tbody=ce("rastreamentoTabelaEntregues");
  if(!tbody)return;
  const busca=String(cv("rastBusca_entregues")||"").toLowerCase().trim();
  const lista=(rastreamentosEntregues||[]).filter(x=>!busca||[
    x.parceiro_nome,x.frete_transportadoras?.nome,x.numero_nfe,x.chave_nfe,
    x.numero_cte,x.protocolo_rastreio,x.status,x.ultima_ocorrencia
  ].some(v=>String(v||"").toLowerCase().includes(busca)));

  const hoje=new Date().toISOString().slice(0,10);
  if(ce("rastResumoEntregues"))ce("rastResumoEntregues").textContent=lista.length;
  if(ce("rastResumoEntreguesTotal"))ce("rastResumoEntreguesTotal").textContent=(rastreamentosEntregues||[]).length;
  if(ce("rastResumoEntreguesHoje"))ce("rastResumoEntreguesHoje").textContent=(rastreamentosEntregues||[]).filter(x=>String(x.ultima_ocorrencia_em||x.atualizado_em||"").slice(0,10)===hoje).length;

  tbody.innerHTML=lista.length?lista.map(x=>`
    <tr>
      <td>${x.data_postagem?new Date(x.data_postagem+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td>
      <td>${escaparHtmlEmail(x.parceiro_nome||"—")}</td>
      <td>${escaparHtmlEmail(x.frete_transportadoras?.nome||"—")}</td>
      <td>${escaparHtmlEmail(x.numero_nfe||"—")}</td>
      <td>${escaparHtmlEmail(x.numero_cte||x.protocolo_rastreio||"—")}</td>
      <td>${x.ultima_ocorrencia_em?new Date(x.ultima_ocorrencia_em).toLocaleString("pt-BR"):"—"}</td>
      <td><span class="status-rastreamento entregue">ENTREGUE</span>${x.ultima_ocorrencia?`<div class="rast-detalhe">${escaparHtmlEmail(x.ultima_ocorrencia)}</div>`:""}</td>
      <td>
        ${transportadoraTemRastreamentoIntegrado(x.frete_transportadoras?.nome)?`<button class="btn azul" onclick="atualizarRastreioIntegrado('${x.id}',this)">Atualizar rastreio</button>`:""}
        <button class="btn vermelho" onclick="excluirRastreamentoLogistica('${x.id}','saida')">Excluir</button>
      </td>
    </tr>`).join(""):'<tr><td colspan="8">Nenhuma mercadoria entregue encontrada.</td></tr>';
}

async function atualizarRastreioEntregue(id,botao=null){
  const original=botao?.textContent||"Atualizar rastreio";
  if(botao){botao.disabled=true;botao.textContent="Atualizando..."}
  try{
    await consultarRastreioRodonavesRegistro(id,{silencioso:true});
    await carregarRastreamentosEntregues();
  }catch(e){
    alert("Não foi possível atualizar: "+e.message);
  }finally{
    if(botao&&document.body.contains(botao)){botao.disabled=false;botao.textContent=original}
  }
}

async function atualizarTodosRastreiosEntregues(){
  const botao=ce("btnAtualizarTodosEntregues");
  const status=ce("statusAtualizarTodosEntregues");
  if(botao){botao.disabled=true;botao.textContent="Atualizando..."}
  try{
    await carregarRastreamentosEntregues();
    const chave=await chaveAdminColeta();
    if(!chave)throw new Error("Informe a chave administrativa.");
    let ok=0,erro=0;
    for(let i=0;i<rastreamentosEntregues.length;i++){
      const x=rastreamentosEntregues[i];
      const nome=x.frete_transportadoras?.nome||"";
      if(!(/rodonaves/i.test(nome)||/(^|\s)alfa(\s|$)|alfa transportes/i.test(nome)))continue;
      if(status)status.textContent=`Atualizando ${i+1}/${rastreamentosEntregues.length}...`;
      try{
        if(/rodonaves/i.test(nome))await consultarRastreioRodonavesRegistro(x.id,{silencioso:true,chave});
        else await consultarRastreioAlfaRegistro(x.id,{silencioso:true,chave});
        ok++;
      }catch(e){erro++}
      if(i<rastreamentosEntregues.length-1)await new Promise(r=>setTimeout(r,200));
    }
    await carregarRastreamentosEntregues();
    if(status)status.textContent=`Concluído: ${ok} atualizado(s), ${erro} erro(s).`;
  }catch(e){
    if(status)status.textContent="Falha na atualização.";
    alert(e.message);
  }finally{
    if(botao){botao.disabled=false;botao.textContent="🔄 Atualizar entregues"}
  }
}

async function obterRastreamentoPorId(id){
  const r=await banco.from("logistica_rastreamentos")
    .select("*,frete_transportadoras(nome)")
    .eq("id",id)
    .maybeSingle();
  if(r.error)throw r.error;
  return r.data||null;
}

async function consultarRastreioRodonavesRegistro(id,{silencioso=false,chave=null}={}){
  const rastro=await obterRastreamentoPorId(id);
  if(!rastro)throw new Error("Rastreio não encontrado no banco de dados.");

  if(!/rodonaves/i.test(rastro.frete_transportadoras?.nome||"")){
    throw new Error("Este registro não pertence à Rodonaves.");
  }
  if(!(rastro.protocolo_rastreio||rastro.numero_cte||rastro.numero_nfe||rastro.chave_nfe)){
    throw new Error("O rastreio não possui protocolo, NF, CT-e ou chave NF-e para consulta.");
  }

  const chaveUsar=chave||await chaveAdminColeta();
  if(!chaveUsar)throw new Error("Informe a chave administrativa.");

  const params=new URLSearchParams({
    action:"consultar-rastreio-rodonaves",
    registro_id:String(id)
  });
  if(rastro.protocolo_rastreio)params.set("protocolo",rastro.protocolo_rastreio);
  if(rastro.numero_cte)params.set("cte",rastro.numero_cte);
  if(rastro.numero_nfe)params.set("nfe",rastro.numero_nfe);
  if(rastro.chave_nfe)params.set("chave_nfe",rastro.chave_nfe);

  const resposta=await fetch(`/api/integracoes?${params.toString()}`,{
    headers:{"x-integrations-admin-key":chaveUsar}
  });
  const dados=await resposta.json().catch(()=>({}));
  if(!resposta.ok)throw new Error(dados.erro||`HTTP ${resposta.status}`);

  return {rastro,dados};
}

async function consultarRastreioAlfaRegistro(id,{silencioso=false,chave=null}={}){
  const rastro=await obterRastreamentoPorId(id);
  if(!rastro)throw new Error("Rastreio não encontrado no banco de dados.");
  if(!/(^|\s)alfa(\s|$)|alfa transportes/i.test(rastro.frete_transportadoras?.nome||""))throw new Error("Este registro não pertence à Alfa Transportes.");
  if(!rastro.numero_nfe)throw new Error("A Alfa exige o número da NF para consultar o rastreamento.");
  const chaveUsar=chave||await chaveAdminColeta(); if(!chaveUsar)throw new Error("Informe a chave administrativa.");
  const params=new URLSearchParams({action:"consultar-rastreio-alfa",registro_id:String(id),nfe:String(rastro.numero_nfe),cnpj:"05451985000195"});
  const resposta=await fetch(`/api/integracoes?${params.toString()}`,{headers:{"x-integrations-admin-key":chaveUsar}});
  const dados=await resposta.json().catch(()=>({})); if(!resposta.ok)throw new Error(dados.erro||`HTTP ${resposta.status}`);
  return {rastro,dados};
}
async function atualizarRastreioIntegrado(id,botao=null){
  const rastro=await obterRastreamentoPorId(id); if(!rastro)return alert("Rastreio não encontrado.");
  const nome=rastro.frete_transportadoras?.nome||"";
  if(/rodonaves/i.test(nome))return atualizarRastreioRodonaves(id,botao);
  if(/(^|\s)alfa(\s|$)|alfa transportes/i.test(nome)){
    const original=botao?.textContent||"Atualizar rastreio";if(botao){botao.disabled=true;botao.textContent="Atualizando...";}
    try{const {dados}=await consultarRastreioAlfaRegistro(id);alert(`Rastreio Alfa atualizado.\n\nStatus: ${dados.statusBruto||statusLabelRastreamento(dados.status)}${dados.previsaoEntrega?`\nPrevisão: ${new Date(dados.previsaoEntrega+"T12:00:00").toLocaleDateString("pt-BR")}`:""}`);await carregarRastreamentosLogistica(rastro.sentido||"saida");await carregarRastreamentosEntregues();if((rastro.sentido||"saida")==="saida")await carregarPainelRodonaves();}
    catch(e){alert("Não foi possível atualizar o rastreio Alfa: "+e.message);}finally{if(botao&&document.body.contains(botao)){botao.disabled=false;botao.textContent=original;}}
    return;
  }
  alert("Esta transportadora ainda não possui consulta automática implementada.");
}

async function atualizarRastreioRodonaves(id,botao=null){
  const textoOriginal=botao?.textContent||"Atualizar rastreio";
  if(botao){
    botao.disabled=true;
    botao.textContent="Atualizando...";
  }

  try{
    const {rastro,dados}=await consultarRastreioRodonavesRegistro(id);
    alert(`Rastreio atualizado.\n\nLocalizado por: ${dados.metodoConsulta||"consulta automática"}\nStatus: ${dados.statusBruto||statusLabelRastreamento(dados.status)}${dados.previsaoEntrega?`\nPrevisão: ${new Date(dados.previsaoEntrega).toLocaleDateString("pt-BR")}`:""}`);

    // Recarrega somente o painel ao qual este registro pertence.
    // Isso evita sobrescrever rastreamentosLogistica com a lista de Entradas.
    await carregarRastreamentosLogistica(rastro.sentido||"saida");

    // Se for saída vinculada a uma coleta, atualiza também o Painel de Coletas.
    if((rastro.sentido||"saida")==="saida"){
      await carregarPainelRodonaves();
    }
  }catch(erro){
    alert("Não foi possível atualizar o rastreio: "+erro.message);
  }finally{
    if(botao&&document.body.contains(botao)){
      botao.disabled=false;
      botao.textContent=textoOriginal;
    }
  }
}

let atualizacaoTodosRastreiosEmAndamento=false;

async function atualizarTodosRastreiosSaida(){
  if(atualizacaoTodosRastreiosEmAndamento)return;

  const botao=ce("btnAtualizarTodosRastreios");
  const status=ce("statusAtualizarTodosRastreios");
  const textoOriginal=botao?.textContent||"Atualizar todos os rastreios";

  try{
    atualizacaoTodosRastreiosEmAndamento=true;
    if(botao){
      botao.disabled=true;
      botao.textContent="Preparando...";
    }

    const chave=await chaveAdminColeta();
    if(!chave)throw new Error("Informe a chave administrativa.");

    await carregarTransportadorasRastreamentoIntegrado();

    const r=await banco.from("logistica_rastreamentos")
      .select("id,status,protocolo_rastreio,numero_cte,numero_nfe,chave_nfe,frete_transportadoras(nome)")
      .eq("sentido","saida")
      .order("created_at",{ascending:false});
    if(r.error)throw r.error;

    // Atualiza somente rastreios que realmente possuem integração disponível.
    // Na versão atual, a consulta automática implementada é a Rodonaves.
    const lista=(r.data||[]).filter(x=>
      transportadoraTemRastreamentoIntegrado(x.frete_transportadoras?.nome) &&
      (/rodonaves/i.test(x.frete_transportadoras?.nome||"") || /(^|\s)alfa(\s|$)|alfa transportes/i.test(x.frete_transportadoras?.nome||"")) &&
      (x.protocolo_rastreio||x.numero_cte||x.numero_nfe||x.chave_nfe) &&
      !["cancelado"].includes(String(x.status||"").toLowerCase())
    );

    if(!lista.length){
      if(status)status.textContent="Nenhum rastreio integrado disponível para atualizar.";
      return;
    }

    let sucesso=0, erros=0, alterados=0;
    const detalhes=[];

    for(let i=0;i<lista.length;i++){
      const item=lista[i];
      if(botao)botao.textContent=`Atualizando ${i+1}/${lista.length}`;
      if(status)status.textContent=`Consultando ${i+1} de ${lista.length} rastreios...`;

      try{
        const antes=String(item.status||"");
        const nome=item.frete_transportadoras?.nome||"";
        const consulta=/rodonaves/i.test(nome)
          ?await consultarRastreioRodonavesRegistro(item.id,{silencioso:true,chave})
          :await consultarRastreioAlfaRegistro(item.id,{silencioso:true,chave});
        const dados=consulta.dados;
        sucesso++;
        if(String(dados.status||"")!==antes)alterados++;
      }catch(erro){
        erros++;
        detalhes.push(`${item.numero_nfe||item.numero_cte||item.protocolo_rastreio||item.id}: ${erro.message}`);
      }

      // Pequena pausa entre chamadas para evitar disparar várias requisições ao mesmo tempo.
      if(i<lista.length-1)await new Promise(resolve=>setTimeout(resolve,250));
    }

    await carregarRastreamentosLogistica("saida");
    await carregarRastreamentosEntregues();
    await carregarPainelRodonaves();

    const resumo=`Concluído: ${sucesso} atualizado(s), ${alterados} com mudança de status, ${erros} erro(s).`;
    if(status)status.textContent=resumo;

    if(erros){
      console.warn("Falhas na atualização em lote:",detalhes);
      alert(`${resumo}\n\nOs erros individuais foram registrados no Console.`);
    }else{
      alert(resumo);
    }
  }catch(erro){
    if(status)status.textContent="Falha ao atualizar todos os rastreios.";
    alert("Não foi possível atualizar todos os rastreios: "+erro.message);
  }finally{
    atualizacaoTodosRastreiosEmAndamento=false;
    if(botao){
      botao.disabled=false;
      botao.textContent=textoOriginal;
    }
  }
}

async function localizarRastreamentoExistente({id=null,sentido="saida",transportadoraId=null,numeroNfe=null,chaveNfe=null,numeroCte=null,protocolo=null,coletaAgendamentoId=null}={}){
  if(coletaAgendamentoId){
    const r=await banco.from("logistica_rastreamentos")
      .select("*")
      .eq("coleta_agendamento_id",coletaAgendamentoId)
      .limit(1)
      .maybeSingle();
    if(!r.error&&r.data)return r.data;
  }

  const tentativas=[
    ["chave_nfe",String(chaveNfe||"").replace(/\D/g,"")],
    ["numero_cte",String(numeroCte||"").trim()],
    ["numero_nfe",String(numeroNfe||"").trim()],
    ["protocolo_rastreio",String(protocolo||"").trim()]
  ].filter(x=>x[1]);

  for(const [campo,valor] of tentativas){
    let q=banco.from("logistica_rastreamentos")
      .select("*")
      .eq("sentido",sentido)
      .eq(campo,valor);
    if(transportadoraId)q=q.eq("transportadora_id",transportadoraId);
    if(id)q=q.neq("id",id);
    const r=await q.order("consultado_api_em",{ascending:false,nullsFirst:false})
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(!r.error&&r.data)return r.data;
  }
  return null;
}

async function criarOuVincularRastreioDaColeta(agendamentoId,payload,origemExterna){
  if(!payload?.transportadora_id||!agendamentoId)return;

  const transportadora=(coletaTransportadoras||[]).find(
    t=>String(t.id)===String(payload.transportadora_id)
  );
  const protocolo=payload.protocolo_cotacao||payload.protocolo_rastreio||null;
  const numeroNfe=payload.numero_nf||payload.numero_nfe||
    payload?.dados?.numero_nf||payload?.dados?.numero_nfe||null;
  const numeroCte=payload.numero_cte||payload?.dados?.numero_cte||null;
  const chaveNfe=payload.chave_nfe||payload?.dados?.chave_nfe||payload?.dados?.chave_nf||null;
  const ehRodonaves=/rodonaves/i.test(transportadora?.nome||"");
  const statusColeta=String(payload.status_api||payload.status||"").toLowerCase();
  const coletada=/coletad/.test(statusColeta);

  if(!ehRodonaves&&!coletada)return;
  if(!protocolo&&!numeroNfe&&!numeroCte&&!chaveNfe&&!coletada)return;

  const existente=await localizarRastreamentoExistente({
    sentido:"saida",
    transportadoraId:payload.transportadora_id,
    numeroNfe,
    chaveNfe,
    numeroCte,
    protocolo,
    coletaAgendamentoId:agendamentoId
  });

  const rastreioPayload={
    sentido:"saida",
    parceiro_nome:payload.cliente_nome||existente?.parceiro_nome||"Cliente",
    transportadora_id:payload.transportadora_id,
    protocolo_rastreio:protocolo||existente?.protocolo_rastreio||null,
    numero_nfe:numeroNfe||existente?.numero_nfe||null,
    chave_nfe:String(chaveNfe||existente?.chave_nfe||"").replace(/\D/g,"")||null,
    numero_cte:numeroCte||existente?.numero_cte||null,
    data_postagem:coletada
      ?String(payload.coletado_em||payload.data_programada||new Date().toISOString()).slice(0,10)
      :(payload.data_programada?String(payload.data_programada).slice(0,10):existente?.data_postagem||null),
    volumes:payload.volumes||existente?.volumes||null,
    status:coletada
      ?(["entregue","recebido"].includes(existente?.status)?existente.status:"em_transito")
      :(existente?.status||"aguardando_coleta"),
    observacao:`Origem da coleta: ${origemExterna||payload.origem||"sistema"}`,
    coleta_agendamento_id:agendamentoId,
    origem:"coleta_agendamento",
    atualizado_em:new Date().toISOString(),
    atualizado_por:usuarioLogado?.login||"sistema"
  };

  const resultado=existente?.id
    ?await banco.from("logistica_rastreamentos").update(rastreioPayload).eq("id",existente.id)
    :await banco.from("logistica_rastreamentos").insert([rastreioPayload]);

  if(resultado.error){
    console.warn("Não foi possível criar/vincular o rastreio:",resultado.error.message);
  }
}

function moedaNumeroColeta(v){
  const s=String(v??"").trim().replace(/\s/g,"");
  if(!s)return 0;
  if(s.includes(",")&&s.includes("."))return Number(s.replace(/\./g,"").replace(",", "."))||0;
  return Number(s.replace(",", "."))||0;
}
function formatarPesoColeta(v){
  return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:3});
}
function formatarMoedaColeta(v){
  return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
async function carregarPedidosVinculadosColeta(agendamentoId){
  const r=await banco.from("coleta_pedidos_vinculados")
    .select("*")
    .eq("agendamento_id",agendamentoId)
    .order("principal",{ascending:false})
    .order("created_at",{ascending:true});
  if(r.error)throw r.error;
  pedidosVinculadosColeta=r.data||[];
  return pedidosVinculadosColeta;
}
function resumoPedidosVinculados(lista){
  return (lista||[]).reduce((a,p)=>({
    pedidos:a.pedidos+1,
    volumes:a.volumes+(Number(p.volumes)||0),
    peso:a.peso+(Number(p.peso)||0),
    valor:a.valor+(Number(p.valor_nf)||0)
  }),{pedidos:0,volumes:0,peso:0,valor:0});
}
async function abrirPedidosDaColeta(id){
  const coleta=(coletaAgendamentos||[]).find(x=>String(x.id)===String(id));
  if(!coleta)return;
  let lista=[];
  try{lista=await carregarPedidosVinculadosColeta(id)}
  catch(e){return alert("Não foi possível carregar os pedidos vinculados: "+e.message)}

  const resumo=resumoPedidosVinculados(lista);
  document.getElementById("modalPedidosColeta")?.remove();
  const overlay=document.createElement("div");
  overlay.id="modalPedidosColeta";
  overlay.className="modal-pedidos-coleta-overlay";
  overlay.innerHTML=`
    <div class="modal-pedidos-coleta">
      <div class="modal-pedidos-coleta-topo">
        <div>
          <h2>📦 Pedidos da mesma coleta</h2>
          <div class="modal-pedidos-subtitulo">
            ${escaparHtmlEmail(coleta.frete_transportadoras?.nome||"Transportadora")} •
            ${escaparHtmlEmail(coleta.protocolo_cotacao||coleta.codigo_coleta||"sem protocolo")}
          </div>
        </div>
        <button class="btn roxo" onclick="fecharPedidosDaColeta()">Fechar</button>
      </div>

      <div class="coleta-grupo-resumo">
        <div><small>Pedidos</small><b id="pedGrupoQtd">${resumo.pedidos}</b></div>
        <div><small>Volumes</small><b id="pedGrupoVolumes">${resumo.volumes}</b></div>
        <div><small>Peso total</small><b id="pedGrupoPeso">${formatarPesoColeta(resumo.peso)} kg</b></div>
        <div><small>Valor NF</small><b id="pedGrupoValor">${formatarMoedaColeta(resumo.valor)}</b></div>
      </div>

      ${coleta.ajuste_carga_pendente?`
        <div class="aviso-ajuste-coleta">
          ⚠️ A carga foi alterada depois da solicitação da coleta.
          O sistema atualizou os totais internamente, mas a transportadora ainda precisa confirmar o ajuste.
          <button class="btn verde" onclick="confirmarAjusteCargaColeta('${id}')">Marcar ajuste confirmado</button>
        </div>`:""}

      <div class="tabela-pedidos-coleta-wrap">
        <table class="tabela-pedidos-coleta">
          <thead><tr>
            <th>Cliente</th><th>NF</th><th>Volumes</th><th>Peso</th><th>Valor NF</th><th></th>
          </tr></thead>
          <tbody id="pedidosColetaLista">
            ${lista.length?lista.map(p=>`
              <tr>
                <td>${p.principal?'<span class="pedido-principal-tag">Principal</span> ':''}${escaparHtmlEmail(p.cliente_nome||"—")}</td>
                <td>${escaparHtmlEmail(p.numero_nf||"—")}</td>
                <td>${Number(p.volumes)||0}</td>
                <td>${formatarPesoColeta(p.peso)} kg</td>
                <td>${formatarMoedaColeta(p.valor_nf)}</td>
                <td>${p.principal?"":`<button class="btn vermelho" onclick="excluirPedidoVinculadoColeta('${p.id}','${id}')">Remover</button>`}</td>
              </tr>`).join(""):'<tr><td colspan="6">Nenhum pedido vinculado.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="novo-pedido-coleta">
        <h3>+ Vincular outro pedido a esta coleta</h3>
        <div class="novo-pedido-grid">
          <div><label>Cliente</label><input id="pedVincCliente" placeholder="Ex.: LITORAL MODA ÍNTIMA"></div>
          <div><label>Nº da NF</label><input id="pedVincNf" placeholder="Número da nota"></div>
          <div><label>Volumes</label><input id="pedVincVolumes" type="number" min="1" step="1"></div>
          <div><label>Peso (kg)</label><input id="pedVincPeso" inputmode="decimal" placeholder="266,00"></div>
          <div><label>Valor da NF</label><input id="pedVincValor" inputmode="decimal" placeholder="0,00"></div>
          <div><label>Observação</label><input id="pedVincObs" placeholder="Opcional"></div>
        </div>
        <div class="novo-pedido-acoes">
          <button class="btn verde" onclick="salvarPedidoVinculadoColeta('${id}')">Vincular pedido</button>
        </div>
        <div class="nota-integracao-coleta">
          <b>Importante:</b> o vínculo agrupa os pedidos na mesma coleta física dentro da Sofisticatto.
          Se a coleta já foi enviada à transportadora, o sistema marca o ajuste como pendente porque
          a API da transportadora pode não permitir alterar uma solicitação já criada.
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
function fecharPedidosDaColeta(){
  document.getElementById("modalPedidosColeta")?.remove();
}
async function salvarPedidoVinculadoColeta(agendamentoId){
  const cliente=cv("pedVincCliente");
  const volumes=Number(cv("pedVincVolumes"))||0;
  const peso=moedaNumeroColeta(cv("pedVincPeso"));
  if(!cliente)return alert("Informe o cliente do novo pedido.");
  if(volumes<=0)return alert("Informe a quantidade de volumes.");
  if(peso<=0)return alert("Informe o peso do pedido.");

  const payload={
    agendamento_id:agendamentoId,
    cliente_nome:cliente,
    numero_nf:cv("pedVincNf")||null,
    volumes,
    peso,
    valor_nf:moedaNumeroColeta(cv("pedVincValor"))||null,
    observacao:cv("pedVincObs")||null,
    principal:false,
    criado_por:usuarioLogado?.login||null
  };
  const r=await banco.from("coleta_pedidos_vinculados").insert([payload]);
  if(r.error)return alert(r.error.message);

  await carregarAgendamentosColeta();
  await abrirPedidosDaColeta(agendamentoId);
  await carregarPainelRodonaves();

  const coleta=(coletaAgendamentos||[]).find(x=>String(x.id)===String(agendamentoId));
  if(coleta?.ajuste_carga_pendente){
    alert("Pedido vinculado com sucesso.\n\nOs totais da coleta foram atualizados no sistema. Como a coleta já havia sido solicitada, ficou marcado: AJUSTE PENDENTE NA TRANSPORTADORA.");
  }else{
    alert("Pedido vinculado. Os volumes e o peso total da coleta foram atualizados automaticamente.");
  }
}
async function excluirPedidoVinculadoColeta(pedidoId,agendamentoId){
  if(!confirm("Remover este pedido da coleta?"))return;
  const r=await banco.from("coleta_pedidos_vinculados").delete().eq("id",pedidoId).eq("principal",false);
  if(r.error)return alert(r.error.message);
  await carregarAgendamentosColeta();
  await abrirPedidosDaColeta(agendamentoId);
  await carregarPainelRodonaves();
}
async function confirmarAjusteCargaColeta(agendamentoId){
  if(!confirm("Confirmar que a transportadora foi avisada e aceitou os novos volumes/peso desta coleta?"))return;
  const r=await banco.from("coleta_agendamentos").update({
    ajuste_carga_pendente:false,
    ajuste_carga_confirmado_em:new Date().toISOString(),
    atualizado_em:new Date().toISOString()
  }).eq("id",agendamentoId);
  if(r.error)return alert(r.error.message);
  await carregarAgendamentosColeta();
  await abrirPedidosDaColeta(agendamentoId);
  await carregarPainelRodonaves();
}

async function carregarTransportadorasRastreamentoIntegrado(){
  try{
    const r=await banco.from("transportadora_integracoes")
      .select("transportadora_nome,status_tecnico,rastreamento_ativo")
      .eq("rastreamento_ativo",true);
    if(r.error)throw r.error;
    transportadorasRastreamentoIntegrado=(r.data||[]).filter(
      x=>String(x.status_tecnico||"").toLowerCase()!=="suspensa"
    );
  }catch(e){
    console.warn("Não foi possível carregar transportadoras integradas:",e.message);
    transportadorasRastreamentoIntegrado=[];
  }
}
function nomeNormalizadoTransportadora(v){
  return String(v||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function transportadoraTemRastreamentoIntegrado(nome){
  const n=nomeNormalizadoTransportadora(nome);
  if(!n)return false;
  return transportadorasRastreamentoIntegrado.some(i=>{
    const x=nomeNormalizadoTransportadora(i.transportadora_nome);
    return x&&(n.includes(x)||x.includes(n));
  });
}


function statusLabelRastreamento(s){
  const m={aguardando_coleta:"Aguardando coleta",em_transito:"Em trânsito",na_filial:"Na filial",saiu_entrega:"Saiu para entrega",entregue:"Entregue",recebido:"Recebido",atrasado:"Atrasado",ocorrencia:"Com ocorrência",cancelado:"Cancelado"};
  return m[s]||String(s||"—").replace(/_/g," ");
}
function classeStatusRastreamento(s){
  if(["entregue","recebido"].includes(s))return"sucesso";
  if(["atrasado","ocorrencia","cancelado"].includes(s))return"erro";
  return"aguardando";
}
async function finalizarRastreamentoLogistica(id,sentido){
  const status=sentido==="entrada"?"recebido":"entregue";
  if(!confirm(`Confirmar como ${statusLabelRastreamento(status)}?`))return;
  const r=await banco.from("logistica_rastreamentos").update({
    status,finalizado_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),atualizado_por:usuarioLogado?.login||null
  }).eq("id",id);
  if(r.error)return alert(r.error.message);
  await carregarRastreamentosLogistica(sentido);
}
async function excluirRastreamentoLogistica(id,sentido){
  if(!confirm("Excluir este registro de rastreamento?"))return;
  const r=await banco.from("logistica_rastreamentos").delete().eq("id",id);
  if(r.error)return alert(r.error.message);
  await carregarRastreamentosLogistica(sentido);
}

async function carregarTransportadorasLogistica(){
  await carregarTransportadorasColeta();
  const tb=ce("logTransportadorasTabela");if(!tb)return;
  tb.innerHTML=coletaTransportadoras.length?coletaTransportadoras.map(t=>`<tr>
    <td>${escaparHtmlEmail(t.nome||"")}</td>
    <td>${escaparHtmlEmail(t.contato||"—")}</td>
    <td>${escaparHtmlEmail(t.whatsapp||"—")}</td>
    <td>${escaparHtmlEmail(t.tipo_acompanhamento||"manual")}</td>
    <td>${t.ativa!==false?"Ativa":"Inativa"}</td>
    <td><button class="btn azul" onclick="editarTransportadoraLogistica('${t.id}')">Editar</button></td>
  </tr>`).join(""):'<tr><td colspan="6">Nenhuma transportadora cadastrada.</td></tr>';
}
function novaTransportadoraLogistica(){limparTransportadoraLogistica();ce("logTransportadoraNome")?.focus()}
function limparTransportadoraLogistica(){
  ["logTransportadoraId","logTransportadoraNome","logTransportadoraContato","logTransportadoraTelefone","logTransportadoraWhatsapp","logTransportadoraEmail","logTransportadoraObservacao"].forEach(id=>{if(ce(id))ce(id).value=""});
  if(ce("logTransportadoraTipo"))ce("logTransportadoraTipo").value="manual";
  if(ce("logTransportadoraAtiva"))ce("logTransportadoraAtiva").checked=true;
}
function editarTransportadoraLogistica(id){
  const t=coletaTransportadoras.find(x=>String(x.id)===String(id));if(!t)return;
  ce("logTransportadoraId").value=t.id;ce("logTransportadoraNome").value=t.nome||"";
  ce("logTransportadoraContato").value=t.contato||"";ce("logTransportadoraTelefone").value=t.telefone||"";
  ce("logTransportadoraWhatsapp").value=t.whatsapp||"";ce("logTransportadoraEmail").value=t.email||"";
  ce("logTransportadoraTipo").value=t.tipo_acompanhamento||"manual";ce("logTransportadoraObservacao").value=t.observacao||"";
  ce("logTransportadoraAtiva").checked=t.ativa!==false;
}
async function salvarTransportadoraLogistica(){
  const nome=cv("logTransportadoraNome").trim();if(!nome)return alert("Informe o nome da transportadora.");
  const id=cv("logTransportadoraId");
  const payload={nome,contato:cv("logTransportadoraContato")||null,telefone:cv("logTransportadoraTelefone")||null,whatsapp:cv("logTransportadoraWhatsapp")||null,email:cv("logTransportadoraEmail")||null,tipo_acompanhamento:cv("logTransportadoraTipo")||"manual",observacao:cv("logTransportadoraObservacao")||null,ativa:!!ce("logTransportadoraAtiva")?.checked};
  const r=id?await banco.from("frete_transportadoras").update(payload).eq("id",id):await banco.from("frete_transportadoras").insert([payload]);
  if(r.error)return alert(r.error.message);
  limparTransportadoraLogistica();await carregarTransportadorasLogistica();
}

function normalizarBuscaLogistica(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function filtrarPainelColetas(){
  const termo=normalizarBuscaLogistica(cv("buscaPainelColetas")),status=cv("filtroStatusPainelColetas");
  const linhas=[...document.querySelectorAll("#coletaPainelRodonavesTabela .linha-painel-coleta")];let n=0;
  linhas.forEach(l=>{const ok=(!termo||normalizarBuscaLogistica(l.dataset.busca).includes(termo))&&(!status||l.dataset.status===status);l.style.display=ok?"":"none";if(ok)n++});
  if(ce("resultadoBuscaPainelColetas"))ce("resultadoBuscaPainelColetas").textContent=linhas.length?`${n} de ${linhas.length} registro(s)`:"";
}
function limparBuscaPainelColetas(){if(ce("buscaPainelColetas"))ce("buscaPainelColetas").value="";if(ce("filtroStatusPainelColetas"))ce("filtroStatusPainelColetas").value="";filtrarPainelColetas()}
function filtrarRastreamentosLogistica(sentido){
  const suf=sentido==="entrada"?"Entradas":"Saidas",termo=normalizarBuscaLogistica(cv(`buscaRastreamento${suf}`)),status=cv(`filtroStatusRastreamento${suf}`);
  const tb=ce(sentido==="entrada"?"rastreamentoTabelaEntradas":"rastreamentoTabelaSaidas");if(!tb)return;
  const linhas=[...tb.querySelectorAll(".linha-rastreamento-logistica")];let n=0;
  linhas.forEach(l=>{const ok=(!termo||normalizarBuscaLogistica(l.dataset.busca).includes(termo))&&(!status||l.dataset.status===status);l.style.display=ok?"":"none";if(ok)n++});
  if(ce(`resultadoBuscaRastreamento${suf}`))ce(`resultadoBuscaRastreamento${suf}`).textContent=linhas.length?`${n} de ${linhas.length} rastreio(s)`:"";
}
function limparBuscaRastreamento(sentido){const suf=sentido==="entrada"?"Entradas":"Saidas";if(ce(`buscaRastreamento${suf}`))ce(`buscaRastreamento${suf}`).value="";if(ce(`filtroStatusRastreamento${suf}`))ce(`filtroStatusRastreamento${suf}`).value="";filtrarRastreamentosLogistica(sentido)}

/* =========================================================
   V21 — SINCRONIZAÇÃO AUTOMÁTICA DE COLETAS
   ========================================================= */
let intervaloSincronizacaoColetas=null;
let sincronizacaoColetasEmAndamento=false;
let ultimaSincronizacaoColetas=0;
const INTERVALO_SINCRONIZACAO_COLETAS=5*60*1000;

function painelColetasVisivel(){
  return ce("coletaPainelRodonaves")?.classList.contains("ativo");
}
function atualizarIndicadorSincronizacao(tipo,texto){
  const box=ce("coletaSincronizacaoStatus");
  const label=ce("coletaSincronizacaoTexto");
  if(!box||!label)return;
  box.className=`sincronizacao-status ${tipo||"aguardando"}`;
  label.textContent=texto;
}
async function sincronizarColetasAutomaticamente(forcar=false){
  if(sincronizacaoColetasEmAndamento)return;
  if(!forcar&&Date.now()-ultimaSincronizacaoColetas<60000)return;

  sincronizacaoColetasEmAndamento=true;
  atualizarIndicadorSincronizacao("processando","Consultando as coletas abertas na Rodonaves...");

  try{
    const chave=await chaveAdminColeta();
    if(!chave)throw new Error("Chave administrativa não informada.");

    const resposta=await fetch("/api/integracoes?action=atualizar-status",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-integrations-admin-key":chave
      }
    });
    const dados=await resposta.json().catch(()=>({}));
    if(!resposta.ok)throw new Error([dados.erro,dados.diagnostico?.mensagem,dados.detalhe].filter(Boolean).join(" — ")||`HTTP ${resposta.status}`);

    ultimaSincronizacaoColetas=Date.now();
    const hora=new Date().toLocaleTimeString("pt-BR");
    atualizarIndicadorSincronizacao(
      dados.erros?"aviso":"sucesso",
      `Última sincronização: ${hora} — coletas: ${dados.consultadas||0} consultada(s), ${dados.alteradas||0} alterada(s); rastreios: ${dados.rastreios?.consultados||0} consultado(s), ${dados.rastreios?.alterados||0} alterado(s)${dados.ignoradas?`; ${dados.ignoradas} coleta(s) aguardando código`:""}${dados.erros?`; ${dados.erros} erro(s)`:""}`
    );
    await carregarPainelRodonaves();
  }catch(erro){
    atualizarIndicadorSincronizacao("erro",`Falha na sincronização: ${erro.message}`);
    if(forcar)alert("Não foi possível sincronizar: "+erro.message);
  }finally{
    sincronizacaoColetasEmAndamento=false;
  }
}
function iniciarSincronizacaoAutomaticaColetas(){
  pararSincronizacaoAutomaticaColetas();
  setTimeout(()=>sincronizarColetasAutomaticamente(false),700);
  intervaloSincronizacaoColetas=setInterval(()=>{
    if(!document.hidden&&painelColetasVisivel()){
      sincronizarColetasAutomaticamente(false);
    }
  },INTERVALO_SINCRONIZACAO_COLETAS);
}
function pararSincronizacaoAutomaticaColetas(){
  if(intervaloSincronizacaoColetas){
    clearInterval(intervaloSincronizacaoColetas);
    intervaloSincronizacaoColetas=null;
  }
}
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&painelColetasVisivel()){
    sincronizarColetasAutomaticamente(false);
  }
});
window.addEventListener("focus",()=>{
  if(painelColetasVisivel()){
    sincronizarColetasAutomaticamente(false);
  }
});



function abrirImportacaoColetaExterna(){
  const box=ce("coletaImportacaoExterna");
  if(!box)return;
  box.style.display="block";
  montarOpcoesImportacaoColetaExterna();
  if(!cv("importColetaData")){
    const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    ce("importColetaData").value=d.toISOString().slice(0,16);
  }
  box.scrollIntoView({behavior:"smooth",block:"start"});
}
function fecharImportacaoColetaExterna(){
  const box=ce("coletaImportacaoExterna");if(box)box.style.display="none";
}
function montarOpcoesImportacaoColetaExterna(){
  const tr=ce("importColetaTransportadora");
  if(tr)tr.innerHTML='<option value="">Selecione</option>'+(coletaTransportadoras||[]).map(t=>`<option value="${t.id}">${escaparHtmlEmail(t.nome||"")}</option>`).join("");
  const ex=ce("importColetaExistente");
  if(ex){
    const atuais=(coletaAgendamentos||[]).filter(a=>!["coletado","cancelado"].includes(statusColetaPainel(a)));
    ex.innerHTML='<option value="">Criar novo registro</option>'+atuais.map(a=>`<option value="${a.id}">${escaparHtmlEmail([a.cliente_nome,a.frete_transportadoras?.nome,a.protocolo_cotacao,a.codigo_coleta].filter(Boolean).join(" • "))}</option>`).join("");
  }
}
function limparImportacaoColetaExterna(){
  ["importColetaExistente","importColetaTransportadora","importColetaCliente","importColetaProtocolo","importColetaCodigo","importColetaData","importColetaVolumes","importColetaPeso","importColetaEndereco","importColetaObservacao"].forEach(id=>{if(ce(id))ce(id).value=""});
  if(ce("importColetaStatus"))ce("importColetaStatus").value="solicitado";
  if(ce("importColetaOrigem"))ce("importColetaOrigem").value="whatsapp";
  if(ce("importColetaCodigoConfirmado"))ce("importColetaCodigoConfirmado").checked=false;
}
function preencherImportacaoComRegistro(){
  const a=(coletaAgendamentos||[]).find(x=>String(x.id)===cv("importColetaExistente"));
  if(!a)return;
  ce("importColetaTransportadora").value=a.transportadora_id||"";
  ce("importColetaCliente").value=a.cliente_nome||"";
  ce("importColetaProtocolo").value=a.protocolo_cotacao||"";
  ce("importColetaCodigo").value=a.codigo_coleta||a?.dados?.numero_referencia_externa||"";
  if(ce("importColetaCodigoConfirmado"))ce("importColetaCodigoConfirmado").checked=a?.dados?.codigo_coleta_validado===true;
  ce("importColetaStatus").value=statusColetaPainel(a);
  ce("importColetaVolumes").value=a.volumes||"";
  ce("importColetaPeso").value=a.peso||"";
  ce("importColetaEndereco").value=enderecoColetaPainel(a)==="Endereço vinculado ao protocolo"?"":enderecoColetaPainel(a);
  ce("importColetaObservacao").value=a.observacao||"";
  if(a.data_programada){
    const d=new Date(a.data_programada);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    ce("importColetaData").value=d.toISOString().slice(0,16);
  }
}
function numeroImportacaoColeta(v){
  return Number(String(v||"").replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,""))||null;
}
async function salvarImportacaoColetaExterna(){
  const id=cv("importColetaExistente");
  const transportadoraId=cv("importColetaTransportadora");
  const cliente=cv("importColetaCliente").trim();
  const protocolo=cv("importColetaProtocolo").trim();
  const codigoInformado=cv("importColetaCodigo").trim();
  const codigoConfirmado=Boolean(ce("importColetaCodigoConfirmado")?.checked);
  const status=cv("importColetaStatus")||"solicitado";
  const origemExterna=cv("importColetaOrigem")||"manual";
  const endereco=cv("importColetaEndereco").trim();
  if(!transportadoraId)return alert("Selecione a transportadora.");
  if(!cliente)return alert("Informe o cliente.");
  if(!protocolo&&!codigoInformado)return alert("Informe pelo menos o protocolo ou algum número de referência.");
  if(codigoConfirmado&&codigoInformado&&protocolo&&String(codigoInformado).replace(/\D/g,"")===String(protocolo).replace(/\D/g,"")){
    const seguir=confirm("O número informado é igual ao protocolo da cotação. Normalmente o código da coleta é diferente. Deseja confirmar mesmo assim que este é o código da coleta?");
    if(!seguir)return;
  }
  const existente=id?(coletaAgendamentos||[]).find(x=>String(x.id)===String(id)):null;
  const dados={
    ...(existente?.dados||{}),
    origem_externa:origemExterna,
    importado_externo_em:new Date().toISOString(),
    endereco_coleta_externo:endereco||existente?.dados?.endereco_coleta_externo||null,
    codigo_coleta_validado:codigoConfirmado,
    numero_referencia_externa:codigoInformado||null
  };
  const dataValor=cv("importColetaData");
  const dataProgramada=dataValor?new Date(dataValor).toISOString():existente?.data_programada||null;
  const payload={
    cliente_nome:cliente,
    transportadora_id:transportadoraId,
    protocolo_cotacao:protocolo||null,
    codigo_coleta:codigoConfirmado&&codigoInformado?codigoInformado:null,
    status,
    status_api:status,
    volumes:Number(cv("importColetaVolumes"))||null,
    peso:numeroImportacaoColeta(cv("importColetaPeso")),
    data_programada:dataProgramada,
    origem:"importacao_externa",
    dados,
    observacao:cv("importColetaObservacao").trim()||null,
    atualizado_em:new Date().toISOString()
  };
  if(status==="coletado")payload.coletado_em=new Date().toISOString();
  let r;
  if(existente){
    r=await banco.from("coleta_agendamentos").update(payload).eq("id",existente.id);
  }else{
    payload.criado_por=usuarioLogado?.login||null;
    r=await banco.from("coleta_agendamentos").insert([payload]).select("id").single();
  }
  if(r.error)return alert("Não foi possível salvar: "+r.error.message);
  const novoId=existente?.id||r.data?.id;
  if(novoId){
    await registrarEventoColeta(novoId,existente?statusColetaPainel(existente):null,status,"importacao_externa",{origem:origemExterna,protocolo,codigo:codigoInformado,codigo_confirmado:codigoConfirmado});
    await criarOuVincularRastreioDaColeta(novoId,payload,origemExterna);
  }
  alert(existente?"Coleta vinculada, atualizada e preparada para rastreio.":"Coleta externa importada e preparada para rastreio.");
  limparImportacaoColetaExterna();
  fecharImportacaoColetaExterna();
  await carregarPainelRodonaves();
}



async function informarNfPainelColeta(id){
  const a=(coletaAgendamentos||[]).find(x=>String(x.id)===String(id));
  if(!a)return alert("Coleta não encontrada.");

  const atual=a.numero_nf||a?.dados?.numero_nf||a?.dados?.numero_nfe||"";
  const informado=prompt(
    "Informe o número da Nota Fiscal para localizar o rastreio desta coleta:",
    atual
  );
  if(informado===null)return;

  const numeroNf=String(informado||"").trim();
  if(!numeroNf)return alert("Informe o número da Nota Fiscal.");

  try{
    const dadosAtualizados={
      ...(a.dados||{}),
      numero_nf:numeroNf,
      numero_nfe:numeroNf
    };

    const up=await banco.from("coleta_agendamentos")
      .update({
        numero_nf:numeroNf,
        dados:dadosAtualizados,
        atualizado_em:new Date().toISOString()
      })
      .eq("id",id)
      .select()
      .single();

    if(up.error)throw up.error;

    const payload={
      ...a,
      ...up.data,
      numero_nf:numeroNf,
      numero_nfe:numeroNf,
      dados:dadosAtualizados
    };

    await criarOuVincularRastreioDaColeta(
      id,
      payload,
      a?.dados?.origem_externa||a?.origem||"painel_coletas"
    );

    const existente=await localizarRastreamentoExistente({
      sentido:"saida",
      transportadoraId:a.transportadora_id,
      numeroNfe:numeroNf,
      chaveNfe:a.chave_nfe||a?.dados?.chave_nfe||a?.dados?.chave_nf||null,
      numeroCte:a.numero_cte||a?.dados?.numero_cte||null,
      protocolo:a.protocolo_rastreio||a.protocolo_cotacao||null,
      coletaAgendamentoId:id
    });

    if(!existente?.id){
      await carregarPainelRodonaves();
      return alert(
        `NF ${numeroNf} salva na coleta.\n\n`+
        "O registro de rastreio ainda não pôde ser localizado/criado."
      );
    }

    let mensagem=`NF ${numeroNf} salva e vinculada ao rastreio.`;

    if(/rodonaves/i.test(a.frete_transportadoras?.nome||"")){
      try{
        const {dados}=await consultarRastreioRodonavesRegistro(
          existente.id,
          {silencioso:true}
        );
        mensagem=
          `NF ${numeroNf} localizada na Rodonaves.\n\n`+
          `Status: ${dados.statusBruto||statusLabelRastreamento(dados.status)||"Atualizado"}`
          +(dados.previsaoEntrega
            ?`\nPrevisão: ${new Date(dados.previsaoEntrega).toLocaleDateString("pt-BR")}`
            :"");
      }catch(e){
        mensagem=
          `NF ${numeroNf} salva e vinculada.\n\n`+
          "A Rodonaves ainda não retornou um rastreio para esta NF. "+
          "Você poderá tentar novamente pelo botão Atualizar rastreio.";
        console.warn("Consulta por NF no Painel de Coletas:",e);
      }
    }

    await carregarPainelRodonaves();
    await carregarRastreamentosLogistica("saida");
    if(typeof carregarRastreamentosEntregues==="function"){
      await carregarRastreamentosEntregues();
    }

    alert(mensagem);
  }catch(e){
    alert("Não foi possível salvar/rastrear pela NF: "+(e.message||e));
  }
}

function abrirVinculoCodigoColeta(id){
  abrirImportacaoColetaExterna();
  setTimeout(()=>{
    const sel=ce("importColetaExistente");
    if(sel){
      sel.value=String(id);
      preencherImportacaoComRegistro();
      ce("importColetaCodigo")?.focus();
    }
  },50);
}

async function agendarColetaAccertSSW(){
  if(!coletaEhAccert())return alert("Selecione a ACCERT como transportadora.");
  const dataHora=formatarDataHoraApiColeta();
  if(!dataHora)return alert("Informe a data e o horário limite da coleta.");
  if(!cv("coletaCepDestino"))return alert("Informe o CEP do destino.");
  if(!(numeroColetaApi(cv("coletaVolumes"))>0))return alert("Informe a quantidade de volumes.");
  if(!(numeroColetaApi(cv("coletaPeso"))>0))return alert("Informe o peso total.");
  if(!confirm(`CONFIRMAR COLETA REAL NA ACCERT/SSW?\n\nCliente: ${cv("coletaRazaoDestino")}\nNF: ${cv("coletaNumeroNf")||"—"}\nVolumes: ${cv("coletaVolumes")}\nPeso: ${cv("coletaPeso")} kg\nLimite: ${new Date(dataHora).toLocaleString("pt-BR")}`))return;
  const chave=await chaveAdminColeta(); if(!chave)return;
  let id=cv("coletaAgendamentoId");
  if(!id){await salvarAgendamentoColetaSemAviso();id=cv("coletaAgendamentoId");}
  const btn=ce("btnAgendarAccertApi"); if(btn){btn.disabled=true;btn.textContent="Enviando ao SSW...";}
  const st=ce("coletaAccertResultado"); if(st)st.textContent="Enviando solicitação para ACCERT/SSW...";
  try{
    const endereco=[cv("coletaEnderecoDestino"),cv("coletaNumeroDestino"),cv("coletaComplementoDestino"),cv("coletaBairroDestino"),cv("coletaCidadeDestino")].filter(Boolean).join(", ");
    const r=await fetch("/api/integracoes?action=agendar-coleta-accert",{method:"POST",headers:{"Content-Type":"application/json","x-integrations-admin-key":chave},body:JSON.stringify({
      agendamento_id:id||null,cnpj_remetente:cv("coletaCnpjOrigem"),cnpj_destinatario:cv("coletaCnpjDestino"),numero_nf:cv("coletaNumeroNf"),tipo_pagamento:cv("coletaTipoFrete")==="FOB"?"D":"O",endereco_entrega:endereco,cep_entrega:cv("coletaCepDestino"),solicitante:cv("coletaSolicitante"),limite_coleta:dataHora,quantidade:cv("coletaVolumes"),peso:cv("coletaPeso"),observacao:cv("coletaObservacao"),valor_mercadoria:cv("coletaValorNf"),mercadoria:cv("coletaMercadoria"),cnpj_solicitante:cv("coletaCnpjOrigem"),cep_coleta:cv("coletaCepOrigem"),logradouro_coleta:cv("coletaEnderecoOrigem"),nome_remetente:cv("coletaRazaoOrigem")
    })});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.erro||`HTTP ${r.status}`);
    if(st)st.textContent=`✅ Coleta criada na ACCERT/SSW. Nº ${d.numero_coleta||"não informado"}`;
    await carregarAgendamentosColeta();
    mostrarBalaoSistema("Coleta ACCERT criada",d.numero_coleta?`Número ${d.numero_coleta}`:"SSW confirmou a solicitação");
  }catch(e){console.error("Coleta ACCERT/SSW",e);if(st)st.textContent="❌ "+e.message;alert("Não foi possível criar a coleta na ACCERT/SSW:\n"+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent="Agendar na ACCERT / SSW";}}
}
