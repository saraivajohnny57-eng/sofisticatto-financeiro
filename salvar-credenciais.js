const {
  json,exigirAdmin,supabaseRest,criptografar,descriptografar
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

    // V44: campos vazios não apagam credenciais que já estavam protegidas.
    // Isso permite acrescentar, por exemplo, somente a senha de rastreio SSW.
    let anteriores={};
    try{
      const rows=await supabaseRest("integracao_credenciais",{
        query:`?select=payload_criptografado,iv,auth_tag&convite_id=eq.${encodeURIComponent(convite_id)}&ambiente=eq.${encodeURIComponent(ambiente)}&limit=1`
      });
      if(Array.isArray(rows)&&rows[0])anteriores=descriptografar(rows[0])||{};
    }catch(e){console.warn("V44: não foi possível carregar credenciais anteriores:",e.message)}

    const recebidas=credenciais||{};
    const mescladas={...anteriores};
    for(const [chave,valor] of Object.entries(recebidas)){
      if(valor===null||valor===undefined)continue;
      if(typeof valor==="string" && valor.trim()==="")continue;
      mescladas[chave]=typeof valor==="string"?valor.trim():valor;
    }

    const seguro=criptografar(mescladas);
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

    return json(res,200,{ok:true,atualizado_em:dados?.[0]?.atualizado_em||agora});
  }catch(erro){
    console.error("salvar-credenciais:",erro);
    return json(res,500,{ok:false,erro:erro.message});
  }
};
