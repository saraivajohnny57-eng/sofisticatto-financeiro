const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:faturamento@sofisticatto.com.br",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req,res){
  if(req.method!=="POST"){
    return res.status(405).json({error:"Método não permitido"});
  }

  try{
    const {perfil="banco",tipo,titulo,mensagem,boleto_id}=req.body || {};

    const supabase=createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const {data:inscricoes,error}=await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("perfil",perfil)
      .eq("ativo",true);

    if(error) throw error;

    const payload=JSON.stringify({
      tipo,
      titulo:titulo || "Sofisticatto Financeiro",
      mensagem:mensagem || "Existe uma nova atualização.",
      boleto_id,
      url:"/"
    });

    let enviados=0;
    let removidos=0;

    for(const item of inscricoes || []){
      try{
        await webpush.sendNotification({
          endpoint:item.endpoint,
          keys:{p256dh:item.p256dh,auth:item.auth}
        },payload);
        enviados++;
      }catch(erroEnvio){
        if(erroEnvio.statusCode===404 || erroEnvio.statusCode===410){
          await supabase
            .from("push_subscriptions")
            .update({ativo:false})
            .eq("id",item.id);
          removidos++;
        }else{
          console.error("Erro ao enviar push:",erroEnvio);
        }
      }
    }

    return res.status(200).json({ok:true,enviados,removidos});
  }catch(erro){
    console.error("Erro em enviar-push:",erro);
    return res.status(500).json({error:erro.message || "Erro ao enviar push"});
  }
};
