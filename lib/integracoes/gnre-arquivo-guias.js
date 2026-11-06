'use strict';
// Arquivo de guias GNRE para consulta e reimpressao.
// Exclusivamente administrativo. PDF so e liberado quando armazenado e a guia esta emitida.
const { exigirAdmin, json, supabaseRest } = require('./_utils');
const TABELA = 'gnre_guias_arquivo';
const CAMPOS = 'id,chave_nfe,numero_nfe,uf_favorecida,receita,valor_principal,vencimento,ambiente,situacao,numero_guia,linha_digitavel,codigo_barras,criado_em,atualizado_em';
const ID = /^[1-9][0-9]{0,17}$/;
async function listar({chaveNfe,limite=50}={}) {
  const q = new URLSearchParams();
  q.set('select',CAMPOS);
  q.set('order','criado_em.desc');
  q.set('limit',String(Math.max(1,Math.min(100,Number(limite)||50))));
  if (chaveNfe) {
    if (!/^[0-9]{44}$/.test(chaveNfe)) throw new TypeError('Chave de NF-e invalida');
    q.set('chave_nfe','eq.'+chaveNfe);
  }
  return supabaseRest(TABELA,{query:'?'+q.toString()});
}
async function obterPdf(id) {
  if (!ID.test(String(id))) throw new TypeError('Identificador invalido');
  const rows=await supabaseRest(TABELA,{query:'?id=eq.'+id+'&select=id,situacao,numero_guia,pdf_base64&limit=1'});
  const guia=rows?.[0];
  if(!guia) return {status:404,erro:'Guia nao encontrada'};
  if(guia.situacao!=='emitida'||!guia.pdf_base64) return {status:409,erro:'PDF oficial ainda nao disponivel para impressao'};
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(guia.pdf_base64)) return {status:422,erro:'PDF armazenado invalido'};
  const pdf=Buffer.from(guia.pdf_base64,'base64');
  if(pdf.length>2250000||pdf.subarray(0,5).toString('ascii')!=='%PDF-') return {status:422,erro:'Documento armazenado nao e PDF'};
  return {status:200,pdf};
}
async function handler(req,res){
  if(!['GET'].includes(req.method)) return json(res,405,{ok:false,erro:'Metodo nao permitido'});
  if(!exigirAdmin(req,res)) return;
  try{
    const id=req.query?.id;
    if(id){
      const result=await obterPdf(id);
      if(result.status!==200)return json(res,result.status,{ok:false,erro:result.erro});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition','inline; filename="gnre-'+String(id)+'.pdf"');
      res.setHeader('Cache-Control','private, no-store');
      return res.status(200).send(result.pdf);
    }
    const guias=await listar({chaveNfe:req.query?.chave_nfe});
    return json(res,200,{ok:true,guias});
  }catch(e){
    return json(res,e instanceof TypeError?400:503,{ok:false,erro:e instanceof TypeError?e.message:'Falha ao consultar arquivo de guias GNRE'});
  }
}
module.exports=handler;
module.exports.listar=listar;
module.exports.obterPdf=obterPdf;
