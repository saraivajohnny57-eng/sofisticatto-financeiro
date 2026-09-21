const {json,exigirAdmin}=require('./_utils');
const {BASE,soDigitos,credenciais,headers,ler}=require('./_braspress');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'}); if(!exigirAdmin(req,res))return;
 try{const {convite_id,ambiente='homologacao',notaFiscal}=req.body||{}; const c=await credenciais(convite_id,ambiente); const cnpj=soDigitos(c.braspress_cnpj); const nf=soDigitos(notaFiscal); if(!cnpj)throw new Error('Cadastre o CNPJ Braspress.'); if(!nf)throw new Error('Informe a nota fiscal.');
  const r=await fetch(`${BASE}/v3/tracking/byNf/${encodeURIComponent(cnpj)}/${encodeURIComponent(nf)}/json`,{method:'GET',headers:headers(c)}); const d=await ler(r); if(!r.ok)return json(res,502,{ok:false,erro:`Braspress retornou HTTP ${r.status}: ${d?.message||d?.raw||'falha no rastreamento'}`,detalhes:d}); return json(res,200,{ok:true,http_status:r.status,resultado:d});
 }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
