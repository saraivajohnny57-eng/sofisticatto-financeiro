const {json,exigirAdmin,supabaseRest}=require('./_utils');
const CAMPOS=new Set(['sentido','parceiro_nome','transportadora_id','numero_nfe','chave_nfe','numero_cte','protocolo_rastreio','data_postagem','previsao_entrega','volumes','status','observacao','coleta_agendamento_id','origem','status_api','ultima_ocorrencia','ultima_ocorrencia_em','consulta_api','consultado_api_em','metodo_consulta','sincronizacao_erro','finalizado_em','atualizado_em','atualizado_por']);
module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const id=String(req.body?.id||'').trim();
    if(!id)return json(res,400,{ok:false,erro:'id é obrigatório.'});
    const src=req.body?.patch||{};const patch={};
    for(const [k,v] of Object.entries(src))if(CAMPOS.has(k))patch[k]=v;
    patch.atualizado_em=new Date().toISOString();
    const rows=await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}&select=id,protocolo_rastreio,chave_nfe,numero_nfe,numero_cte`,body:patch});
    if(!Array.isArray(rows)||!rows[0])return json(res,404,{ok:false,erro:'Rastreio não encontrado para atualização.'});
    return json(res,200,{ok:true,rastreio:rows[0]});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
