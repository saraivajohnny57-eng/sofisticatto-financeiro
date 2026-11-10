'use strict';
// Planeja GNREs DISTINTAS de DIFAL/FCP para uma NF-e NOVA.
// Somente valores declarados/validados; não transmite nem declara guia pagável.
const { guiaSimples } = require('./gnre-guia-simples-offline');
const { montarPlanoRecepcao } = require('./gnre-recepcao-executor');
const { cnpjValido } = require('./gnre-documento-fiscal');
const RECEITAS = Object.freeze({ DIFAL:'100102', FCP:'100129' });
function centavos(v, campo) {
  if (typeof v !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(v)) throw new TypeError(campo + ' deve ser valor decimal com duas casas.');
  const [reais, dec] = v.split('.');
  const n = BigInt(reais)*100n+BigInt(dec);
  if (n > 99999999999n) throw new RangeError(campo+' excede o limite');
  return n;
}
function moeda(v) { return (v/100n).toString()+'.'+(v%100n).toString().padStart(2,'0'); }
function planejarPar({ chaveNfe, ufFavorecida, cnpjEmitente, razaoSocial, vencimento, difal, fcp, receitasConfirmadas, novaOperacao }={}) {
  if (novaOperacao !== true) throw new TypeError('Apenas novas operações expressamente confirmadas são aceitas.');
  if (!/^\d{44}$/.test(String(chaveNfe||''))) throw new TypeError('Chave NF-e de 44 dígitos obrigatória.');
  if (!cnpjValido(cnpjEmitente)) throw new TypeError('CNPJ do emitente inválido.');
  if (!receitasConfirmadas || receitasConfirmadas.difal !== true || receitasConfirmadas.fcp !== true)
    throw new TypeError('Confirmar incidência e receitas DIFAL/FCP com a configuração da UF antes de preparar o par.');
  const d = centavos(difal,'difal'), f = centavos(fcp,'fcp');
  if (d === 0n || f === 0n) throw new TypeError('Emissão de duas guias exige DIFAL e FCP positivos; se não incidir, preparar apenas a guia devida.');
  const campos = { ufFavorecida, dataVencimento:vencimento, contribuinte:{cnpj:cnpjEmitente,razaoSocial}, documentoOrigem:chaveNfe, tipoDocumentoOrigem:'22' };
  const guias = [
    guiaSimples({...campos,receita:RECEITAS.DIFAL,valorPrincipal:moeda(d)}),
    guiaSimples({...campos,receita:RECEITAS.FCP,valorPrincipal:moeda(f)})
  ];
  const lote = montarPlanoRecepcao(guias);
  return { guias, resumo:{
    chave_nfe:chaveNfe,uf:ufFavorecida, itens:[
      {tributo:'DIFAL',receita:RECEITAS.DIFAL,valor:moeda(d)},
      {tributo:'FCP',receita:RECEITAS.FCP,valor:moeda(f)}
    ], total_cotacao:moeda(d+f),quantidade_guias:2,ambiente:'homologacao',
    transmissao:'nao_realizada',pagaveis:false,
    lote_sha256:lote.lote_sha256,idempotency_key:lote.idempotency_key
  }};
}
module.exports={planejarPar};
