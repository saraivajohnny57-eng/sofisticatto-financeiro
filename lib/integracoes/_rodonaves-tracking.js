
const {supabaseRest,descriptografar}=require("./_utils");

async function obterContextoTrackingRodonaves(){
  const transportadoras=await supabaseRest("frete_transportadoras",{
    query:"?select=id,nome&nome=ilike.*Rodonaves*"
  });
  const integracoes=await supabaseRest("transportadora_integracoes",{
    query:"?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1"
  });
  if(!integracoes?.[0])throw new Error("Integração Rodonaves não encontrada.");

  const conviteId=integracoes[0].convite_id;
  const credenciais=await supabaseRest("integracao_credenciais",{
    query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.homologacao&limit=1`
  });
  if(!credenciais?.[0])throw new Error("Credenciais Rodonaves não cadastradas.");

  return {
    conviteId,
    transportadoraIds:(transportadoras||[]).map(x=>x.id),
    cred:descriptografar(credenciais[0])
  };
}

async function gerarTokenTracking(cred){
  const body=new URLSearchParams({
    auth_type:"DEV",
    grant_type:"password",
    username:cred.username,
    password:cred.password
  });
  const resposta=await fetch("https://tracking-apigateway.rte.com.br/token",{
    method:"POST",
    headers:{
      "Content-Type":"application/x-www-form-urlencoded",
      "Accept":"application/json"
    },
    body:body.toString()
  });
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}
  if(!resposta.ok||!dados.access_token){
    const erro=dados.error_description||dados.error||texto||`HTTP ${resposta.status}`;
    const e=new Error(`Falha no token de rastreio: ${erro}`);
    e.httpStatus=resposta.status;
    throw e;
  }
  return dados.access_token;
}

function primeiroValor(obj,...caminhos){
  for(const caminho of caminhos){
    const valor=String(caminho||"").split(".").reduce((atual,chave)=>atual?.[chave],obj);
    if(valor!==undefined&&valor!==null&&valor!=="")return valor;
  }
  return null;
}

function normalizarTexto(valor){
  return String(valor||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim();
}

function mapearStatusRastreio(valor){
  const s=normalizarTexto(valor).replace(/[^a-z0-9]+/g,"_");
  if(!s)return "em_transito";
  if(/entregue|finalizad|recebid/.test(s))return "entregue";
  if(/saiu.*entrega|em_rota.*entrega|rota_de_entrega/.test(s))return "saiu_entrega";
  if(/ocorrencia|avaria|recusa|sinistro|extravio|pendencia/.test(s))return "ocorrencia";
  if(/atrasad|prazo_vencid/.test(s))return "atrasado";
  if(/cancelad/.test(s))return "cancelado";
  if(/filial|unidade|transferencia/.test(s))return "na_filial";
  if(/coletad|mercadoria_em_viagem|em_viagem|transito|transport/.test(s))return "em_transito";
  if(/aguardando_coleta|solicitad|programad/.test(s))return "aguardando_coleta";
  return "em_transito";
}

function escolherObjetoPrincipal(dados){
  if(Array.isArray(dados))return dados[0]||{};
  if(Array.isArray(dados?.Data))return dados.Data[0]||{};
  if(Array.isArray(dados?.data))return dados.data[0]||{};
  if(Array.isArray(dados?.Items))return dados.Items[0]||{};
  if(Array.isArray(dados?.items))return dados.items[0]||{};
  return dados||{};
}

function extrairUltimaOcorrencia(obj){
  const listas=[
    obj.Occurrences,obj.occurrences,
    obj.Events,obj.events,
    obj.History,obj.history,
    obj.TrackingEvents,obj.trackingEvents
  ].find(Array.isArray);
  if(!listas?.length)return null;
  return listas[listas.length-1];
}


function extrairEventosRastreio(dados){
  const principal=escolherObjetoPrincipal(dados);
  const listas=[
    principal.Occurrences,principal.occurrences,principal.Events,principal.events,
    principal.History,principal.history,principal.TrackingEvents,principal.trackingEvents
  ].filter(Array.isArray);
  const arr=(listas[0]||[]).map(o=>({
    titulo:primeiroValor(o,'StatusDescription','statusDescription','OccurrenceDescription','occurrenceDescription','Status','status','Description','description')||'Ocorrência Rodonaves',
    descricao:primeiroValor(o,'Description','description','OccurrenceDescription','occurrenceDescription','Complement','complement','Observation','observation')||'',
    data:primeiroValor(o,'DateTime','dateTime','OccurrenceDate','occurrenceDate','Date','date'),
    local:[primeiroValor(o,'City','city','Location','location','Branch','branch'),primeiroValor(o,'State','state','UF','uf')].filter(Boolean).join(' / '),
    codigo:primeiroValor(o,'Code','code','OccurrenceCode','occurrenceCode'),
    raw:o
  }));
  return arr;
}

function interpretarRastreio(dados){
  const principal=escolherObjetoPrincipal(dados);
  const eventos=extrairEventosRastreio(dados);
  const ocorrencia=eventos.length ? eventos[eventos.length-1].raw : (extrairUltimaOcorrencia(principal)||{});
  const statusBruto=primeiroValor(
    ocorrencia,
    "Description","description","StatusDescription","statusDescription",
    "OccurrenceDescription","occurrenceDescription","Status","status"
  )||primeiroValor(
    principal,
    "Status","status","StatusDescription","statusDescription",
    "Situation","situation","Description","description",
    "LastOccurrence.Description","lastOccurrence.description"
  )||"Mercadoria em trânsito";

  return {
    dados,
    eventos,
    statusBruto:String(statusBruto),
    status:mapearStatusRastreio(statusBruto),
    numeroCte:primeiroValor(principal,"CTeNumber","cteNumber","BillOfLadingNumber","billOfLadingNumber"),
    previsaoEntrega:primeiroValor(
      principal,
      "DeliveryForecast","deliveryForecast","ExpectedDeliveryDate","expectedDeliveryDate",
      "EstimatedDeliveryDate","estimatedDeliveryDate","ForecastDate","forecastDate"
    ),
    dataEmissao:primeiroValor(principal,"IssueDate","issueDate","EmissionDate","emissionDate"),
    ultimaOcorrencia:primeiroValor(
      ocorrencia,"Description","description","OccurrenceDescription","occurrenceDescription"
    )||String(statusBruto),
    ultimaOcorrenciaEm:primeiroValor(
      ocorrencia,"Date","date","OccurrenceDate","occurrenceDate","DateTime","dateTime"
    ),
    protocolo:primeiroValor(principal,"ProtocolNumber","protocolNumber","Protocol","protocol"),
    numeroNfe:primeiroValor(principal,"InvoiceNumber","invoiceNumber"),
    chaveNfe:primeiroValor(principal,"InvoiceKey","invoiceKey")
  };
}


function limparNumero(valor){
  return String(valor||"").replace(/\D/g,"");
}

function erroPermiteProximaTentativa(erro){
  const status=Number(erro?.httpStatus||0);
  const texto=normalizarTexto(erro?.message||erro);
  return status===204||status===404||
    /nao_encontrado|not_found|nao_localizad|sem_resultado|registro_de_coleta_nao_encontrado/.test(texto);
}

async function executarConsultaTracking(token,params,metodo,valor){
  const resposta=await fetch(
    `https://tracking-apigateway.rte.com.br/api/v1/tracking?${params.toString()}`,
    {headers:{"Accept":"application/json","Authorization":`Bearer ${token}`}}
  );
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

  if(resposta.status===204){
    const e=new Error(`Nenhum rastreio encontrado por ${metodo}.`);
    e.httpStatus=204;
    e.metodo=metodo;
    e.valor=valor;
    throw e;
  }
  if(!resposta.ok){
    const erro=primeiroValor(dados,"Message","message","error","title")||texto||`HTTP ${resposta.status}`;
    const e=new Error(String(erro));
    e.httpStatus=resposta.status;
    e.metodo=metodo;
    e.valor=valor;
    throw e;
  }

  const interpretado=interpretarRastreio(dados);
  return {
    ...interpretado,
    metodoConsulta:metodo,
    valorConsultado:valor
  };
}

async function consultarTracking(token,{
  protocolo,numeroCte,numeroNfe,chaveNfe,cpfCnpj,
  consultaInteligente=true
}={}){
  const documentoCliente=limparNumero(
    cpfCnpj||
    process.env.RODONAVES_TRACKING_TAX_ID||
    process.env.RODONAVES_CUSTOMER_TAX_ID||
    "05451985000195"
  );

  const tentativas=[];
  const adicionar=(metodo,valor,params)=>{
    const limpo=limparNumero(valor);
    if(!limpo)return;
    if(tentativas.some(x=>x.metodo===metodo&&x.valor===limpo))return;
    tentativas.push({metodo,valor:limpo,params});
  };

  if(protocolo){
    const params=new URLSearchParams();
    params.set("ProtocolNumber",limparNumero(protocolo));
    adicionar("protocolo/minuta",protocolo,params);
  }

  if(numeroNfe){
    const params=new URLSearchParams();
    if(documentoCliente)params.set("TaxIdRegistration",documentoCliente);
    params.set("InvoiceNumber",limparNumero(numeroNfe));
    adicionar("nota fiscal",numeroNfe,params);
  }

  if(numeroCte){
    const params=new URLSearchParams();
    params.set("CTeNumber",limparNumero(numeroCte));
    adicionar("CT-e",numeroCte,params);
  }

  if(chaveNfe){
    const params=new URLSearchParams();
    if(documentoCliente)params.set("TaxIdRegistration",documentoCliente);
    params.set("InvoiceKey",limparNumero(chaveNfe));
    adicionar("chave da NF-e",chaveNfe,params);
  }

  if(!tentativas.length){
    throw new Error("Informe protocolo, número da NF-e, CT-e ou chave da NF-e.");
  }

  const executadas=[];
  let ultimoErro=null;

  for(const tentativa of (consultaInteligente?tentativas:tentativas.slice(0,1))){
    try{
      const resultado=await executarConsultaTracking(
        token,tentativa.params,tentativa.metodo,tentativa.valor
      );
      executadas.push({
        metodo:tentativa.metodo,
        valor:tentativa.valor,
        sucesso:true
      });
      return {
        ...resultado,
        tentativas:executadas
      };
    }catch(erro){
      ultimoErro=erro;
      executadas.push({
        metodo:tentativa.metodo,
        valor:tentativa.valor,
        sucesso:false,
        httpStatus:erro.httpStatus||null,
        erro:String(erro.message||erro)
      });
      if(!erroPermiteProximaTentativa(erro))break;
    }
  }

  const resumo=executadas.map(x=>`${x.metodo}: não localizado`).join("; ");
  const e=new Error(
    ultimoErro?.httpStatus===403
      ?"A API de rastreio recusou o acesso. Verifique a liberação do usuário para rastreamento."
      :`Mercadoria não localizada. Tentativas realizadas: ${resumo}.`
  );
  e.httpStatus=ultimoErro?.httpStatus||404;
  e.tentativas=executadas;
  throw e;
}

module.exports={
  obterContextoTrackingRodonaves,
  gerarTokenTracking,
  consultarTracking,
  interpretarRastreio,
  erroPermiteProximaTentativa,
  mapearStatusRastreio,
  extrairEventosRastreio
};
