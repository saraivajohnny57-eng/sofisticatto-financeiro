const {
  json,exigirAdminOuCron,supabaseRest
}=require("./_utils");
const {
  obterContextoRodonaves,gerarTokenPickup,consultarAgendamento
}=require("./_rodonaves-pickup");
const {
  gerarTokenTracking,consultarTracking
}=require("./_rodonaves-tracking");

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


async function garantirRastreiosDasColetasRodonaves(contexto){
  const resultado={criadas:0,atualizadas:0,ignoradas:0,erros:0};
  if(!contexto?.transportadoraIds?.length)return resultado;

  const ids=contexto.transportadoraIds.map(String).join(",");
  const coletas=await supabaseRest("coleta_agendamentos",{
    query:`?select=id,cliente_nome,transportadora_id,protocolo_cotacao,codigo_coleta,numero_nf,volumes,peso,data_programada,coletado_em,status,status_api,origem,dados&transportadora_id=in.(${ids})&status=not.eq.cancelado&order=created_at.asc&limit=250`
  }).catch(()=>[]);

  for(const coleta of (coletas||[])){
    const protocolo=coleta.protocolo_cotacao||null;
    const numeroNfe=coleta.numero_nf||coleta?.dados?.numero_nf||coleta?.dados?.numero_nfe||null;
    const numeroCte=coleta?.dados?.numero_cte||null;
    const chaveNfe=coleta?.dados?.chave_nfe||coleta?.dados?.chave_nf||null;
    const statusAtual=String(coleta.status_api||coleta.status||"").toLowerCase();
    const coletada=/coletad/.test(statusAtual);

    if(!protocolo&&!numeroNfe&&!numeroCte&&!chaveNfe){
      resultado.ignoradas++;
      continue;
    }

    try{
      let existentes=await supabaseRest("logistica_rastreamentos",{
        query:`?select=*&coleta_agendamento_id=eq.${encodeURIComponent(coleta.id)}&limit=1`
      });
      let existente=existentes?.[0]||null;

      if(!existente){
        const filtros=[];
        if(chaveNfe)filtros.push(`chave_nfe.eq.${encodeURIComponent(String(chaveNfe).replace(/\D/g,""))}`);
        if(numeroCte)filtros.push(`numero_cte.eq.${encodeURIComponent(numeroCte)}`);
        if(numeroNfe)filtros.push(`numero_nfe.eq.${encodeURIComponent(numeroNfe)}`);
        if(protocolo)filtros.push(`protocolo_rastreio.eq.${encodeURIComponent(protocolo)}`);

        for(const filtro of filtros){
          const achados=await supabaseRest("logistica_rastreamentos",{
            query:`?select=*&sentido=eq.saida&transportadora_id=eq.${encodeURIComponent(coleta.transportadora_id)}&${filtro}&order=consultado_api_em.desc.nullslast,created_at.desc&limit=1`
          }).catch(()=>[]);
          if(achados?.[0]){
            existente=achados[0];
            break;
          }
        }
      }
      const agora=new Date().toISOString();
      const payload={
        sentido:"saida",
        parceiro_nome:coleta.cliente_nome||"Cliente",
        transportadora_id:coleta.transportadora_id,
        protocolo_rastreio:protocolo||existente?.protocolo_rastreio||null,
        numero_nfe:numeroNfe||existente?.numero_nfe||null,
        numero_cte:numeroCte||existente?.numero_cte||null,
        chave_nfe:String(chaveNfe||existente?.chave_nfe||"").replace(/\D/g,"")||null,
        data_postagem:coletada
          ?String(coleta.coletado_em||coleta.data_programada||agora).slice(0,10)
          :(coleta.data_programada?String(coleta.data_programada).slice(0,10):null),
        volumes:coleta.volumes||null,
        status:coletada?"em_transito":(existente?.status||"aguardando_coleta"),
        observacao:`Monitoramento automático da coleta (${coleta.origem||"sistema"}).`,
        coleta_agendamento_id:coleta.id,
        origem:"coleta_agendamento",
        atualizado_em:agora,
        atualizado_por:"sincronizacao_automatica"
      };

      if(existente?.id){
        await supabaseRest("logistica_rastreamentos",{
          method:"PATCH",
          query:`?id=eq.${encodeURIComponent(existente.id)}`,
          body:payload
        });
        resultado.atualizadas++;
      }else{
        await supabaseRest("logistica_rastreamentos",{method:"POST",body:payload});
        resultado.criadas++;
      }
    }catch(erro){
      resultado.erros++;
    }
  }
  return resultado;
}


