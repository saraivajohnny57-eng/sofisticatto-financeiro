const {validar}=require('./_email-auth');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({ok:false,erro:'Método inválido.'});
 try{
  const {usuario,url,key}=await validar(req);
  const {lote,indice,nome,tipo,conteudo_base64}=req.body||{};
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(String(lote||''))||!Number.isInteger(indice)||indice<0||indice>29)return res.status(400).json({ok:false,erro:'Identificação de anexo inválida.'});
  const b64=String(conteudo_base64||'');if(b64.length>3.6e6||!/^([A-Za-z0-9+/]*={0,2})$/.test(b64))return res.status(413).json({ok:false,erro:'Anexo excede o limite individual de 2,5 MB.'});
  const data=Buffer.from(b64,'base64');if(!data.length||data.length>2.5*1024*1024)return res.status(413).json({ok:false,erro:'Arquivo inválido ou muito grande.'});
  const caminho=`${usuario.id}/${lote}/${indice}`;
  const endpoint=`${url}/storage/v1/object/email-anexos-temporarios/${caminho}`;
  const r=await fetch(endpoint,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':String(tipo||'application/octet-stream').slice(0,100),'x-upsert':'false'},body:data});
  if(!r.ok)return res.status(502).json({ok:false,erro:`Storage recusou o arquivo ${String(nome||'').slice(0,80)} (${r.status}).`});
  return res.status(200).json({ok:true,caminho});
 }catch(e){return res.status(e.status||500).json({ok:false,erro:e.message||'Falha ao carregar anexo.'});}
};
