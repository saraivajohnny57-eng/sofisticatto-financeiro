'use strict';
// Ponte offline entre os modos existentes da cotacao e a pre-visualizacao GNRE.
// Nao determina obrigacao fiscal, nao transmite e nao substitui validacao da UF.
const { guiaSimples } = require('./gnre-guia-simples-offline');
const MODOS = new Set(['automatico', 'planilha2', 'manual', 'nao']);
function centavos(valor, nome) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || Math.round(valor * 100) !== valor * 100 && Math.abs(Math.round(valor * 100) - valor * 100) > 1e-7) {
    throw new TypeError(nome + ' deve ser numero nao negativo com ate duas casas decimais');
  }
  return Math.round(valor * 100);
}
function prepararPreviaGnre(dados) {
  if (!dados || typeof dados !== 'object') throw new TypeError('Dados obrigatorios');
  const { modo, valorNf, valorFrete = 0, valorAutomatico, valorManual, motivoAlteracao, obrigacaoConfirmada = false } = dados;
  if (!MODOS.has(modo)) throw new TypeError('Modo GNRE desconhecido');
  if (modo === 'nao') return { status: 'nao_aplicavel', transmissao: false, valor: null };
  let cent;
  if (modo === 'planilha2') cent = Math.round((centavos(valorNf, 'valorNf') + centavos(valorFrete, 'valorFrete')) * 0.02);
  else if (modo === 'automatico') cent = centavos(valorAutomatico, 'valorAutomatico');
  else {
    cent = centavos(valorManual, 'valorManual');
    if (typeof motivoAlteracao !== 'string' || motivoAlteracao.trim().length < 5) throw new TypeError('Justificativa obrigatoria para valor manual');
  }
  if (cent <= 0) throw new TypeError('Valor da guia deve ser positivo');
  const valor = (cent / 100).toFixed(2);
  const previa = { status: obrigacaoConfirmada ? 'pronta_para_validacao_fiscal' : 'analise_fiscal_pendente', modo, valor, transmissao: false };
  if (modo === 'manual') previa.justificativa = motivoAlteracao.trim();
  // Exigir explicitamente os campos fiscais; nunca inferir receita ou vencimento do XML.
  if (obrigacaoConfirmada) {
    previa.xml = guiaSimples({
      ufFavorecida: dados.ufFavorecida, receita: dados.receita,
      valorPrincipal: valor, dataVencimento: dados.dataVencimento,
      contribuinte: dados.contribuinte,
      documentoOrigem: dados.documentoOrigem,
      tipoDocumentoOrigem: dados.tipoDocumentoOrigem
    });
  }
  return previa;
}
module.exports = { prepararPreviaGnre };
