const {json,exigirAdmin,supabaseRest}=require('./_utils');

function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function digits(v){return String(v||'').replace(/\D/g,'')}
function num(v){const s=String(v??'').trim().replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
function tag(xml,n){const m=String(xml||'').match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim():''}
function xmlDecode(s){return String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}

module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
 if(!exigirAdmin(req,res))return;
 const dominio=process.env.ACCERT_SSW_DOMINIO||'';
 const login=process.env.ACCERT_SSW_LOGIN||'';
 const senha=process.env.ACCERT_SSW_SENHA||'';
 if(!dominio||!login||!senha)return json(res,500,{ok:false,erro:'Configure ACCERT_SSW_DOMINIO, ACCERT_SSW_LOGIN e ACCERT_SSW_SENHA na Vercel.'});
 try{
  const e=req.body||{};
  const cep=digits(e.cep_entrega), qtd=Math.trunc(num(e.quantidade)), peso=num(e.peso);
  if(cep.length!==8)throw new Error('CEP do destino inválido.');
  if(qtd<1)throw new Error('Quantidade de volumes inválida.');
  if(!(peso>0))throw new Error('Peso inválido.');
  if(!e.solicitante)throw new Error('Solicitante obrigatório.');
  if(!e.limite_coleta)throw new Error('Data/hora limite da coleta obrigatória.');
  const p={dominio,login,senha,cnpjRemetente:digits(e.cnpj_remetente),cnpjDestinatario:digits(e.cnpj_destinatario),numeroNF:e.numero_nf||'',tipoPagamento:e.tipo_pagamento==='D'?'D':'O',enderecoEntrega:e.endereco_entrega||'',cepEntrega:cep,solicitante:e.solicitante,limiteColeta:e.limite_coleta,quantidade:qtd,peso,observacao:String(e.observacao||'').slice(0,160),instrucao:String(e.instrucao||'').slice(0,80),cubagem:num(e.cubagem)||'',valorMercadoria:num(e.valor_mercadoria)||'',especie:e.especie||'',chave_nfe:digits(e.chave_nfe),cnpjSolicitante:digits(e.cnpj_solicitante),nroPedido:e.numero_pedido||'',mercadoria:e.mercadoria||'',cepEndColeta:digits(e.cep_coleta),logradouroEndColeta:e.logradouro_coleta||'',numeroEndColeta:e.numero_coleta_endereco||'',complementoEndColeta:e.complemento_coleta||'',bairroEndColeta:e.bairro_coleta||'',nomeRemetente:e.nome_remetente||''};
  const params=Object.entries(p).map(([k,v])=>`<${k}>${esc(v)}</${k}>`).join('');
  const envelope=`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><coletar xmlns="urn:sswColeta">${params}</coletar></soap:Body></soap:Envelope>`;
  const r=await fetch('https://ssw.inf.br/ws/sswColeta/index.php',{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'"urn:sswColeta#coletar"'},body:envelope});
  const raw=await r.text();
  if(!r.ok)throw new Error(`SSW HTTP ${r.status}: ${raw.slice(0,300)}`);
  let inner=xmlDecode(tag(raw,'return')||tag(raw,'coletarReturn')||raw);
  const erro=Number(tag(inner,'erro')||tag(raw,'erro')||-999);
  const mensagem=tag(inner,'mensagem')||tag(raw,'mensagem')||'Retorno recebido do SSW';
  const numeroColeta=tag(inner,'numeroColeta')||tag(raw,'numeroColeta')||'';
  if(erro!==0)throw new Error(`SSW: ${mensagem} (código ${erro})`);
  const agora=new Date().toISOString();
  if(e.agendamento_id){await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(e.agendamento_id)}`,body:{codigo_coleta:numeroColeta||null,status:'solicitado',status_api:'solicitado',origem:'api_accert_ssw',solicitado_api_em:agora,atualizado_em:agora}})}
  return json(res,200,{ok:true,transportadora:'ACCERT',integracao:'SSW',numero_coleta:numeroColeta,mensagem,status:'solicitado'});
 }catch(err){return json(res,502,{ok:false,erro:err.message});}
};
