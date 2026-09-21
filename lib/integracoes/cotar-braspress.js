const {json,exigirAdmin}=require('./_utils');
const {BASE,soDigitos,credenciais,headers,ler}=require('./_braspress');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'}); if(!exigirAdmin(req,res))return;
 try{const {convite_id,ambiente='homologacao',cnpjDestinatario,cepDestino,vlrMercadoria,peso,volumes,modal='R',tipoFrete='1'}=req.body||{}; const c=await credenciais(convite_id,ambiente);
  const cnpjRemetente=soDigitos(c.braspress_cnpj),cepOrigem=soDigitos(c.braspress_cep_origem); if(!cnpjRemetente||!cepOrigem)throw new Error('Cadastre o CNPJ e o CEP de origem Braspress nas credenciais protegidas.');
  if(!soDigitos(cnpjDestinatario)||!soDigitos(cepDestino))throw new Error('Informe CNPJ/CPF e CEP do destinatário.');
  const qtd=Math.max(1,Number(volumes)||1); const body={cnpjRemetente,cnpjDestinatario:soDigitos(cnpjDestinatario),modal:String(modal),tipoFrete:String(tipoFrete),cepOrigem,cepDestino:soDigitos(cepDestino),vlrMercadoria:Number(vlrMercadoria),peso:Number(peso),volumes:qtd,cubagem:[{altura:0.1,largura:0.1,comprimento:0.1,volumes:qtd}]};
  const r=await fetch(`${BASE}/v1/cotacao/calcular/json`,{method:'POST',headers:headers(c),body:JSON.stringify(body)}); const d=await ler(r); if(!r.ok)return json(res,502,{ok:false,erro:`Braspress retornou HTTP ${r.status}: ${d?.message||d?.raw||'falha na cotação'}`,detalhes:d});
  return json(res,200,{ok:true,cotacao:{id:d.id,prazo:d.prazo,totalFrete:d.totalFrete},http_status:r.status});
 }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
