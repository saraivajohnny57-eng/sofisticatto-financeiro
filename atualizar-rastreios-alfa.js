const {json}=require('./_utils');
module.exports=async function(req,res){return json(res,410,{ok:false,desativada:true,erro:'Integração API da Alfa desativada: acesso cancelado pela transportadora. Use cotação/rastreio manual quando necessário.'});};
