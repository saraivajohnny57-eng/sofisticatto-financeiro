const {validar}=require('./_email-auth');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({ok:false});
 try{const {usuario,url,key}=await validar(req);const caminhos=Array.isArray(req.body?.caminhos)?req.body.caminhos:[];
 if(caminhos.length>30||caminhos.some(p=>!new RegExp('^'+String(usuario.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/[a-zA-Z0-9_-]{8,100}/[0-9]{1,2}$').test(String(p))))return res.status(403).json({ok:false});
 const r=await fetch(`${url}/storage/v1/object/email-anexos-temporarios`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:caminhos})});
 return res.status(r.ok?200:502).json({ok:r.ok});
 }catch(e){return res.status(e.status||500).json({ok:false,erro:e.message});}
};
