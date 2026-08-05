
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

function interpretarRastreio(dados){
  const principal=escolherObjetoPrincipal(dados);
  const ocorrencia=extrairUltimaOcorrencia(principal)||{};
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

async function consultarTracking(token,{protocolo,numeroCte,numeroNfe,chaveNfe,cpfCnpj}={}){
  const params=new URLSearchParams();
  if(cpfCnpj)params.set("TaxIdRegistration",String(cpfCnpj).replace(/\D/g,""));
  if(numeroNfe)params.set("InvoiceNumber",String(numeroNfe));
  if(chaveNfe)params.set("InvoiceKey",String(chaveNfe).replace(/\D/g,""));
  if(protocolo)params.set("ProtocolNumber",String(protocolo).replace(/\D/g,""));
  if(numeroCte)params.set("CTeNumber",String(numeroCte).replace(/\D/g,""));

  if(![...params.keys()].length){
    throw new Error("Informe protocolo, CT-e, NF-e ou chave da NF-e para consultar o rastreio.");
  }

  const resposta=await fetch(
    `https://tracking-apigateway.rte.com.br/api/v1/tracking?${params.toString()}`,
    {headers:{"Accept":"application/json","Authorization":`Bearer ${token}`}}
  );
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

  if(resposta.status===204){
    const e=new Error("Rastreio ainda não disponível para os dados informados.");
    e.httpStatus=204;
    throw e;
  }
  if(!resposta.ok){
    const erro=primeiroValor(dados,"Message","message","error","title")||texto||`HTTP ${resposta.status}`;
    const e=new Error(String(erro));
    e.httpStatus=resposta.status;
    throw e;
  }

  return interpretarRastreio(dados);
}

module.exports={
  obterContextoTrackingRodonaves,
  gerarTokenTracking,
  consultarTracking,
  interpretarRastreio,
  mapearStatusRastreio
};
