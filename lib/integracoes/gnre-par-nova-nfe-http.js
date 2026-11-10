'use strict';
// Prévia de duas GNREs de uma NF-e nova. NÃO envia ao Fisco.
const { json, exigirAdmin } = require('./_utils');
const { planejarPar } = require('./gnre-par-nova-nfe');
module.exports = async function handler(req,res) {
  if (req.method !== 'POST') return json(res,405,{ok:false,erro:'Método não permitido.'});
  if (!exigirAdmin(req,res)) return;
  if (String(process.env.GNRE_AMBIENTE||'').toLowerCase() !== 'homologacao')
    return json(res,400,{ok:false,erro:'Disponível somente em homologação.'});
  try {
    const {resumo} = planejarPar(req.body||{});
    return json(res,200,{ok:true,...resumo,
      observacao:'Duas GNREs distintas preparadas, não transmitidas. Receitas, campos exigidos pela UF, XML e emissão pagável ainda dependem de validação oficial.'});
  } catch(e) { return json(res,400,{ok:false,erro:String(e.message||e).slice(0,240)}); }
};
