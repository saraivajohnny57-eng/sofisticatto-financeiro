const {json,credencialAdmin,senhaMestreValida,criarTokenDispositivo}=require("./_utils");
module.exports=async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
 const recebido=String(req.headers["x-integrations-admin-key"]||"").trim();
 const atual=credencialAdmin(req);
 if(atual?.tipo==='dispositivo')return json(res,200,{ok:true,tipo:'dispositivo',device_id:atual.did,expira_em:new Date(atual.exp).toISOString()});
 if(atual?.tipo==='legado'||senhaMestreValida(recebido)){
   const nome=String(req.body?.device_name||req.headers['x-device-name']||'Dispositivo Sofisticatto').slice(0,80);
   const {token,payload}=criarTokenDispositivo({nome,dias:90});
   return json(res,200,{ok:true,tipo:atual?.tipo==='legado'?'migrado':'senha_mestre',device_token:token,device_id:payload.did,expira_em:new Date(payload.exp).toISOString()});
 }
 return json(res,401,{ok:false,erro:"Senha mestre ou autorização inválida."});
};
