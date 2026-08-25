const {json,exigirAdmin,supabaseRest}=require("./_utils");
const {consultarAlfa}=require("./_alfa-tracking");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;
  const registroId=String(req.query.registro_id||"");
  const numeroNfe=String(req.query.nfe||"");
  const cnpj=String(req.query.cnpj||"05451985000195");
  try{
    const c=await consultarAlfa({numeroNfe,cnpj});
    const agora=new Date().toISOString();
    if(registroId){
      const patch={status:c.status,status_api:c.statusBruto,numero_cte:c.numeroCte||null,
        previsao_entrega:c.previsaoEntrega||null,ultima_ocorrencia:c.ultimaOcorrencia||null,
        ultima_ocorrencia_em:c.ultimaOcorrenciaEm||null,
        consulta_api:{retorno:c.dados,metodo_consulta:c.metodoConsulta,valor_consultado:c.valorConsultado,
          comprovante_url:c.comprovanteUrl,recebedor:c.recebedor,data_entrega:c.dataEntrega},
        metodo_consulta:c.metodoConsulta,consultado_api_em:agora,sincronizacao_erro:null,
        atualizado_em:agora,atualizado_por:"api_alfa"};
      if(c.status==="entregue")patch.finalizado_em=c.dataEntrega||agora;
      await supabaseRest("logistica_rastreamentos",{method:"PATCH",query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});
    }
    return json(res,200,{ok:true,...c,mensagem:"Rastreamento Alfa atualizado pela NF."});
  }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
