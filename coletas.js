
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
function mostrarPainelColeta(p){["nova","historico","modelos"].forEach(x=>{ce("coletaPainel"+x[0].toUpperCase()+x.slice(1))?.classList.toggle("ativo",x===p);ce("coletaTab"+x[0].toUpperCase()+x.slice(1))?.classList.toggle("ativo",x===p)});if(p==="historico")montarHistoricoColetas();if(p==="modelos")montarModelosColeta()}
async function inicializarModuloColetas(){if(coletaInicializado){atualizarPreviaColeta();return}coletaInicializado=true;await Promise.all([carregarTransportadorasColeta(),carregarModelosColeta(),carregarAgendamentosColeta()]);montarClientesColeta();atualizarPreviaColeta()}
async function carregarTransportadorasColeta(){const r=await banco.from("frete_transportadoras").select("*").order("nome");coletaTransportadoras=r.error?[]:r.data||[];const opts='<option value="">Selecione</option>'+coletaTransportadoras.map(t=>`<option value="${t.id}">${escaparHtmlEmail(t.nome||"")}</option>`).join("");ce("coletaTransportadoraId").innerHTML=opts;ce("coletaModeloTransportadoraId").innerHTML='<option value="">Modelo geral</option>'+opts.replace('<option value="">Selecione</option>','')}
async function carregarModelosColeta(){const r=await banco.from("coleta_modelos").select("*").eq("ativo",true).order("nome");coletaModelos=r.error?[]:r.data||[];if(!coletaModelos.length)coletaModelos=COLETA_MODELOS_PADRAO.map((m,i)=>({id:`padrao-${i+1}`,...m,ativo:true}));ce("coletaModeloId").innerHTML=coletaModelos.map(m=>`<option value="${m.id}">${escaparHtmlEmail(m.nome)}</option>`).join("");montarModelosColeta()}
async function carregarAgendamentosColeta(){const r=await banco.from("coleta_agendamentos").select("*,frete_transportadoras(nome),coleta_modelos(nome)").order("created_at",{ascending:false});coletaAgendamentos=r.error?[]:r.data||[];montarHistoricoColetas()}
function montarClientesColeta(){const dl=ce("coletaClientesLista");if(!dl)return;dl.innerHTML=(emailClientes||[]).map(c=>`<option value="${escaparHtmlEmail(c.nome||"")}"></option>`).join("")}
function pesquisarClienteColeta(){ce("coletaClienteId").value="";const q=normalizarNomeEmail(cv("coletaClienteBusca"));const box=ce("coletaClienteResultados");if(q.length<2){box.style.display="none";return}const lista=(emailClientes||[]).filter(c=>normalizarNomeEmail([c.nome,c.cpf_cnpj,c.cidade,c.uf].filter(Boolean).join(" ")).includes(q)).slice(0,12);box.innerHTML=lista.map(c=>`<button type="button" class="coleta-resultado" onclick="selecionarClienteColeta('${c.id}')"><strong>${escaparHtmlEmail(c.nome||"")}</strong><span>${escaparHtmlEmail([c.cpf_cnpj,c.cidade,c.uf].filter(Boolean).join(" • "))}</span></button>`).join("")||'<div class="frete-cliente-sem-resultado">Nenhum cliente encontrado.</div>';box.style.display="block"}
function selecionarClienteColetaPorNome(){const c=(emailClientes||[]).find(x=>normalizarNomeEmail(x.nome)===normalizarNomeEmail(cv("coletaClienteBusca")));if(c)selecionarClienteColeta(c.id)}
function selecionarClienteColeta(id){const c=(emailClientes||[]).find(x=>String(x.id)===String(id));if(!c)return;ce("coletaClienteId").value=c.id;ce("coletaClienteBusca").value=c.nome||"";ce("coletaCnpjDestino").value=c.cpf_cnpj||"";ce("coletaRazaoDestino").value=c.nome||"";ce("coletaCepDestino").value=c.cep||"";ce("coletaCidadeDestino").value=[c.cidade,c.uf].filter(Boolean).join("/");ce("coletaClienteResultados").style.display="none";atualizarPreviaColeta()}
function dadosColeta(){return{solicitante:cv("coletaSolicitante"),telefone_origem:cv("coletaTelefoneOrigem"),tipo_frete:cv("coletaTipoFrete")==="FOB"?"DESTINO (FOB)":"REMETENTE (CIF)",cnpj_origem:cv("coletaCnpjOrigem"),razao_origem:cv("coletaRazaoOrigem"),cep_origem:cv("coletaCepOrigem"),endereco_origem:cv("coletaEnderecoOrigem"),cnpj_destino:cv("coletaCnpjDestino"),razao_destino:cv("coletaRazaoDestino"),cep_destino:cv("coletaCepDestino"),cidade_destino:cv("coletaCidadeDestino"),volumes:cv("coletaVolumes"),peso:cv("coletaPeso"),valor_nf:coletaMoeda(cv("coletaValorNf")),numero_nf:cv("coletaNumeroNf"),medidas:cv("coletaMedidas"),natureza:cv("coletaNatureza"),mercadoria:cv("coletaMercadoria"),embalagem:cv("coletaEmbalagem"),horario_limite:cv("coletaHorarioLimite"),pausa:cv("coletaPausa"),referencia:cv("coletaReferencia"),localizacao:cv("coletaLocalizacao")}}
function modeloAtualColeta(){return coletaModelos.find(m=>String(m.id)===cv("coletaModeloId"))||coletaModelos[0]}
function renderizarModeloColeta(texto,d){return String(texto||"").replace(/\{\{([a-z0-9_]+)\}\}/gi,(_,k)=>d[k]||"-").replace(/\n{3,}/g,"\n\n").trim()}
function atualizarPreviaColeta(){const m=modeloAtualColeta();ce("coletaPreviaMensagem").value=m?renderizarModeloColeta(m.texto,dadosColeta()):""}
function aplicarModeloDaTransportadoraColeta(){const tid=cv("coletaTransportadoraId");const m=coletaModelos.find(x=>String(x.transportadora_id||"")===tid);if(m)ce("coletaModeloId").value=m.id;atualizarPreviaColeta()}
async function copiarMensagemColeta(){atualizarPreviaColeta();const t=cv("coletaPreviaMensagem");if(!t)return alert("Preencha os dados da coleta.");try{await navigator.clipboard.writeText(t);alert("Mensagem copiada para o WhatsApp.")}catch{ce("coletaPreviaMensagem").select();document.execCommand("copy")}}
function whatsappTransportadoraColeta(){const t=coletaTransportadoras.find(x=>String(x.id)===cv("coletaTransportadoraId"));return String(t?.whatsapp||t?.telefone||"").replace(/\D/g,"")}
function abrirWhatsAppColeta(){atualizarPreviaColeta();const tel=whatsappTransportadoraColeta();const url=tel?`https://wa.me/55${tel.replace(/^55/,"")}?text=${encodeURIComponent(cv("coletaPreviaMensagem"))}`:`https://wa.me/?text=${encodeURIComponent(cv("coletaPreviaMensagem"))}`;window.open(url,"_blank")}
async function salvarAgendamentoColeta(){const d=dadosColeta();if(!d.razao_destino)return alert("Informe o cliente/destino.");if(!cv("coletaModeloId"))return alert("Selecione um modelo.");atualizarPreviaColeta();const payload={cotacao_id:cv("coletaCotacaoId")||null,resposta_cotacao_id:cv("coletaRespostaId")||null,cliente_id:cv("coletaClienteId")||null,cliente_nome:d.razao_destino,transportadora_id:cv("coletaTransportadoraId")||null,modelo_id:String(cv("coletaModeloId")).startsWith("padrao-")?null:cv("coletaModeloId"),tipo_frete:cv("coletaTipoFrete"),dados:d,mensagem:cv("coletaPreviaMensagem"),volumes:Number(d.volumes)||null,peso:Number(String(d.peso).replace(",","."))||null,numero_nf:d.numero_nf||null,status:"solicitado",origem:cv("coletaCotacaoId")?"autorizacao_cotacao":"manual",observacao:cv("coletaObservacao")||null,criado_por:usuarioLogado?.login||null,atualizado_em:new Date().toISOString()};const id=cv("coletaAgendamentoId");const r=id?await banco.from("coleta_agendamentos").update(payload).eq("id",id):await banco.from("coleta_agendamentos").insert([payload]);if(r.error)return alert(r.error.message);alert("Agendamento salvo.");await carregarAgendamentosColeta();mostrarPainelColeta("historico")}
function limparFormularioColeta(){["coletaAgendamentoId","coletaCotacaoId","coletaRespostaId","coletaClienteId","coletaClienteBusca","coletaCnpjDestino","coletaRazaoDestino","coletaCepDestino","coletaCidadeDestino","coletaVolumes","coletaPeso","coletaValorNf","coletaNumeroNf","coletaLocalizacao","coletaObservacao"].forEach(id=>{if(ce(id))ce(id).value=""});atualizarPreviaColeta()}
function montarHistoricoColetas(){const tb=ce("coletaTabelaHistorico");if(!tb)return;const q=normalizarNomeEmail(cv("coletaBuscaHistorico"));const s=cv("coletaFiltroStatus");const lista=coletaAgendamentos.filter(a=>(!s||a.status===s)&&(!q||normalizarNomeEmail([a.cliente_nome,a.numero_nf,a.frete_transportadoras?.nome].filter(Boolean).join(" ")).includes(q)));tb.innerHTML=lista.length?lista.map(a=>`<tr><td>${new Date(a.created_at).toLocaleDateString("pt-BR")}</td><td>${new Date(a.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</td><td>${escaparHtmlEmail(a.cliente_nome||"")}</td><td>${escaparHtmlEmail(a.frete_transportadoras?.nome||"—")}</td><td>${a.volumes||"—"}</td><td>${a.peso?`${Number(a.peso).toLocaleString("pt-BR",{maximumFractionDigits:3})} Kg`:"—"}</td><td><span class="coleta-status ${a.status}">${a.status}</span></td><td><button class="btn azul" onclick="editarAgendamentoColeta('${a.id}')">Editar</button><button class="btn verde" onclick="copiarAgendamentoColeta('${a.id}')">Copiar</button><button class="btn roxo" onclick="alterarStatusColeta('${a.id}','confirmado')">Confirmar</button><button class="btn verde" onclick="alterarStatusColeta('${a.id}','coletado')">Coletado</button></td></tr>`).join(""):'<tr><td colspan="8">Nenhum agendamento encontrado.</td></tr>'}
function editarAgendamentoColeta(id){const a=coletaAgendamentos.find(x=>String(x.id)===String(id));if(!a)return;const d=a.dados||{};ce("coletaAgendamentoId").value=a.id;ce("coletaCotacaoId").value=a.cotacao_id||"";ce("coletaRespostaId").value=a.resposta_cotacao_id||"";ce("coletaClienteId").value=a.cliente_id||"";ce("coletaClienteBusca").value=a.cliente_nome||"";ce("coletaTransportadoraId").value=a.transportadora_id||"";if(a.modelo_id)ce("coletaModeloId").value=a.modelo_id;ce("coletaTipoFrete").value=a.tipo_frete||"CIF";const map={solicitante:"coletaSolicitante",telefone_origem:"coletaTelefoneOrigem",cnpj_origem:"coletaCnpjOrigem",razao_origem:"coletaRazaoOrigem",cep_origem:"coletaCepOrigem",endereco_origem:"coletaEnderecoOrigem",cnpj_destino:"coletaCnpjDestino",razao_destino:"coletaRazaoDestino",cep_destino:"coletaCepDestino",cidade_destino:"coletaCidadeDestino",volumes:"coletaVolumes",peso:"coletaPeso",numero_nf:"coletaNumeroNf",medidas:"coletaMedidas",natureza:"coletaNatureza",mercadoria:"coletaMercadoria",embalagem:"coletaEmbalagem",horario_limite:"coletaHorarioLimite",pausa:"coletaPausa",referencia:"coletaReferencia",localizacao:"coletaLocalizacao"};Object.entries(map).forEach(([k,id])=>{if(ce(id))ce(id).value=d[k]||""});ce("coletaObservacao").value=a.observacao||"";atualizarPreviaColeta();mostrarPainelColeta("nova")}
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

