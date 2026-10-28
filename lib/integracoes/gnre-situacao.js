'use strict';
// Interpretacao de codigos de situacao do processamento do lote GNRE.
// Nao infere pagamento, quitacao ou autorizacao de cada guia.
const STATUS=Object.freeze({
 '400':{fase:'aguardando',finalizado:false},
 '401':{fase:'processando',finalizado:false},
 '402':{fase:'processado',finalizado:true},
 '403':{fase:'pendencia',finalizado:false},
 '404':{fase:'erro_processamento',finalizado:true}
});
function interpretarSituacaoProcessamento(codigo){
 if(typeof codigo!=='string'&&!Number.isInteger(codigo))throw new TypeError('Codigo GNRE invalido');
 const chave=String(codigo).trim();
 if(!/^\d{3}$/.test(chave))throw new TypeError('Codigo GNRE invalido');
 const status=STATUS[chave];
 return status?{codigo:chave,...status,guiaAutorizada:null,guiaPaga:null}:{codigo:chave,fase:'nao_mapeado',finalizado:false,guiaAutorizada:null,guiaPaga:null};
}
module.exports={interpretarSituacaoProcessamento};
