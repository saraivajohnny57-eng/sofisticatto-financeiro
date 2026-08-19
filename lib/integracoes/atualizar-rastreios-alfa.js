const {json,exigirAdminOuCron,supabaseRest}=require("./_utils");
const {consultarAlfa}=require("./_alfa-tracking");

function nomeAlfa(v){return /(^|\s)alfa(\s|$)|alfa transportes/i.test(String(v||""));}

async function notificarMudanca(x,antes,agora){
  if(antes===agora)return;
  try{
    await supabaseRest("notificacoes_sistema",{method:"POST",body:{
      destinatario_tipo:"financeiro",
      tipo_evento:"status_rastreio_alterado",
      titulo:`Rastreamento NF ${x.numero_nfe||""}: ${agora.replace(/_/g," ")}`,
      mensagem:`${x.parceiro_nome||"Cliente"}: ${antes.replace(/_/g," ")} → ${agora.replace(/_/g," ")}`,
      cliente_nome:x.parceiro_nome||null,
      criado_por:"sincronizacao_alfa"
    }});
  }catch{}
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method))return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdminOuCron(req,res))return;
  try{
    const trans=await supabaseRest("frete_transportadoras",{query:"?select=id,nome&ativa=eq.true"});
    const ids=(trans||[]).filter(x=>nomeAlfa(x.nome)).map(x=>x.id);
    if(!ids.length)return json(res,200,{ok:true,total:0,consultados:0,alterados:0,erros:0,mensagem:"Alfa não cadastrada em frete_transportadoras."});

    const lista=await supabaseRest("logistica_rastreamentos",{query:`?select=*&sentido=eq.saida&transportadora_id=in.(${ids.join(",")})&status=not.in.(entregue,recebido,cancelado)&numero_nfe=not.is.null&order=created_at.asc&limit=150`});
    let consultados=0,alterados=0,erros=0;const itens=[];

    for(const x of (lista||[])){
      try{
        const antes=x.status||"aguardando_coleta";
        const c=await consultarAlfa({numeroNfe:x.numero_nfe,cnpj:x.cnpj_remetente||"05451985000195"});
        const agora=new Date().toISOString();
        const patch={
          status:c.status,
          status_api:c.statusBruto,
          numero_cte:c.numeroCte||x.numero_cte||null,
          previsao_entrega:c.previsaoEntrega||x.previsao_entrega||null,
          ultima_ocorrencia:c.ultimaOcorrencia||null,
          ultima_ocorrencia_em:c.ultimaOcorrenciaEm||null,
          consulta_api:{
            retorno:c.dados,
            metodo_consulta:c.metodoConsulta,
            valor_consultado:c.valorConsultado,
            comprovante_url:c.comprovanteUrl,
            recebedor:c.recebedor,
            data_entrega:c.dataEntrega,
            ocorrencias:c.ocorrencias||[]
          },
          metodo_consulta:c.metodoConsulta,
          consultado_api_em:agora,
          sincronizacao_erro:null,
          atualizado_em:agora,
          atualizado_por:"sincronizacao_alfa"
        };
        if(c.status==="entregue")patch.finalizado_em=c.dataEntrega||agora;

        await supabaseRest("logistica_rastreamentos",{method:"PATCH",query:`?id=eq.${encodeURIComponent(x.id)}`,body:patch});
        consultados++;if(antes!==c.status)alterados++;
        await notificarMudanca(x,antes,c.status);

        if(x.coleta_agendamento_id&&["em_transito","na_filial","saiu_entrega","entregue"].includes(c.status)){
          await supabaseRest("coleta_agendamentos",{method:"PATCH",query:`?id=eq.${encodeURIComponent(x.coleta_agendamento_id)}`,body:{status:"coletado",status_api:"coletado",coletado_em:x.data_postagem||agora,sincronizado_em:agora,sincronizacao_erro:null,atualizado_em:agora}}).catch(()=>{});
        }
        itens.push({id:x.id,nf:x.numero_nfe,anterior:antes,atual:c.status,ultima_ocorrencia:c.ultimaOcorrencia,ocorrencias:c.ocorrencias||[]});
      }catch(e){
        erros++;
        await supabaseRest("logistica_rastreamentos",{method:"PATCH",query:`?id=eq.${encodeURIComponent(x.id)}`,body:{consultado_api_em:new Date().toISOString(),sincronizacao_erro:String(e.message||e).slice(0,1000),atualizado_em:new Date().toISOString()}}).catch(()=>{});
        itens.push({id:x.id,nf:x.numero_nfe,erro:e.message});
      }
      await new Promise(r=>setTimeout(r,150));
    }
    return json(res,200,{ok:erros===0,total:(lista||[]).length,consultados,alterados,erros,itens});
  }catch(e){return json(res,502,{ok:false,erro:e.message});}
};
