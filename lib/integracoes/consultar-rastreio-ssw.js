const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterCredenciaisIntegracao}=require('./carregar-credenciais');

const CNPJ_PADRAO='05451985000195';
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function nomeNorm(v){return norm(v).replace(/[^a-z0-9]+/g,' ').trim();}
function statusPorTexto(v){const s=norm(v);if(/entreg|baixa realizada|ctrc entregue|entrega realizada/.test(s))return'entregue';if(/saiu.*entrega|em rota|rota de entrega|veiculo em entrega/.test(s))return'saiu_entrega';if(/filial|unidade|chegada|recebid.*unidade|transferencia/.test(s))return'na_filial';if(/cancel|devol/.test(s))return'cancelado';if(/ocorr|insucesso|recusa|ausente|endereco|avaria|extravio/.test(s))return'ocorrencia';return'em_transito';}
function primeiro(obj,chaves){for(const k of chaves){if(obj&&obj[k]!==undefined&&obj[k]!==null&&String(obj[k]).trim()!=='')return obj[k];}return null;}
function objetos(obj,acc=[]){if(!obj||typeof obj!=='object')return acc;if(Array.isArray(obj)){for(const x of obj)objetos(x,acc);return acc;}acc.push(obj);for(const v of Object.values(obj))if(v&&typeof v==='object')objetos(v,acc);return acc;}
function eventoMaisUtil(d){
  const all=objetos(d,[]);
  const candidatos=all.map(o=>({
    o,
    desc:primeiro(o,['descricao','descrição','ocorrencia','ocorrência','descricao_ocorrencia','desc_ocorrencia','evento','status','situacao','situação','mensagem','desc']),
    data:primeiro(o,['data_hora','dataHora','data_hora_evento','dataOcorrencia','data_ocorrencia','data','dhEvento','timestamp']),
    compl:primeiro(o,['complemento','observacao','observação','detalhe','cidade','local'])
  })).filter(x=>x.desc);
  if(!candidatos.length)return {desc:primeiro(d,['mensagem','status','situacao'])||'Rastreamento SSW consultado',data:null,compl:null};
  candidatos.sort((a,b)=>{const da=Date.parse(a.data||'')||0,db=Date.parse(b.data||'')||0;return db-da;});
  return candidatos[0];
}
async function buscarIntegracao(nome){
  const rows=await supabaseRest('transportadora_integracoes',{query:'?select=convite_id,transportadora_nome,integracao_tipo,api_versao,ambiente_atual&limit=500'});
  const alvo=nomeNorm(nome);
  return (rows||[]).find(x=>{const n=nomeNorm(x.transportadora_nome);return n===alvo||n.includes(alvo)||alvo.includes(n)||alvo.split(' ').some(w=>w.length>=3&&n.split(' ').includes(w));})||null;
}
async function chamar(url,payload){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
  const txt=await r.text();let d;try{d=txt?JSON.parse(txt):{}}catch{d={texto:txt}}
  if(!r.ok)throw Object.assign(new Error(d?.mensagem||d?.message||d?.erro||`SSW HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  const erro=Number(d?.erro);
  if(Number.isFinite(erro)&&erro<0)throw Object.assign(new Error(d?.mensagem||`SSW retornou erro ${erro}`),{httpStatus:422,resposta:d});
  return d;
}
module.exports=async function(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const registroId=String(req.query.registro_id||'').trim();
    if(!registroId)return json(res,400,{ok:false,erro:'registro_id é obrigatório.'});
    const rows=await supabaseRest('logistica_rastreamentos',{query:`?select=id,numero_nfe,chave_nfe,coleta_agendamento_id,transportadora_id,frete_transportadoras(nome)&id=eq.${encodeURIComponent(registroId)}&limit=1`});
    const rast=rows?.[0];if(!rast)return json(res,404,{ok:false,erro:'Rastreio não encontrado.'});
    const nome=rast.frete_transportadoras?.nome||'';
    const integ=await buscarIntegracao(nome);
    const ambiente=String(integ?.ambiente_atual||'producao').toLowerCase()==='homologacao'?'homologacao':'producao';
    let cred={};
    if(integ?.convite_id){
      try{cred=await obterCredenciaisIntegracao(integ.convite_id,ambiente);}catch(e){console.warn('Credenciais do Portal SSW indisponíveis:',e.message)}
    }
    // Compatibilidade com instalações antigas que já guardavam ACCERT/TG na Vercel.
    // Para rastreio por NF a WebAPI usa CNPJ do remetente e, quando exigido pela
    // transportadora, a senha específica de rastreamento da opção 383.
    if(/accert/i.test(nome)){
      cred.ssw_dominio=cred.ssw_dominio||process.env.ACCERT_SSW_DOMINIO||'ACC';
      cred.username=cred.username||process.env.ACCERT_SSW_LOGIN||'';
      cred.password=cred.password||process.env.ACCERT_SSW_SENHA||'';
      cred.ssw_senha_rastreio=cred.ssw_senha_rastreio||process.env.ACCERT_SSW_SENHA_RASTREIO||'';
      cred.ssw_cnpj_rastreio=cred.ssw_cnpj_rastreio||process.env.ACCERT_SSW_CNPJ_RASTREIO||'';
    }else if(/(^|\s)tg(\s|$)|tg transportes/i.test(nome)){
      cred.ssw_dominio=cred.ssw_dominio||process.env.TG_SSW_DOMINIO||process.env.TGT_SSW_DOMINIO||'TGT';
      cred.username=cred.username||process.env.TG_SSW_LOGIN||process.env.TGT_SSW_LOGIN||'';
      cred.password=cred.password||process.env.TG_SSW_SENHA||process.env.TGT_SSW_SENHA||'';
      cred.ssw_senha_rastreio=cred.ssw_senha_rastreio||process.env.TG_SSW_SENHA_RASTREIO||process.env.TGT_SSW_SENHA_RASTREIO||'';
      cred.ssw_cnpj_rastreio=cred.ssw_cnpj_rastreio||process.env.TG_SSW_CNPJ_RASTREIO||process.env.TGT_SSW_CNPJ_RASTREIO||'';
    }
    if(!integ?.convite_id && !/accert|(^|\s)tg(\s|$)/i.test(nome))return json(res,422,{ok:false,erro:`Integração SSW não localizada para ${nome}.`});
    const chave=String(rast.chave_nfe||'').replace(/\D/g,'');
    const nf=String(rast.numero_nfe||'').trim();
    let dados,metodo;

    // Pela chave da NF-e o SSW disponibiliza uma consulta específica que não exige senha de rastreio.
    if(chave.length===44){
      try{dados=await chamar('https://ssw.inf.br/api/trackingdanfe',{chave_nfe:chave});metodo='SSW Tracking DANFE';}catch(e){console.warn('trackingdanfe falhou, tentando tracking:',e.message)}
    }
    if(!dados){
      const senha=String(cred.ssw_senha_rastreio||process.env.SSW_SENHA_RASTREIO||'').trim();
      const cnpj=String(cred.ssw_cnpj_rastreio||process.env.SSW_CNPJ_RASTREIO||CNPJ_PADRAO).replace(/\D/g,'');
      if(cnpj.length!==14)return json(res,422,{ok:false,erro:'CNPJ usado no rastreio SSW deve possuir 14 dígitos.'});
      const payload={cnpj,tipo_doc:'E'};
      if(senha)payload.senha=senha;
      if(chave.length===44)payload.chave_nfe=chave;else if(nf)payload.nro_nf=Number(nf)||nf;else return json(res,422,{ok:false,erro:'Informe número da NF ou chave NF-e para consultar no SSW.'});
      const dominio=String(cred.ssw_dominio||'').trim().toUpperCase();
      if(dominio)payload.sigla_emp=dominio;
      let ultimoErro=null;
      try{dados=await chamar('https://ssw.inf.br/api/tracking',payload);}
      catch(e){
        ultimoErro=e;
        if(payload.sigla_emp){delete payload.sigla_emp;try{dados=await chamar('https://ssw.inf.br/api/tracking',payload);}catch(e2){ultimoErro=e2;}}
      }
      if(!dados && !senha){
        const detalhe=ultimoErro?.message?` Retorno do SSW: ${ultimoErro.message}`:'';
        return json(res,422,{ok:false,codigo:'SSW_SENHA_RASTREIO_NAO_CADASTRADA',erro:`O SSW não liberou a consulta por NF sem a senha de rastreamento de ${nome}. Solicite à transportadora a senha criada na opção 383.${detalhe}`,resposta:ultimoErro?.resposta||null});
      }
      if(!dados)throw ultimoErro||new Error('SSW não retornou dados de rastreio.');
      metodo='SSW Tracking WebAPI';
    }

    const ev=eventoMaisUtil(dados);const desc=String(ev.desc||'Rastreamento SSW consultado');const status=statusPorTexto(JSON.stringify(dados)+' '+desc);
    let quando=new Date().toISOString();if(ev.data){const t=Date.parse(ev.data);if(Number.isFinite(t))quando=new Date(t).toISOString();}
    const patch={status,status_api:desc,ultima_ocorrencia:[desc,ev.compl].filter(Boolean).join(' — '),ultima_ocorrencia_em:quando,consulta_api:dados,metodo_consulta:metodo,consultado_api_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),atualizado_por:'api_ssw_tracking_v44'};
    if(status==='entregue')patch.finalizado_em=quando;
    await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});
    return json(res,200,{ok:true,status,statusBruto:desc,metodoConsulta:metodo,dados});
  }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
