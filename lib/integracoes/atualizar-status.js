const {
  json,exigirAdminOuCron,supabaseRest
}=require("./_utils");
const {
  obterContextoRodonaves,gerarTokenPickup,consultarAgendamento
}=require("./_rodonaves-pickup");

const STATUS_ABERTOS=[
  "solicitado","em_aberto","confirmado","em_coleta",
  "reagendada","nao_coletada","erro"
];

async function registrarExecucao(payload){
  try{
    await supabaseRest("integracao_sincronizacoes",{
      method:"POST",
      body:payload
    });
  }catch(erro){
    console.warn("Falha ao registrar sincronização:",erro.message);
  }
}

async function criarNotificacao(agendamento,statusAnterior,statusNovo){
  try{
    await supabaseRest("notificacoes_sistema",{
      method:"POST",
      body:{
        destinatario_tipo:"financeiro",
        tipo_evento:"status_coleta_alterado",
        titulo:`Coleta ${statusNovo.replace(/_/g," ")}`,
        mensagem:`${agendamento.cliente_nome||"Cliente"}: ${statusAnterior||"sem status"} → ${statusNovo}`,
        cliente_nome:agendamento.cliente_nome||null,
        criado_por:"sincronizacao_automatica"
      }
    });
  }catch{}
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)){
    return json(res,405,{ok:false,erro:"Método não permitido."});
  }
  if(!exigirAdminOuCron(req,res))return;

  const inicio=Date.now();
  const iniciadoEm=new Date().toISOString();
  let total=0,consultadas=0,alteradas=0,erros=0;
  const resultados=[];

  try{
    const contexto=await obterContextoRodonaves();
    if(!contexto.transportadoraIds.length){
      throw new Error("Cadastro da transportadora Rodonaves não encontrado.");
    }

    const ids=contexto.transportadoraIds.map(String).join(",");
    const status=STATUS_ABERTOS.join(",");
    const lista=await supabaseRest("coleta_agendamentos",{
      query:`?select=id,cliente_nome,transportadora_id,codigo_coleta,protocolo_cotacao,status,status_api,data_programada&transportadora_id=in.(${ids})&status=in.(${status})&order=created_at.asc&limit=100`
    });

    total=(lista||[]).length;
    if(!total){
      await registrarExecucao({
        transportadora_nome:"Rodonaves",
        origem:req.headers.authorization?"vercel_cron":"painel",
        iniciado_em:iniciadoEm,
        finalizado_em:new Date().toISOString(),
        total_encontrado:0,total_consultado:0,total_alterado:0,total_erros:0,
        sucesso:true,detalhes:{mensagem:"Nenhuma coleta aberta."}
      });
      return json(res,200,{ok:true,total:0,consultadas:0,alteradas:0,erros:0,resultados:[]});
    }

    const token=await gerarTokenPickup(contexto.cred);

    for(const agendamento of lista){
      const anterior=agendamento.status||"solicitado";
      try{
        const consulta=await consultarAgendamento(token,agendamento);
        const agora=new Date().toISOString();
        const patch={
          status:consulta.status,
          status_api:consulta.status,
          consulta_api:consulta.dados,
          consultado_api_em:agora,
          sincronizado_em:agora,
          sincronizacao_erro:null,
          atualizado_em:agora
        };
        if(!agendamento.codigo_coleta&&consulta.identificador!==String(agendamento.protocolo_cotacao||"")){
          patch.codigo_coleta=consulta.identificador;
        }
        if(consulta.status==="coletado"){
          patch.coletado_em=consulta.dataColeta||agora;
        }

        await supabaseRest("coleta_agendamentos",{
          method:"PATCH",
          query:`?id=eq.${encodeURIComponent(agendamento.id)}`,
          body:patch
        });
        consultadas++;

        const mudou=anterior!==consulta.status;
        if(mudou){
          alteradas++;
          await supabaseRest("coleta_status_eventos",{
            method:"POST",
            body:{
              agendamento_id:agendamento.id,
              status_anterior:anterior,
              status_novo:consulta.status,
              origem:"sincronizacao_automatica",
              detalhes:{
                identificador:consulta.identificador,
                status_bruto:consulta.statusBruto,
                data_coleta:consulta.dataColeta,
                unidade:consulta.unidade
              },
              usuario:"sistema"
            }
          });
          await criarNotificacao(agendamento,anterior,consulta.status);
        }

        resultados.push({
          id:agendamento.id,
          cliente:agendamento.cliente_nome,
          anterior,
          atual:consulta.status,
          alterado:mudou
        });
      }catch(erro){
        erros++;
        const agora=new Date().toISOString();
        await supabaseRest("coleta_agendamentos",{
          method:"PATCH",
          query:`?id=eq.${encodeURIComponent(agendamento.id)}`,
          body:{
            sincronizado_em:agora,
            sincronizacao_erro:String(erro.message||erro).slice(0,1000),
            atualizado_em:agendamento.atualizado_em||agora
          }
        }).catch(()=>{});
        resultados.push({
          id:agendamento.id,
          cliente:agendamento.cliente_nome,
          erro:erro.message
        });
      }
    }

    await registrarExecucao({
      transportadora_nome:"Rodonaves",
      origem:req.headers.authorization?"vercel_cron":"painel",
      iniciado_em:iniciadoEm,
      finalizado_em:new Date().toISOString(),
      total_encontrado:total,
      total_consultado:consultadas,
      total_alterado:alteradas,
      total_erros:erros,
      sucesso:erros===0,
      detalhes:{tempo_ms:Date.now()-inicio,resultados}
    });

    return json(res,200,{
      ok:true,total,consultadas,alteradas,erros,
      tempo_ms:Date.now()-inicio,
      resultados
    });
  }catch(erro){
    await registrarExecucao({
      transportadora_nome:"Rodonaves",
      origem:req.headers.authorization?"vercel_cron":"painel",
      iniciado_em:iniciadoEm,
      finalizado_em:new Date().toISOString(),
      total_encontrado:total,total_consultado:consultadas,
      total_alterado:alteradas,total_erros:erros+1,
      sucesso:false,detalhes:{erro:erro.message,tempo_ms:Date.now()-inicio}
    });
    return json(res,502,{ok:false,erro:erro.message});
  }
};
