'use strict';
// Persistencia somente apos confirmacao oficial da guia. Nao aceita estimativas ou recibo de lote.
const {supabaseRest}=require('./_utils');
const CHAVE=/^[0-9]{44}$/;
const COD=/^[0-9]{6}$/;
const DATA=/^\d{4}-\d{2}-\d{2}$/;
function validarGuiaOficial(g){
  if(!g||typeof g!=='object'||!CHAVE.test(String(g.chave_nfe||''))) throw new TypeError('Chave NF-e obrigatoria');
  if(!/^[0-9]{1,18}$/.test(String(g.numero_nfe||''))) throw new TypeError('Numero NF-e invalido');
  if(!/^[A-Z]{2}$/.test(String(g.uf_favorecida||''))||!COD.test(String(g.receita||''))) throw new TypeError('UF ou receita invalida');
  if(!/^\d{1,12}\.\d{2}$/.test(String(g.valor_principal||''))) throw new TypeError('Valor GNRE invalido');
  if(!DATA.test(String(g.vencimento||''))||!Number.isFinite(Date.parse(g.vencimento+'T00:00:00Z'))) throw new TypeError('Vencimento invalido');
  if(!['homologacao','producao'].includes(g.ambiente)) throw new TypeError('Ambiente invalido');
  if(!/^[A-Za-z0-9./-]{1,100}$/.test(String(g.numero_guia||''))) throw new TypeError('Numero oficial da guia obrigatorio');
  if(!/^[a-zA-Z0-9:+-]{8,120}$/.test(String(g.chave_idempotencia||''))) throw new TypeError('Idempotencia obrigatoria');
  if(typeof g.pdf_base64!=='string'||g.pdf_base64.length>3000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(g.pdf_base64)) throw new TypeError('PDF oficial obrigatorio');
  const pdf=Buffer.from(g.pdf_base64,'base64');
  if(pdf.length<20||pdf.length>2250000||pdf.subarray(0,5).toString('ascii')!=='%PDF-') throw new TypeError('Arquivo nao e PDF');
  return {chave_nfe:g.chave_nfe,numero_nfe:String(g.numero_nfe),uf_favorecida:g.uf_favorecida,
    receita:g.receita,valor_principal:g.valor_principal,vencimento:g.vencimento,ambiente:g.ambiente,
    situacao:'emitida',numero_guia:g.numero_guia,chave_idempotencia:g.chave_idempotencia,
    linha_digitavel:g.linha_digitavel||null,codigo_barras:g.codigo_barras||null,
    pdf_base64:g.pdf_base64,resposta_resumo:{origem:'retorno_oficial_validado'},
    atualizado_em:new Date().toISOString()};
}
async function arquivarGuiaOficial(guia){
  const row=validarGuiaOficial(guia);
  const result=await supabaseRest('gnre_guias_arquivo',{method:'POST',
    query:'?on_conflict=chave_idempotencia&select=id,numero_guia,situacao',
    body:row});
  return result?.[0]||null;
}
module.exports={validarGuiaOficial,arquivarGuiaOficial};
