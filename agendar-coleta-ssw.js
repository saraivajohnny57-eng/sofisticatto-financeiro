const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterCredenciaisIntegracao}=require('./carregar-credenciais');

function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function digits(v){return String(v||'').replace(/\D/g,'')}
function num(v){const s=String(v??'').trim().replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
function tag(xml,n){const m=String(xml||'').match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim():''}
function xmlDecode(s){return String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}

async function descobrirIntegracao(transportadoraId,conviteId){
  let nome='';
  if(transportadoraId){
    const t=await supabaseRest('frete_transportadoras',{query:`?select=id,nome&id=eq.${encodeURIComponent(transportadoraId)}&limit=1`});
    nome=t?.[0]?.nome||'';
    if(!nome)throw new Error('Transportadora não encontrada.');
  }

  if(conviteId){
    if(!nome){
      const c=await supabaseRest('integracao_convites',{query:`?select=id,transportadora_nome&id=eq.${encodeURIComponent(conviteId)}&limit=1`});
      nome=c?.[0]?.transportadora_nome||'';
    }
    return {conviteId,nome};
  }

  if(!transportadoraId)throw new Error('Informe a transportadora ou convite da integração.');

  // Primeiro usa a tabela técnica central, que já é a fonte usada pelo motor de integrações.
  try{
    const rows=await supabaseRest('transportadora_integracoes',{query:'?select=convite_id,transportadora_nome,integracao_tipo,coleta_ativa,ambiente_atual&limit=500'});
    const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const alvo=norm(nome);
    const achou=(rows||[]).find(x=>{
      const n=norm(x.transportadora_nome);
      return n===alvo||n.includes(alvo)||alvo.includes(n)||alvo.split(' ').some(w=>w.length>=3&&n.split(' ').includes(w));
    });
    if(achou?.convite_id)return {conviteId:achou.convite_id,nome,ambiente:achou.ambiente_atual||'producao'};
  }catch(e){console.warn('SSW coleta: falha ao procurar transportadora_integracoes:',e.message)}

  // Compatibilidade com cadastros antigos no Portal de Integrações.
  try{
    const c=await supabaseRest('integracao_convites',{query:`?select=id,transportadora_nome&transportadora_nome=ilike.${encodeURIComponent(nome)}&order=created_at.desc&limit=1`});
    if(c?.[0]?.id)return {conviteId:c[0].id,nome};
  }catch(e){console.warn('SSW coleta: falha ao procurar integracao_convites:',e.message)}

  // ACCERT/TG já podem estar configuradas somente pelas variáveis da Vercel.
  // Nesse caso não devemos bloquear a coleta por falta de um convite no Portal.
  if(/accert/i.test(nome)||/(^|\s)tg(\s|$)|tg transportes/i.test(nome))return {conviteId:null,nome};

  throw new Error(`Não encontrei a integração da transportadora ${nome} no Portal de Integrações.`);
}

function credenciaisVercelSSW(nome){
  if(/accert/i.test(nome)){
    return {
      ssw_dominio:process.env.ACCERT_SSW_DOMINIO||'ACC',
      ssw_login:process.env.ACCERT_SSW_LOGIN||'',
      ssw_senha:process.env.ACCERT_SSW_SENHA||''
    };
  }
  if(/(^|\s)tg(\s|$)|tg transportes/i.test(nome)){
    return {
      ssw_dominio:process.env.TG_SSW_DOMINIO||process.env.TGT_SSW_DOMINIO||'TGT',
      ssw_login:process.env.TG_SSW_LOGIN||process.env.TGT_SSW_LOGIN||'',
      ssw_senha:process.env.TG_SSW_SENHA||process.env.TGT_SSW_SENHA||''
    };
  }
  return {};
}


module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const e=req.body||{};
    const integracao=await descobrirIntegracao(e.transportadora_id,e.convite_id);
    const conviteId=integracao.conviteId||null;
    const nomeTransportadora=integracao.nome||e.transportadora_nome||'';
    const ambiente=e.ambiente||integracao.ambiente||'producao';
    let cred={};
    if(conviteId){
      try{cred=await obterCredenciaisIntegracao(conviteId,ambiente)}catch(err){
        console.warn('SSW coleta: credenciais do Portal indisponíveis, tentando Vercel:',err.message);
      }
    }
    // Completa com as variáveis já existentes na Vercel sem sobrescrever o Portal.
    cred={...credenciaisVercelSSW(nomeTransportadora),...cred};
    const dominio=String(cred.ssw_dominio||cred.dominio||'').trim().toUpperCase();
    const login=String(cred.ssw_login||cred.username||cred.login||cred.usuario||'').trim();
    const senha=String(cred.ssw_senha||cred.password||cred.senha||'').trim();
    if(!dominio||dominio.length!==3)throw new Error('Domínio SSW não cadastrado. No Portal de Integrações, informe o domínio de 3 letras da transportadora.');
    if(!login||!senha)throw new Error('Login e senha SSW não cadastrados no Portal de Integrações.');

    const cep=digits(e.cep_entrega),qtd=Math.trunc(num(e.quantidade)),peso=num(e.peso);
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
    const inner=xmlDecode(tag(raw,'return')||tag(raw,'coletarReturn')||raw);
    const erro=Number(tag(inner,'erro')||tag(raw,'erro')||-999);
    const mensagem=tag(inner,'mensagem')||tag(raw,'mensagem')||'Retorno recebido do SSW';
    const numeroColeta=tag(inner,'numeroColeta')||tag(raw,'numeroColeta')||'';
    if(erro!==0)throw new Error(`SSW: ${mensagem} (código ${erro})`);

    const agora=new Date().toISOString();
    if(e.agendamento_id){
      await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(e.agendamento_id)}`,body:{codigo_coleta:numeroColeta||null,status:'solicitado',status_api:'solicitado',origem:'api_ssw',solicitado_api_em:agora,atualizado_em:agora}});
    }
    await supabaseRest('integracao_logs',{method:'POST',body:{convite_id:conviteId||null,transportadora_nome:nomeTransportadora||e.transportadora_nome||null,operacao:'coleta',ambiente,http_status:r.status,tempo_ms:null,sucesso:true,mensagem:`Coleta SSW criada${numeroColeta?` — ${numeroColeta}`:''}`,created_at:agora}}).catch(()=>{});
    return json(res,200,{ok:true,convite_id:conviteId,numero_coleta:numeroColeta,mensagem,status:'solicitado'});
  }catch(err){return json(res,502,{ok:false,erro:err.message});}
};
