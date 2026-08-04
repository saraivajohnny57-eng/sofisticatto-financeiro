const {
  json,exigirAdmin,supabaseRest,criptografar
}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  try{
    const {convite_id,ambiente,credenciais}=req.body||{};
    if(!convite_id)return json(res,400,{ok:false,erro:"convite_id é obrigatório."});
    if(!["homologacao","producao"].includes(ambiente)){
      return json(res,400,{ok:false,erro:"Ambiente inválido."});
    }

    const seguro=criptografar(credenciais||{});
    const agora=new Date().toISOString();

    const dados=await supabaseRest("integracao_credenciais",{
      method:"POST",
      query:"?on_conflict=convite_id,ambiente",
      body:{
        convite_id,
        ambiente,
        payload_criptografado:seguro.payload,
        iv:seguro.iv,
        auth_tag:seguro.tag,
        atualizado_em:agora
      }
    });

    return json(res,200,{
      ok:true,
      atualizado_em:dados?.[0]?.atualizado_em||agora
    });
  }catch(erro){
    console.error("salvar-credenciais:",erro);
    return json(res,500,{ok:false,erro:erro.message});
  }
};
