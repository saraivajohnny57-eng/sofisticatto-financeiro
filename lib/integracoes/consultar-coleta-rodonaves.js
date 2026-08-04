const {
  json,exigirAdmin,supabaseRest
}=require("./_utils");
const {
  obterContextoRodonaves,gerarTokenPickup,consultarPickup,mapearStatusRodonaves
}=require("./_rodonaves-pickup");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  try{
    const id=String(req.query.id||"").replace(/\D/g,"");
    const agendamentoId=String(req.query.agendamento_id||"");
    if(!id)throw new Error("Código ou protocolo da coleta obrigatório.");

    const contexto=await obterContextoRodonaves();
    const token=await gerarTokenPickup(contexto.cred);
    const consulta=await consultarPickup(token,id);
    const agora=new Date().toISOString();

    if(agendamentoId){
      const anteriores=await supabaseRest("coleta_agendamentos",{
        query:`?select=id,status,cliente_nome& id=eq.${encodeURIComponent(agendamentoId)}`.replace("& ","&")
      });
      const anterior=anteriores?.[0]?.status||null;
      const patch={
        status:consulta.status,
        status_api:consulta.status,
        consulta_api:consulta.dados,
        consultado_api_em:agora,
        sincronizado_em:agora,
        sincronizacao_erro:null,
        atualizado_em:agora
      };
      if(consulta.status==="coletado"){
        patch.coletado_em=consulta.dataColeta||agora;
      }
      await supabaseRest("coleta_agendamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(agendamentoId)}`,
        body:patch
      });

      if(anterior!==consulta.status){
        await supabaseRest("coleta_status_eventos",{
          method:"POST",
          body:{
            agendamento_id:agendamentoId,
            status_anterior:anterior,
            status_novo:consulta.status,
            origem:"api_rodonaves",
            detalhes:{
              identificador:id,
              status_bruto:consulta.statusBruto,
              data_coleta:consulta.dataColeta,
              unidade:consulta.unidade
            },
            usuario:"sincronizacao_api"
          }
        });
      }
    }

    return json(res,200,{
      ok:true,
      id,
      status:consulta.status,
      status_bruto:consulta.statusBruto,
      data_coleta:consulta.dataColeta,
      unidade:consulta.unidade,
      observacao:consulta.observacao,
      resposta:consulta.dados
    });
  }catch(erro){
    return json(res,502,{ok:false,erro:erro.message});
  }
};
