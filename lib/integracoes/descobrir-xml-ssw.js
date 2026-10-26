/** V436 — Consulta exploratória SSW por chave NF-e. Somente leitura, sem criar rastreios. */
const {json,exigirAdmin}=require('./_utils');
const LIMITE=3;
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function objects(root){const out=[],seen=new Set();function walk(x,d){if(!x||typeof x!=='object'||d>8||seen.has(x))return;seen.add(x);if(Array.isArray(x)){x.forEach(v=>walk(v,d+1));return;}out.push(x);Object.values(x).forEach(v=>walk(v,d+1));}walk(root,0);return out;}
function get(o,keys){for(const k of keys)if(typeof o?.[k]==='string'&&o[k].trim())return o[k].trim();return '';}
function eventos(d){return objects(d).filter(o=>get(o,['ocorrencia','descricao_ocorrencia','codigo_ocorrencia'])&&(get(o,['data_hora','data_hora_efetiva','data','cidade','filial'])||o.codigo_ocorrencia)).map(o=>({titulo:get(o,['ocorrencia','descricao_ocorrencia','descricao']),descricao:get(o,['descricao','complemento']),data:get(o,['data_hora_efetiva','data_hora','data']),local:get(o,['cidade','filial'])})).slice(0,150);}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const entradas=Array.isArray(req.body?.notas)?req.body.notas:[];
 if(!entradas.length||entradas.length>LIMITE)return json(res,400,{ok:false,erro:`Envie de 1 a ${LIMITE} chaves por consulta.`});
 const saida=[];
 for(const n of entradas){
  const chave=String(n?.chave||'').replace(/\D/g,'');
  if(chave.length!==44){saida.push({chave,localizado:false,motivo:'Chave inválida'});continue;}
  try{
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),11000);
   let response;
   try{response=await fetch('https://ssw.inf.br/api/trackingdanfe',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({chave_nfe:chave}),signal:controller.signal});}finally{clearTimeout(timeout);}
   const raw=await response.text();let d;try{d=JSON.parse(raw)}catch{d={}};
   const erroTexto=[d.mensagem,d.message,d.erro_msg,d.texto].filter(x=>typeof x==='string').join(' ');
   const ev=eventos(d);
   const chavesRetorno=objects(d).flatMap(o=>[o.chave_nfe,o.chaveNfe,o.chave_acesso,o.chaveAcesso,o.chave].filter(x=>typeof x==='string'&&/^\d{44}$/.test(x)));
   if(chavesRetorno.length&&!chavesRetorno.includes(chave)){saida.push({chave,localizado:false,motivo:'A chave retornada pelo SSW é diferente da consultada'});continue;}
   if(!response.ok||Number(d.erro)<0||/nao localiz|não localiz|senha|nao autorizado|não autorizado|invalido|inválido|erro de acesso/i.test(erroTexto)||!ev.length){saida.push({chave,localizado:false,motivo:response.ok?'SSW não confirmou ocorrências para esta chave':`SSW HTTP ${response.status}`});continue;}
   const registros=objects(d);
   const nomes=registros.map(o=>get(o,['transportadora','nome_transportadora','transportador','razao_social_transportadora','transportadora_nome','nomeTransportadora','transportadoraNome','empresa_transportadora','razao_social'])).filter(Boolean);
   // Nome é apenas uma indicação: o navegador ainda deve casar com um cadastro existente.
   const nome=nomes.find(x=>norm(x).length>3)||'';
   saida.push({chave,localizado:true,transportadora:nome,ocorrencias:ev,origem:'SSW Tracking DANFE'});
  }catch(e){saida.push({chave,localizado:false,motivo:e.name==='AbortError'?'Tempo limite do SSW':'Falha na consulta SSW'});}
 }
 return json(res,200,{ok:true,resultados:saida});
};
