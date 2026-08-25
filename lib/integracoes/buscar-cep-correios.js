const {json,exigirAdmin}=require('./_utils');
const {buscarCepPorEndereco}=require('./_correios');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const b=req.body||{};
    const r=await buscarCepPorEndereco({
      uf:b.uf,localidade:b.cidade||b.localidade,bairro:b.bairro,
      logradouro:b.logradouro,endereco:b.endereco||[b.logradouro,b.numero].filter(Boolean).join(', ')
    });
    return json(res,200,{ok:true,...r});
  }catch(e){return json(res,400,{ok:false,erro:e.message||String(e)});}
};
