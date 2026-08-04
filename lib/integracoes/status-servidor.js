const {json,exigirAdmin}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="POST"){
    return json(res,405,{ok:false,erro:"Método não permitido."});
  }

  if(!exigirAdmin(req,res))return;

  const variaveis={
    SUPABASE_URL:!!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:!!process.env.SUPABASE_SERVICE_ROLE_KEY,
    INTEGRATIONS_ADMIN_KEY:!!process.env.INTEGRATIONS_ADMIN_KEY,
    INTEGRATIONS_ENCRYPTION_KEY:!!process.env.INTEGRATIONS_ENCRYPTION_KEY
  };

  const tamanho=String(process.env.INTEGRATIONS_ENCRYPTION_KEY||"").length;
  const pronto=Object.values(variaveis).every(Boolean)&&tamanho>=32;

  return json(res,200,{
    ok:true,
    pronto,
    variaveis,
    encryption_key_length:tamanho
  });
};
