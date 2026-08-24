const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterCredenciaisIntegracao}=require('./carregar-credenciais');

const CNPJ_PADRAO='05451985000195';
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function nomeNorm(v){return norm(v).replace(/[^a-z0-9]+/g,' ').trim();}
function statusPorTexto(v){const s=norm(v);if(/entreg|baixa realizada|ctrc entregue|entrega realizada/.test(s))return'entregue';if(/saiu.*entrega|em rota|rota de entrega|veiculo em entrega/.test(s))return'saiu_entrega';if(/filial|unidade|chegada|recebid.*unidade|transferencia/.test(s))return'na_filial';if(/cancel|devol/.test(s))return'cancelado';if(/ocorr|insucesso|recusa|ausente|endereco|avaria|extravio/.test(s))return'ocorrencia';return'em_transito';}
function primeiro(obj,chaves){for(const k of chaves){if(obj&&obj[k]!==undefined&&obj[k]!==null&&String(obj[k]).trim()!=='')return obj[k];}return null;}
function objetos(obj,acc=[]){if(!obj||typeof obj!=='object')return acc;if(Array.isArray(obj)){for(const x of obj)objetos(x,acc);return acc;}acc.push(obj);for(const v of Object.values(obj))if(v&&typeof v==='object')objetos(v,acc);return acc;}

function parseDataSSW(v){
  const s=String(v||'').trim();
  if(!s)return 0;
  const iso=Date.parse(s);
  if(Number.isFinite(iso))return iso;
  // Compatibilidade com respostas no padrão brasileiro dd/mm/aaaa hh:mm[:ss].
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(!m)return 0;
  let ano=Number(m[3]); if(ano<100)ano+=2000;
  const dt=new Date(ano,Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
  return Number.isFinite(dt.getTime())?dt.getTime():0;
}
function listasTrackingSSW(d){
  const listas=[];
  if(Array.isArray(d?.tracking))listas.push(d.tracking);
  if(Array.isArray(d?.documento?.tracking))listas.push(d.documento.tracking);
  if(Array.isArray(d?.documentos)){
    for(const doc of d.documentos){
      if(Array.isArray(doc?.tracking))listas.push(doc.tracking);
      if(Array.isArray(doc?.documento?.tracking))listas.push(doc.documento.tracking);
    }
  }
  // Algumas versões/parceiros encapsulam a resposta em outras chaves. Procura
  // recursivamente arrays que realmente tenham campos típicos de ocorrência SSW.
  const vistos=new Set(listas);
  (function visitar(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){
      if(x.length&&x.some(o=>o&&typeof o==='object'&&(o.ocorrencia||o.descricao)&&(o.data_hora||o.data_hora_efetiva||o.cidade||o.filial))){
        if(!vistos.has(x)){vistos.add(x);listas.push(x);}
      }
      for(const v of x)visitar(v);
      return;
    }
    for(const v of Object.values(x))visitar(v);
  })(d);
  return listas;
}
function eventoTrackingSSW(d){
  const lista=listasTrackingSSW(d).flat().filter(o=>o&&typeof o==='object');
  if(!lista.length)return null;
  const ordenada=lista.slice().sort((a,b)=>{
    const da=parseDataSSW(a?.data_hora_efetiva||a?.data_hora||a?.data||a?.dhEvento);
    const db=parseDataSSW(b?.data_hora_efetiva||b?.data_hora||b?.data||b?.dhEvento);
    return db-da;
  });
  const o=ordenada[0]||{};
  const titulo=String(o.ocorrencia||o.status||o.situacao||'Ocorrência SSW').trim();
  const detalhe=String(o.descricao||o.complemento||'').trim();
  const local=[o.cidade,o.filial].filter(Boolean).join(' • ');
  const data=o.data_hora_efetiva||o.data_hora||o.data||o.dhEvento||null;
  return {
    desc:[titulo,detalhe].filter(Boolean).join(' — '),
    titulo,
    detalhe,
    data,
    compl:local||null,
    raw:o,
    totalEventos:lista.length
  };
}

