const {
  json,exigirAdmin,supabaseRest,descriptografar
}=require("./_utils");

async function credenciais(){
  const integ=await supabaseRest("transportadora_integracoes",{
    query:"?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1"
  });
  if(!integ?.[0])throw new Error("Integração Rodonaves não encontrada.");
  const lista=await supabaseRest("integracao_credenciais",{
    query:`?select=*&convite_id=eq.${encodeURIComponent(integ[0].convite_id)}&ambiente=eq.homologacao&limit=1`
  });
  if(!lista?.[0])throw new Error("Credenciais Rodonaves não cadastradas.");
  return {cred:descriptografar(lista[0]),conviteId:integ[0].convite_id};
}
async function token(cred){
  const body=new URLSearchParams({
    auth_type:"DEV",grant_type:"password",
    username:cred.username,password:cred.password,companyId:"1"
  });
  const r=await fetch("https://pickup-apigateway.rte.com.br/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body:body.toString()
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`Token HTTP ${r.status}`);
  return d.access_token;
}
function pick(o,...ks){for(const k of ks)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=="")return o[k];return null}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;
  try{
    const id=String(req.query.id||"").replace(/\D/g,"");
    const agendamentoId=String(req.query.agendamento_id||"");
    if(!id)throw new Error("Código da coleta obrigatório.");

    const {cred}=await credenciais();
    const tk=await token(cred);
    const r=await fetch(`https://pickup-apigateway.rte.com.br/api/v1/pickup/${encodeURIComponent(id)}`,{
      headers:{"Accept":"application/json","Authorization":`Bearer ${tk}`}
    });
    const texto=await r.text();
    let dados={};try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}
    if(!r.ok)throw new Error(pick(dados,"Message","message","error")||texto||`HTTP ${r.status}`);

    const statusBruto=String(pick(dados,"Status","status","StatusDescription","statusDescription","Description","description")||"consultado");
    const status=statusBruto.trim().toLowerCase().replace(/\s+/g,"_");
    const unidade=pick(dados,"EmissionUnit.Description","Unit.Description","unit","EmissionUnit");
    const observacao=pick(dados,"Comment","comment","Observation","observation");

    if(agendamentoId){
      await supabaseRest("coleta_agendamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(agendamentoId)}`,
        body:{
          status_api:status,
          consulta_api:dados,
          consultado_api_em:new Date().toISOString(),
          atualizado_em:new Date().toISOString()
        }
      });
    }
    return json(res,200,{ok:true,id,status,unidade,observacao,resposta:dados});
  }catch(erro){
    return json(res,502,{ok:false,erro:erro.message});
  }
};