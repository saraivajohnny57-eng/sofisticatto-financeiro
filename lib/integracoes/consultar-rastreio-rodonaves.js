
const {json,exigirAdmin,supabaseRest}=require("./_utils");
const {
  obterContextoTrackingRodonaves,gerarTokenTracking,consultarTracking
}=require("./_rodonaves-tracking");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  const registroId=String(req.query.registro_id||"");
  const protocolo=String(req.query.protocolo||"");
  const numeroCte=String(req.query.cte||"");
  const numeroNfe=String(req.query.nfe||"");
  const chaveNfe=String(req.query.chave_nfe||"");

  try{
    const contexto=await obterContextoTrackingRodonaves();
    const token=await gerarTokenTracking(contexto.cred);
    const consulta=await consultarTracking(token,{protocolo,numeroCte,numeroNfe,chaveNfe});
    const agora=new Date().toISOString();

    if(registroId){
      const patch={
        status:consulta.status,
        status_api:consulta.statusBruto,
        numero_cte:consulta.numeroCte||numeroCte||null,
        previsao_entrega:consulta.previsaoEntrega||null,
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
        atualizado_por:"api_rodonaves"
      };
      if(consulta.status==="entregue")patch.finalizado_em=agora;

      await supabaseRest("logistica_rastreamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(registroId)}`,
        body:patch
      });
    }

    return json(res,200,{
      ok:true,
      ...consulta,
      mensagem:`Localizado por ${consulta.metodoConsulta}.`
    });
  }catch(erro){
    // Não apresentar 404 como mercadoria inexistente quando já há entrega confirmada.
    if(registroId&&[204,404].includes(Number(erro.httpStatus))){
      try{
        const registros=await supabaseRest('logistica_rastreamentos',{query:`?select=id,status,ultima_ocorrencia,ultima_ocorrencia_em,status_api&id=eq.${encodeURIComponent(registroId)}&limit=1`});
        const atual=registros?.[0];
        const descricao=String([atual?.ultima_ocorrencia,atual?.status_api].filter(Boolean).join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        if(atual&&/(entrega finalizada|entrega realizada|mercadoria entregue|entregue ao destinatario|recebido pelo destinatario|mercadoria retirada recebedor [a-z]{2,})/.test(descricao)&&!/(nao entregue|entrega nao realizada|tentativa de entrega|entrega nao finalizada)/.test(descricao)){
          const agora=new Date().toISOString();
          await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:{status:'entregue',sincronizacao_erro:null,finalizado_em:atual.ultima_ocorrencia_em||agora,atualizado_em:agora,atualizado_por:'rodonaves_entrega_confirmada_v457'}});
          return json(res,200,{ok:true,status:'entregue',statusBruto:atual.ultima_ocorrencia,ultimaOcorrencia:atual.ultima_ocorrencia,ultimaOcorrenciaEm:atual.ultima_ocorrencia_em,metodoConsulta:'ocorrencia_confirmada',aviso:'API Rodonaves não localizou o documento; entrega confirmada pela ocorrência anteriormente registrada.'});
        }
      }catch(reconciliacaoErro){console.warn('Falha ao reconciliar entrega Rodonaves:',reconciliacaoErro.message);}
    }
    const status=erro.httpStatus===204?404:(erro.httpStatus||502);
    return json(res,status,{
      ok:false,
      erro:erro.message,
      tentativas:erro.tentativas||[]
    });
  }
};
