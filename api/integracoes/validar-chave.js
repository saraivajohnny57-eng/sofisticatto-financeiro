const {json,exigirAdmin}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;
  return json(res,200,{ok:true});
};
