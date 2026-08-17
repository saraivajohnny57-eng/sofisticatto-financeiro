const {supabaseRest,descriptografar}=require("./_utils");

async function obterContextoRodonaves(){
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

async function gerarTokenPickup(cred){
  const body=new URLSearchParams({
    auth_type:"DEV",
    grant_type:"password",
    username:cred.username,
    password:cred.password,
    companyId:"1"
  });
  const resposta=await fetch("https://pickup-apigateway.rte.com.br/token",{
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
    throw new Error(dados.error_description||dados.error||`Falha no token Pickup: HTTP ${resposta.status}`);
  }
  return dados.access_token;
}

function primeiroValor(obj,...chaves){
  for(const chave of chaves){
    if(!chave)continue;
    const valor=String(chave).split(".").reduce((atual,parte)=>atual?.[parte],obj);
    if(valor!==undefined&&valor!==null&&valor!=="")return valor;
  }
  return null;
}

function textoNormalizado(valor){
  return String(valor||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim();
}

function mapearStatusRodonaves(valor){
  const s=textoNormalizado(valor).replace(/[^a-z0-9]+/g,"_");
  if(!s)return "consultado";
  if(/coleta_realizada|coletad|baixad|realizada/.test(s))return "coletado";
  if(/cancelad/.test(s))return "cancelado";
  if(/nao_colet|coleta_nao_realizada|insucesso/.test(s))return "nao_coletada";
  if(/confirmad|programad|agendad/.test(s))return "confirmado";
  if(/em_coleta|motorista|rota_coleta/.test(s))return "em_coleta";
  if(/erro|falha/.test(s))return "erro";
  if(/solicitad|abert|pendente/.test(s))return "solicitado";
  return s;
}

function extrairDataColeta(dados){
  return primeiroValor(
    dados,
    "PickupDate","pickupDate",
    "DischargeDate","dischargeDate",
    "ClosingDate","closingDate",
    "DateTimeDischarge","dateTimeDischarge",
    "Date","date"
  );
}

async function consultarPickup(token,identificador){
  const resposta=await fetch(
    `https://pickup-apigateway.rte.com.br/api/v1/pickup/${encodeURIComponent(identificador)}`,
    {headers:{"Accept":"application/json","Authorization":`Bearer ${token}`}}
  );
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}
  if(!resposta.ok){
    const erro=primeiroValor(dados,"Message","message","error","title")||texto||`HTTP ${resposta.status}`;
    const e=new Error(String(erro));
    e.httpStatus=resposta.status;
    throw e;
  }

  const statusBruto=primeiroValor(
    dados,
    "Status","status",
    "StatusDescription","statusDescription",
    "Description","description",
    "Situation","situation"
  )||"consultado";

  return {
    dados,
    statusBruto:String(statusBruto),
    status:mapearStatusRodonaves(statusBruto),
    dataColeta:extrairDataColeta(dados),
    unidade:primeiroValor(dados,"EmissionUnit.Description","Unit.Description","unit","EmissionUnit"),
    observacao:primeiroValor(dados,"Comment","comment","Observation","observation")
  };
}

async function consultarAgendamento(token,agendamento){
  const candidatos=[
    agendamento.codigo_coleta,
    agendamento.protocolo_cotacao
  ].map(v=>String(v||"").replace(/\D/g,"")).filter(Boolean);

  if(!candidatos.length)throw new Error("Coleta sem código e sem protocolo para consulta.");

  let ultimoErro=null;
  for(const identificador of [...new Set(candidatos)]){
    try{
      const consulta=await consultarPickup(token,identificador);
      return {...consulta,identificador};
    }catch(erro){
      ultimoErro=erro;
    }
  }
  throw ultimoErro||new Error("Não foi possível consultar a coleta.");
}

module.exports={
  obterContextoRodonaves,
  gerarTokenPickup,
  consultarPickup,
  consultarAgendamento,
  mapearStatusRodonaves,
  primeiroValor
};
