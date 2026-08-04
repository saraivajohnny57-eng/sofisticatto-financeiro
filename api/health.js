module.exports = async function handler(req,res){
  res.status(200).json({
    ok:true,
    servico:"sofisticatto-financeiro",
    modulo:"integracoes-logisticas",
    versao:"22",
    data:new Date().toISOString()
  });
};
