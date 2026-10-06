// V329 — operações protegidas por autorização de dispositivo já usada nas integrações.
// A service-role nunca é enviada ao navegador. Não usa acesso anônimo de escrita.
const {credencialAdmin}=require('../lib/integracoes/_utils');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!credencialAdmin(req))return res.status(401).json({ok:false,erro:'Autorize este computador com a senha mestre para usar etiquetas.'});
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!url||!key)return res.status(503).json({ok:false,erro:'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.'});
 const body=req.body||{},acao=String(req.query?.acao||body.acao||'');
 const codigo=String(body.codigo||req.query?.codigo||'').trim();
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'};
 const base=url+'/rest/v1/etiquetas_terceirizados';
 try{
  let target=base,method='GET',payload;
  if(acao==='buscar'){
   if(!codigo)return res.status(400).json({ok:false,erro:'Código obrigatório.'});
   target+='?codigo=eq.'+encodeURIComponent(codigo)+'&select=*&limit=1';
  }else if(acao==='listar'){
   target+='?select=codigo,descricao,grupo&order=descricao.asc&limit=200';
  }else if(acao==='salvar'){
   if(req.method!=='POST')return res.status(405).json({ok:false,erro:'Método inválido.'});
   const x=body.item||{};
   if(!/^[\w.\/-]{1,60}$/.test(String(x.codigo||''))||!String(x.descricao||'').trim()||String(x.descricao).length>300)return res.status(400).json({ok:false,erro:'Código ou descrição inválidos.'});
   const permitido=['codigo','descricao','grupo','marca','codigo_barras','largura_mm','altura_mm','texto','imagem_url','modelo','atualizado_em'];
   const item=Object.fromEntries(permitido.filter(k=>Object.hasOwn(x,k)).map(k=>[k,x[k]]));
   if(!['inteira','dupla'].includes(item.modelo))return res.status(400).json({ok:false,erro:'Modelo inválido.'});
   if(Number(item.largura_mm)!==150||Number(item.altura_mm)!==100)return res.status(400).json({ok:false,erro:'Use o formato 150 × 100 mm.'});
   const original=String(body.original||'').trim();
   if(original){target+='?codigo=eq.'+encodeURIComponent(original);method='PATCH';}
   else{method='POST';}
   payload=JSON.stringify(item);
  }else return res.status(400).json({ok:false,erro:'Operação desconhecida.'});
  const r=await fetch(target,{method,headers,body:payload});
  const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,200)}}
  if(!r.ok)return res.status(r.status).json({ok:false,erro:data?.message||'Falha no Supabase.'});
  return res.status(200).json({ok:true,data:acao==='buscar'?(data?.[0]||null):acao==='salvar'?(data?.[0]||null):data});
 }catch(e){return res.status(500).json({ok:false,erro:'Falha ao consultar cadastro de etiquetas.'});}
};
