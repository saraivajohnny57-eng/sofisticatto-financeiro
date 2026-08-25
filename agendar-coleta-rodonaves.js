const {
  json,exigirAdmin,supabaseRest,descriptografar
}=require("./_utils");

async function obterIntegracao(){
  const dados=await supabaseRest("transportadora_integracoes",{
    query:"?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1"
  });
  if(!dados?.[0])throw new Error("Integração Rodonaves não encontrada.");
  return dados[0];
}
async function obterCredenciais(conviteId){
  const dados=await supabaseRest("integracao_credenciais",{
    query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.homologacao&limit=1`
  });
  if(!dados?.[0])throw new Error("Credenciais da Rodonaves não cadastradas.");
  const cred=descriptografar(dados[0]);
  if(!cred.username||!cred.password)throw new Error("Usuário ou senha da Rodonaves ausente.");
  return cred;
}
async function tokenPickup(cred){
  const body=new URLSearchParams({
    auth_type:"DEV",
    grant_type:"password",
    username:cred.username,
    password:cred.password,
    companyId:"1"
  });
  const r=await fetch("https://pickup-apigateway.rte.com.br/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body:body.toString()
  });
  const t=await r.text();
  let d={};try{d=t?JSON.parse(t):{}}catch{d={raw:t}}
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`Falha no token Pickup: HTTP ${r.status}`);
  return d.access_token;
}
function pick(obj,...campos){
  for(const c of campos)if(obj?.[c]!==undefined&&obj?.[c]!==null&&obj?.[c]!=="")return obj[c];
  return null;
}
module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  const inicio=Date.now();
  let conviteId=null;
  try{
    const e=req.body||{};
    const protocolId=Number(e.protocol_id);
    const serviceType=Number(e.pickup_service_type||1);
    const scheduleDate=String(e.schedule_date||"");
    if(!protocolId)throw new Error("Protocolo da cotação obrigatório.");
    if(![1,2,3].includes(serviceType))throw new Error("Tipo de serviço inválido.");
    if(!scheduleDate||Number.isNaN(new Date(scheduleDate).getTime()))throw new Error("Data programada inválida.");

    const integracao=await obterIntegracao();
    conviteId=integracao.convite_id;
    const cred=await obterCredenciais(conviteId);
    const token=await tokenPickup(cred);

    const payload={
      ProtocolId:protocolId,
      PickupServiceType:serviceType,
      ScheduleDate:scheduleDate,
      Comment:String(e.comment||"").slice(0,500),
      RegisterSource:2
    };

    const r=await fetch("https://pickup-apigateway.rte.com.br/api/v1/pickup/pickupbyquotationprotocol",{
      method:"POST",
      headers:{
        "Accept":"application/json",
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      },
      body:JSON.stringify(payload)
    });
    const texto=await r.text();
    let dados={};try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

    if(!r.ok){
      const erro=pick(dados,"Message","message","error_description","error")||texto||`HTTP ${r.status}`;
      throw new Error(String(erro));
    }

    const pickupId=pick(dados,"Id","id","PickupId","pickupId","Code","code");
    const status=String(pick(dados,"Status","status","Description","description")||"solicitado");
    const agora=new Date().toISOString();

    let agendamentoId=e.agendamento_id||null;
    if(agendamentoId){
      await supabaseRest("coleta_agendamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(agendamentoId)}`,
        body:{
          protocolo_cotacao:String(protocolId),
          codigo_coleta:pickupId?String(pickupId):null,
          status_api:status,
          status:"solicitado",
          data_programada:scheduleDate,
          servico_api:serviceType,
          resposta_api:dados,
          solicitado_api_em:agora,
          atualizado_em:agora
        }
      });
    }

    await supabaseRest("integracao_logs",{
      method:"POST",
      body:{
        convite_id:conviteId,
        transportadora_nome:"Rodonaves",
        operacao:"agendar_coleta",
        ambiente:"homologacao",
        http_status:r.status,
        tempo_ms:Date.now()-inicio,
        sucesso:true,
        mensagem:`Coleta solicitada para protocolo ${protocolId}`,
        resposta_resumida:{pickup_id:pickupId,status}
      }
    });

    return json(res,200,{
      ok:true,
      agendamento_id:agendamentoId,
      pickup_id:pickupId?String(pickupId):null,
      status,
      resposta:dados
    });
  }catch(erro){
    try{
      await supabaseRest("integracao_logs",{
        method:"POST",
        body:{
          convite_id:conviteId,
          transportadora_nome:"Rodonaves",
          operacao:"agendar_coleta",
          ambiente:"homologacao",
          http_status:500,
          tempo_ms:Date.now()-inicio,
          sucesso:false,
          mensagem:erro.message
        }
      });
    }catch{}
    return json(res,502,{ok:false,erro:erro.message});
  }
};