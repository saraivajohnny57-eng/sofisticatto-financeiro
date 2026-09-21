const {json,exigirAdmin}=require('./_utils');
const {BASE,credenciais,headers,ler}=require('./_braspress');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'}); if(!exigirAdmin(req,res))return;
 try{const {convite_id,ambiente='homologacao'}=req.body||{}; const c=await credenciais(convite_id,ambiente); const ini=Date.now();
  // A Braspress não documenta endpoint exclusivo de login. Fazemos uma requisição de cotação deliberadamente incompleta:
  // qualquer resposta diferente de 401/403 confirma que o Basic Auth foi aceito, sem criar cotação válida.
  const r=await fetch(`${BASE}/v1/cotacao/calcular/json`,{method:'POST',headers:headers(c),body:'{}'}); const d=await ler(r); const ms=Date.now()-ini;
  if(r.status===401||r.status===403)return json(res,502,{ok:false,erro:`Braspress recusou as credenciais (HTTP ${r.status}).`});
  return json(res,200,{ok:true,http_status:r.status,tempo_ms:ms,autenticacao_aceita:true,validacao_sem_cotacao:true,resposta_status:d?.statusCode||null});
 }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
