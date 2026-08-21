function cfg(){
  const usuario=String(process.env.CORREIOS_USUARIO||'').trim();
  const codigo=String(process.env.CORREIOS_CODIGO_ACESSO||'').trim();
  const cartao=String(process.env.CORREIOS_CARTAO_POSTAGEM||'').trim();
  const contrato=String(process.env.CORREIOS_CONTRATO||'').trim();
  const dr=String(process.env.CORREIOS_DR||'').trim();
  const cepOrigem=String(process.env.CORREIOS_CEP_ORIGEM||'').replace(/\D/g,'');
  const servicos=String(process.env.CORREIOS_SERVICOS||'03220,03298').split(',').map(s=>s.trim()).filter(Boolean);
  if(!usuario||!codigo)throw new Error('Configure CORREIOS_USUARIO e CORREIOS_CODIGO_ACESSO na Vercel.');
  return {usuario,codigo,cartao,contrato,dr,cepOrigem,servicos};
}
let cache={token:null,exp:0};
async function token(){
  if(cache.token && Date.now()<cache.exp-60000)return cache.token;
  const c=cfg();
  let endpoint='https://api.correios.com.br/token/v1/autentica';
  let body;
  if(c.cartao){endpoint+='/cartaopostagem';body={numero:c.cartao};if(c.contrato)body.contrato=c.contrato;if(c.dr)body.dr=Number(c.dr);}
  else if(c.contrato){endpoint+='/contrato';body={numero:c.contrato};if(c.dr)body.dr=Number(c.dr);}
  const basic=Buffer.from(`${c.usuario}:${c.codigo}`).toString('base64');
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Basic ${basic}`,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{}}catch{d={texto:txt}}
  if(!r.ok)throw Object.assign(new Error(d.mensagem||d.message||d.erro||`Correios Token HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  const t=d.token||d.access_token;if(!t)throw new Error('Os Correios não retornaram token. Verifique usuário, código de acesso, contrato/cartão.');
  let exp=Date.now()+50*60*1000;
  const raw=d.expiraEm||d.expiracao||d.expires_at;if(raw){const x=new Date(raw).getTime();if(Number.isFinite(x))exp=x;}
  cache={token:t,exp};return t;
}
async function api(url,opts={}){const t=await token();const r=await fetch(url,{...opts,headers:{Accept:'application/json',Authorization:`Bearer ${t}`,'Content-Type':'application/json',...(opts.headers||{})}});const txt=await r.text();let d;try{d=txt?JSON.parse(txt):{}}catch{d={texto:txt}}if(!r.ok)throw Object.assign(new Error(d.mensagem||d.message||d.erro||`Correios HTTP ${r.status}`),{httpStatus:r.status,resposta:d});return d;}
function n(v){return String(v??'').replace(',','.').replace(/[^0-9.]/g,'')||'0'}
function br(v){const x=Number(String(v??'0').replace(/\./g,'').replace(',','.'));return Number.isFinite(x)?x:0}
function prazoNum(d){return Number(d?.prazoEntrega??d?.prazo??d?.nuPrazo??0)||0}
async function cotar({cepDestino,pesoKg,comprimento=20,largura=20,altura=20,servicos}){
 const c=cfg();const origem=c.cepOrigem;if(origem.length!==8)throw new Error('Configure CORREIOS_CEP_ORIGEM com 8 dígitos na Vercel.');
 const dest=String(cepDestino||'').replace(/\D/g,'');if(dest.length!==8)throw new Error('CEP de destino inválido.');
 const pesoGramas=Math.max(1,Math.round(Number(pesoKg||0)*1000));const lista=(servicos&&servicos.length?servicos:c.servicos);
 const resultados=[];
 for(const coProduto of lista){
   try{
    const qp=new URLSearchParams({cepDestino:dest,cepOrigem:origem,psObjeto:String(pesoGramas),tpObjeto:'2',comprimento:n(comprimento),largura:n(largura),altura:n(altura)});
    if(c.dr)qp.set('nuDR',c.dr);
    const preco=await api(`https://api.correios.com.br/preco/v1/nacional/${encodeURIComponent(coProduto)}?${qp}`);
    const qz=new URLSearchParams({cepOrigem:origem,cepDestino:dest});
    const prazo=await api(`https://api.correios.com.br/prazo/v1/nacional/${encodeURIComponent(coProduto)}?${qz}`);
    resultados.push({coProduto,valor:br(preco.pcFinal??preco.precoFinal??preco.valor),prazoDias:prazoNum(prazo),preco,prazo});
   }catch(e){resultados.push({coProduto,erro:e.message,resposta:e.resposta||null});}
 }
 const validos=resultados.filter(x=>!x.erro&&x.valor>0).sort((a,b)=>a.valor-b.valor);
 return {resultados,melhor:validos[0]||null};
}
async function rastrear(codigo){
 const cod=String(codigo||'').trim().toUpperCase();if(!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod))throw new Error('Código de rastreio dos Correios inválido. Exemplo: AA123456789BR.');
 return api(`https://api.correios.com.br/srorastro/v1/objetos/${encodeURIComponent(cod)}?resultado=T`);
}
module.exports={cfg,token,cotar,rastrear};