async function sincronizarRastreios(contexto,transportadoraIds){
  const resultado={
    total:0,consultados:0,alterados:0,ignorados:0,erros:0,itens:[]
  };
  if(!transportadoraIds?.length)return resultado;

  const ids=transportadoraIds.map(String).join(",");
  const rastreios=await supabaseRest("logistica_rastreamentos",{
    query:`?select=*&transportadora_id=in.(${ids})&status=not.in.(entregue,recebido,cancelado)&order=created_at.asc&limit=150`
  }).catch(()=>[]);

  resultado.total=(rastreios||[]).length;
  if(!resultado.total)return resultado;

  let token=null;
  try{
    token=await gerarTokenTracking(contexto.cred);
  }catch(erro){
    resultado.erros=resultado.total;
    resultado.itens.push({erro:erro.message});
    return resultado;
  }

  for(const rastreio of rastreios){
    const possuiIdentificador=Boolean(
      rastreio.protocolo_rastreio||
      rastreio.numero_cte||
      rastreio.numero_nfe||
      rastreio.chave_nfe
    );
    if(!possuiIdentificador){
      resultado.ignorados++;
      continue;
    }

    try{
      const anterior=rastreio.status||"aguardando_coleta";
      const consulta=await consultarTracking(token,{
        protocolo:rastreio.protocolo_rastreio,
        numeroCte:rastreio.numero_cte,
        numeroNfe:rastreio.numero_nfe,
        chaveNfe:rastreio.chave_nfe
      });
      const agora=new Date().toISOString();
      const patch={
        status:consulta.status,
        status_api:consulta.statusBruto,
        numero_cte:consulta.numeroCte||rastreio.numero_cte||null,
        previsao_entrega:consulta.previsaoEntrega||rastreio.previsao_entrega||null,
        ultima_ocorrencia:consulta.ultimaOcorrencia||null,
        ultima_ocorrencia_em:consulta.ultimaOcorrenciaEm||null,
        consulta_api:{
          retorno:consulta.dados,
          metodo_consulta:consulta.metodoConsulta,
          valor_consultado:consulta.valorConsultado,
          tentativas:consulta.tentativas||[]
        },
        metodo_consulta:consulta.metodoConsulta||null,
        consultado_api_em:agora,
        sincronizacao_erro:null,
        atualizado_em:agora,
        atualizado_por:"sincronizacao_automatica"
      };
      if(consulta.status==="entregue")patch.finalizado_em=agora;

      await supabaseRest("logistica_rastreamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(rastreio.id)}`,
        body:patch
      });
      resultado.consultados++;

      const mudou=anterior!==consulta.status;
      if(mudou)resultado.alterados++;

      if(rastreio.coleta_agendamento_id||rastreio.protocolo_rastreio){
        const filtro=rastreio.coleta_agendamento_id
          ?`?id=eq.${encodeURIComponent(rastreio.coleta_agendamento_id)}`
          :`?protocolo_cotacao=eq.${encodeURIComponent(rastreio.protocolo_rastreio)}`;

        const statusColeta=["em_transito","na_filial","saiu_entrega","entregue"].includes(consulta.status)
          ?"coletado"
          :null;

        if(statusColeta){
          await supabaseRest("coleta_agendamentos",{
            method:"PATCH",
            query:filtro,
            body:{
              status:"coletado",
              status_api:"coletado",
              coletado_em:rastreio.data_postagem||agora,
              sincronizado_em:agora,
              sincronizacao_erro:null,
              atualizado_em:agora
            }
          }).catch(()=>{});
        }
      }

      resultado.itens.push({
        id:rastreio.id,
        parceiro:rastreio.parceiro_nome,
        anterior,
        atual:consulta.status,
        status_bruto:consulta.statusBruto,
        metodo_consulta:consulta.metodoConsulta,
        valor_consultado:consulta.valorConsultado,
        alterado:mudou
      });
    }catch(erro){
      resultado.erros++;
      await supabaseRest("logistica_rastreamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(rastreio.id)}`,
        body:{
          consultado_api_em:new Date().toISOString(),
          sincronizacao_erro:String(erro.message||erro).slice(0,1000),
          consulta_api:{
            tentativas:erro.tentativas||[],
            falha_em:new Date().toISOString()
          },
          atualizado_em:new Date().toISOString()
        }
      }).catch(()=>{});
      resultado.itens.push({id:rastreio.id,parceiro:rastreio.parceiro_nome,erro:erro.message});
    }
  }
  return resultado;
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)){
    return json(res,405,{ok:false,erro:"Método não permitido."});
  }
  if(!exigirAdminOuCron(req,res))return;

  const inicio=Date.now();
  const iniciadoEm=new Date().toISOString();
  let total=0,consultadas=0,alteradas=0,ignoradas=0,erros=0;
  const resultados=[];

  try{
    const contexto=await obterContextoRodonaves();
    if(!contexto.transportadoraIds.length){
      throw new Error("Cadastro da transportadora Rodonaves não encontrado.");
    }

    const ids=contexto.transportadoraIds.map(String).join(",");
    const status=STATUS_ABERTOS.join(",");
    const lista=await supabaseRest("coleta_agendamentos",{
      query:`?select=id,cliente_nome,transportadora_id,codigo_coleta,protocolo_cotacao,status,status_api,data_programada,sincronizacao_erro,origem,dados&transportadora_id=in.(${ids})&status=in.(${status})&order=created_at.asc&limit=100`
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
      const vinculacao=await garantirRastreiosDasColetasRodonaves(contexto);
      const rastreios=await sincronizarRastreios(contexto,contexto.transportadoraIds);
      return json(res,200,{
        ok:rastreios.erros===0,total:0,consultadas:0,alteradas:0,ignoradas:0,erros:rastreios.erros,
        resultados:[],vinculacao,rastreios
      });
    }

    const podeConsultar=a=>{
      const codigo=String(a.codigo_coleta||"").replace(/\D/g,"");
      if(!codigo)return false;
      const externa=Boolean(a?.dados?.origem_externa||a?.origem==="importacao_externa");
      return !externa||a?.dados?.codigo_coleta_validado===true;
    };
    const consultaveis=(lista||[]).filter(podeConsultar);
    const semCodigo=(lista||[]).filter(a=>!podeConsultar(a));
    ignoradas=semCodigo.length;

    for(const agendamento of semCodigo){
      resultados.push({
        id:agendamento.id,
        cliente:agendamento.cliente_nome,
        ignorado:true,
        motivo:agendamento.codigo_coleta
          ?"O número informado ainda não foi validado como código da coleta."
          :"A Rodonaves ainda não retornou um código de coleta consultável pela API."
      });
    }

    if(!consultaveis.length){
      await registrarExecucao({
        transportadora_nome:"Rodonaves",
        origem:req.headers.authorization?"github_actions":"painel",
        iniciado_em:iniciadoEm,
        finalizado_em:new Date().toISOString(),
        total_encontrado:total,total_consultado:0,total_alterado:0,total_erros:0,
        sucesso:true,
        detalhes:{ignoradas,mensagem:"Coletas abertas encontradas, mas ainda sem código de coleta retornado pela API."}
      });
      const vinculacao=await garantirRastreiosDasColetasRodonaves(contexto);
      const rastreios=await sincronizarRastreios(contexto,contexto.transportadoraIds);
      return json(res,200,{
        ok:rastreios.erros===0,total,consultadas:0,alteradas:0,ignoradas,
        erros:rastreios.erros,tempo_ms:Date.now()-inicio,resultados,vinculacao,rastreios
      });
    }

    const token=await gerarTokenPickup(contexto.cred);

    for(const agendamento of consultaveis){
      const anterior=agendamento.status_api||agendamento.status||"solicitado";
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
      detalhes:{tempo_ms:Date.now()-inicio,ignoradas,resultados}
    });

    const vinculacao=await garantirRastreiosDasColetasRodonaves(contexto);
    const rastreios=await sincronizarRastreios(contexto,contexto.transportadoraIds);
    return json(res,200,{
      ok:(erros+rastreios.erros)===0,total,consultadas,alteradas,ignoradas,
      erros:erros+rastreios.erros,
      tempo_ms:Date.now()-inicio,
      resultados,
      vinculacao,
      rastreios
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