function eventoMaisUtil(d){
  const all=objetos(d,[]);
  const candidatos=all.map((o,idx)=>{
    const desc=primeiro(o,['ocorrencia','ocorrência','descricao_ocorrencia','desc_ocorrencia','descricao','descrição','evento','situacao','situação','status','desc']);
    const data=primeiro(o,['data_hora_efetiva','data_hora','dataHora','data_hora_evento','dataOcorrencia','data_ocorrencia','data','dhEvento','timestamp']);
    const compl=primeiro(o,['complemento','observacao','observação','detalhe','cidade','local','filial']);
    const temCaraEvento=Boolean(o&&(o.ocorrencia||o.descricao_ocorrencia||o.data_hora||o.data_hora_efetiva||o.cidade||o.filial));
    return {o,desc,data,compl,idx,temCaraEvento,ts:parseDataSSW(data)};
  }).filter(x=>x.desc);
  if(!candidatos.length)return null;
  candidatos.sort((a,b)=>{
    if(a.temCaraEvento!==b.temCaraEvento)return a.temCaraEvento?-1:1;
    if(a.ts!==b.ts)return b.ts-a.ts;
    return b.idx-a.idx;
  });
  const x=candidatos[0];
  return {desc:String(x.desc),data:x.data||null,compl:x.compl||null,raw:x.o,totalEventos:null};
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

    // O SSW pode responder HTTP 200 mesmo quando a consulta foi rejeitada.
    // Não devemos transformar "senha inválida" ou "documento não localizado" em um
    // falso status "Em trânsito".
    const textoResposta=norm([
      dados?.message,dados?.mensagem,dados?.erro_msg,dados?.descricao,dados?.status,
      typeof dados?.texto==='string'?dados.texto:''
    ].filter(Boolean).join(' '));
    if(/senha.*inval|senha.*incorret|acesso.*negad|nao autorizado|usuario.*inval/.test(textoResposta)){
      return json(res,422,{
        ok:false,codigo:'SSW_SENHA_RASTREIO_INVALIDA',
        erro:`O SSW recusou a senha de rastreamento de ${nome}. Cadastre a senha de rastreio/pagador criada na opção 383 da transportadora.`,
        resposta:dados
      });
    }
    if(/nenhum documento localizado|documento nao localizado|nota fiscal nao localizada|nf nao localizada/.test(textoResposta)){
      return json(res,404,{
        ok:false,codigo:'SSW_DOCUMENTO_NAO_LOCALIZADO',
        erro:`O SSW não localizou a NF/chave informada para ${nome}. Confira o número da NF, a chave NF-e e o CNPJ usado no rastreio.`,
        resposta:dados
      });
    }

    const ev=eventoTrackingSSW(dados)||eventoMaisUtil(dados);
    if(!ev){
      const msg=String(dados?.message||dados?.mensagem||'Documento localizado, mas o SSW não retornou ocorrências de rastreamento.');
      return json(res,200,{ok:true,status:'em_transito',statusBruto:msg,metodoConsulta:metodo,dados,semOcorrencias:true});
    }
    const desc=String(ev.desc||'Ocorrência SSW');
    const status=statusPorTexto([ev.titulo,ev.detalhe,ev.compl,desc].filter(Boolean).join(' '));
    let quando=new Date().toISOString();
    const t=parseDataSSW(ev.data);if(t)quando=new Date(t).toISOString();
    const ultima=[desc,ev.compl].filter(Boolean).join(' — ');
    const patch={status,status_api:desc,ultima_ocorrencia:ultima,ultima_ocorrencia_em:quando,consulta_api:dados,metodo_consulta:metodo,consultado_api_em:new Date().toISOString(),sincronizacao_erro:null,atualizado_em:new Date().toISOString(),atualizado_por:'api_ssw_tracking_v51'};
    if(status==='entregue')patch.finalizado_em=quando;
    else patch.finalizado_em=null;
    await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});
    return json(res,200,{ok:true,status,statusBruto:desc,ultimaOcorrencia:ultima,ultimaOcorrenciaEm:quando,local:ev.compl||null,totalEventos:ev.totalEventos||null,metodoConsulta:metodo,dados});
  }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
