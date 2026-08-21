const {json,exigirAdmin}=require('./_utils');
const {token,cfg,configuracaoEfetiva}=require('./_correios');
module.exports=async(req,res)=>{
  if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    await token();
    const c=cfg();
    const e=await configuracaoEfetiva();
    return json(res,200,{
      ok:true,
      mensagem:'Autenticação Correios OK',
      cep_origem_configurado:c.cepOrigem.length===8,
      cartao_configurado:!!c.cartao,
      contrato_configurado:!!c.contrato,
      cnpj_configurado:c.cnpj.length===14,
      dr:e.dr||null,
      dr_fonte:e.descoberta?.dr?'API Meu Contrato':(c.dr?'Vercel':null),
      servicos:e.servicos,
      servicos_detalhes:e.servicosDetalhes,
      servicos_fonte:e.descoberta?.servicos?.length?'API Meu Contrato':(c.servicos.length?'Vercel':null),
      aviso:e.aviso||null
    });
  }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
