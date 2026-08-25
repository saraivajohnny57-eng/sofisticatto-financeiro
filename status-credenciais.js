const {json,exigirAdmin,supabaseRest,descriptografar}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;
  try{
    const convite=encodeURIComponent(String(req.query.convite_id||""));
    const ambiente=encodeURIComponent(String(req.query.ambiente||"homologacao"));
    const dados=await supabaseRest("integracao_credenciais",{
      query:`?select=id,atualizado_em,payload_criptografado,iv,auth_tag&convite_id=eq.${convite}&ambiente=eq.${ambiente}&limit=1`
    });
    let campos={};
    if(Array.isArray(dados)&&dados[0]){
      try{campos=descriptografar(dados[0])||{}}catch{}
    }
    return json(res,200,{
      ok:true,
      existe:Array.isArray(dados)&&dados.length>0,
      atualizado_em:dados?.[0]?.atualizado_em||null,
      ssw_dominio:Boolean(campos.ssw_dominio),
      usuario:Boolean(campos.username),
      senha_webservice:Boolean(campos.password),
      ssw_senha_rastreio:Boolean(campos.ssw_senha_rastreio),
      ssw_cnpj_rastreio:Boolean(campos.ssw_cnpj_rastreio)
    });
  }catch(erro){return json(res,500,{ok:false,erro:erro.message});}
};
