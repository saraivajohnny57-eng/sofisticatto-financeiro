const {json,exigirAdmin}=require('./_utils');
const {configuracaoEfetiva,descobrirContrato}=require('./_correios');
module.exports=async(req,res)=>{
  if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const forcar=String(req.query?.forcar||'')==='1';
    if(forcar)await descobrirContrato({forcar:true});
    const c=await configuracaoEfetiva();
    return json(res,200,{ok:true,dr:c.dr||null,servicos:c.servicos,servicosDetalhes:c.servicosDetalhes,fonte:c.descoberta?'API Meu Contrato':'Variáveis Vercel',aviso:c.aviso||null});
  }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
