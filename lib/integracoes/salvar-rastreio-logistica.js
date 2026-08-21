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
    const antes=await supabaseRest('logistica_rastreamentos',{query:`?select=id,coleta_agendamento_id&id=eq.${encodeURIComponent(id)}&limit=1`});
    const rows=await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}&select=id,protocolo_rastreio,chave_nfe,numero_nfe,numero_cte,coleta_agendamento_id`,body:patch});
    if(!Array.isArray(rows)||!rows[0])return json(res,404,{ok:false,erro:'Rastreio não encontrado para atualização.'});
    const coletaId=rows[0].coleta_agendamento_id||antes?.[0]?.coleta_agendamento_id||null;
    if(coletaId){
      const cols=await supabaseRest('coleta_agendamentos',{query:`?select=id,dados&id=eq.${encodeURIComponent(coletaId)}&limit=1`}).catch(()=>[]);
      const dados={...(cols?.[0]?.dados||{})};
      if(Object.prototype.hasOwnProperty.call(patch,'numero_nfe')){dados.numero_nf=patch.numero_nfe;dados.numero_nfe=patch.numero_nfe;}
      if(Object.prototype.hasOwnProperty.call(patch,'chave_nfe'))dados.chave_nfe=patch.chave_nfe;
      if(Object.prototype.hasOwnProperty.call(patch,'numero_cte'))dados.numero_cte=patch.numero_cte;
      if(Object.prototype.hasOwnProperty.call(patch,'protocolo_rastreio'))dados.protocolo_rastreio=patch.protocolo_rastreio;
      const cp={dados,atualizado_em:new Date().toISOString()};
      if(Object.prototype.hasOwnProperty.call(patch,'numero_nfe'))cp.numero_nf=patch.numero_nfe;
      if(Object.prototype.hasOwnProperty.call(patch,'chave_nfe'))cp.chave_nfe=patch.chave_nfe;
      if(Object.prototype.hasOwnProperty.call(patch,'numero_cte'))cp.numero_cte=patch.numero_cte;
      if(Object.prototype.hasOwnProperty.call(patch,'protocolo_rastreio'))cp.protocolo_rastreio=patch.protocolo_rastreio;
      await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(coletaId)}`,body:cp}).catch(()=>null);
    }
    return json(res,200,{ok:true,rastreio:rows[0],coleta_sincronizada:Boolean(coletaId)});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
