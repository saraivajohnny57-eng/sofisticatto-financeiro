function cfg(){
  const usuario=String(process.env.CORREIOS_USUARIO||'').trim();
  const codigo=String(process.env.CORREIOS_CODIGO_ACESSO||'').trim();
  const cartao=String(process.env.CORREIOS_CARTAO_POSTAGEM||'').trim();
  const contrato=String(process.env.CORREIOS_CONTRATO||'').trim();
  const dr=String(process.env.CORREIOS_DR||'').trim();
  const cnpj=String(process.env.CORREIOS_CNPJ||'05451985000195').replace(/\D/g,'');
  const cepOrigem=String(process.env.CORREIOS_CEP_ORIGEM||'').replace(/\D/g,'');
  const servicos=String(process.env.CORREIOS_SERVICOS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!usuario||!codigo)throw new Error('Configure CORREIOS_USUARIO e CORREIOS_CODIGO_ACESSO na Vercel.');
  return {usuario,codigo,cartao,contrato,dr,cnpj,cepOrigem,servicos};
}

const caches={user:{token:null,exp:0},contrato:{token:null,exp:0},cartao:{token:null,exp:0}};
let cacheMeuContrato={dados:null,exp:0};

function expToken(d){
  let exp=Date.now()+50*60*1000;
  const raw=d.expiraEm||d.expiracao||d.expires_at;
  if(raw){const x=new Date(raw).getTime();if(Number.isFinite(x))exp=x;}
  return exp;
}

async function gerarToken(tipo='auto'){
  const c=cfg();
  let escopo=tipo;
  if(escopo==='auto')escopo=c.cartao?'cartao':(c.contrato?'contrato':'user');
  if(escopo==='cartao'&&!c.cartao)escopo=c.contrato?'contrato':'user';
  if(escopo==='contrato'&&!c.contrato)escopo='user';
  const cache=caches[escopo];
  if(cache.token && Date.now()<cache.exp-60000)return cache.token;

  let endpoint='https://api.correios.com.br/token/v1/autentica';
  let body;
  if(escopo==='cartao'){
    endpoint+='/cartaopostagem';
    body={numero:c.cartao};
    if(c.contrato)body.contrato=c.contrato;
    // DR é opcional nos Correios; omitimos para permitir descoberta automática.
    if(c.dr)body.dr=Number(c.dr);
  }else if(escopo==='contrato'){
    endpoint+='/contrato';
    body={numero:c.contrato};
    // DR é opcional para gerar o token por contrato.
    if(c.dr)body.dr=Number(c.dr);
  }

  const basic=Buffer.from(`${c.usuario}:${c.codigo}`).toString('base64');
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Basic ${basic}`,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{}}catch{d={texto:txt}}
  if(!r.ok)throw Object.assign(new Error(d.mensagem||d.message||d.erro||`Correios Token HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  const t=d.token||d.access_token;
  if(!t)throw new Error('Os Correios não retornaram token. Verifique usuário, código de acesso, contrato/cartão.');
  cache.token=t;cache.exp=expToken(d);
  return t;
}

async function token(){return gerarToken('auto');}

async function apiComToken(url,opts={},tipoToken='auto'){
  const t=await gerarToken(tipoToken);
  const r=await fetch(url,{...opts,headers:{Accept:'application/json',Authorization:`Bearer ${t}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const txt=await r.text();let d;try{d=txt?JSON.parse(txt):{}}catch{d={texto:txt}}
  if(!r.ok)throw Object.assign(new Error(d.mensagem||d.message||d.erro||d.msgs?.[0]||`Correios HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  return d;
}
async function api(url,opts={}){return apiComToken(url,opts,'auto');}

function listaResposta(d){
  if(Array.isArray(d))return d;
  if(Array.isArray(d?.itens))return d.itens;
  if(Array.isArray(d?.items))return d.items;
  if(Array.isArray(d?.content))return d.content;
  return d&&typeof d==='object'?[d]:[];
}
function codigoServico(x){return String(x?.codigo??x?.coServico??x?.coProduto??x?.codigoServico??'').trim();}
function descricaoServico(x){return String(x?.descricao??x?.noServico??x?.nome??x?.descricaoServico??'').trim();}
function servicoCotavel(x){
  const cod=codigoServico(x);const desc=descricaoServico(x).toUpperCase();
  if(!/^\d{5}$/.test(cod))return false;
  if(/\bAPI\b|PRE.?POSTAGEM|LOGISTICA REVERSA|RASTRO|TOKEN|ENDEREC/.test(desc))return false;
  return /SEDEX|PAC|ENCOMENDA|MINI|EXPRESS|ECONOMIC/.test(desc);
}

async function descobrirContrato({forcar=false}={}){
  const c=cfg();
  if(!forcar && cacheMeuContrato.dados && Date.now()<cacheMeuContrato.exp)return cacheMeuContrato.dados;
  if(!c.contrato)throw new Error('Configure CORREIOS_CONTRATO para a descoberta automática do DR e dos serviços.');
  if(c.cnpj.length!==14)throw new Error('Configure CORREIOS_CNPJ com 14 dígitos para consultar a API Meu Contrato.');

  const base=`https://api.correios.com.br/meucontrato/v1/empresas/${encodeURIComponent(c.cnpj)}/contratos/${encodeURIComponent(c.contrato)}`;
  const contrato=await apiComToken(base,{},'contrato');
  const dr=String(contrato?.nuSe??contrato?.nuSE??contrato?.dr??c.dr??'').trim();

  let urlServicos=`${base}/servicos?page=0&size=200`;
  if(c.cartao)urlServicos+=`&nuCartaoPostagem=${encodeURIComponent(c.cartao)}`;
  let respServicos=await apiComToken(urlServicos,{},'contrato');
  let itens=listaResposta(respServicos);

  // Alguns contratos respondem melhor pelo endpoint específico do cartão.
  if(c.cartao && !itens.length){
    respServicos=await apiComToken(`${base}/cartoes/${encodeURIComponent(c.cartao)}/servicos?page=0&size=200`,{},'contrato');
    itens=listaResposta(respServicos);
  }

  const todosServicos=itens.map(x=>({codigo:codigoServico(x),descricao:descricaoServico(x),raw:x})).filter(x=>x.codigo);
  const cotaveis=itens.filter(servicoCotavel).map(x=>({codigo:codigoServico(x),descricao:descricaoServico(x)}));
  const unicos=[...new Map(cotaveis.map(x=>[x.codigo,x])).values()];
  const dados={cnpj:c.cnpj,contrato:c.contrato,cartao:c.cartao||null,dr:dr||null,servicos:unicos,todosServicos,fonte:'API Meu Contrato'};
  cacheMeuContrato={dados,exp:Date.now()+6*60*60*1000};
  return dados;
}

async function configuracaoEfetiva(){
  const c=cfg();
  let auto=null;let aviso=null;
  try{if(c.contrato)auto=await descobrirContrato();}catch(e){aviso=e.message;}
  const dr=auto?.dr||c.dr||'';
  const autoServicos=(auto?.servicos||[]).map(x=>x.codigo).filter(Boolean);
  // Se o usuário explicitou CORREIOS_SERVICOS, ele funciona como override/fallback.
  const servicos=c.servicos.length?c.servicos:autoServicos;
  return {...c,dr,servicos,servicosDetalhes:auto?.servicos||[],descoberta:auto,aviso};
}

function n(v){return String(v??'').replace(',','.').replace(/[^0-9.]/g,'')||'0'}
function br(v){const x=Number(String(v??'0').replace(/\./g,'').replace(',','.'));return Number.isFinite(x)?x:0}
function prazoNum(d){return Number(d?.prazoEntrega??d?.prazo??d?.nuPrazo??0)||0}

async function cotar({cepDestino,pesoKg,comprimento=20,largura=20,altura=20,servicos}){
 const c=await configuracaoEfetiva();
 const origem=c.cepOrigem;if(origem.length!==8)throw new Error('Configure CORREIOS_CEP_ORIGEM com 8 dígitos na Vercel.');
 const dest=String(cepDestino||'').replace(/\D/g,'');if(dest.length!==8)throw new Error('CEP de destino inválido.');
 const pesoGramas=Math.max(1,Math.round(Number(pesoKg||0)*1000));
 const lista=(servicos&&servicos.length?servicos:c.servicos);
 if(!lista.length)throw new Error('Nenhum serviço de encomenda foi encontrado no contrato/cartão dos Correios. Verifique a liberação da API Meu Contrato ou use CORREIOS_SERVICOS como fallback.');
 const nomes=new Map((c.servicosDetalhes||[]).map(x=>[x.codigo,x.descricao]));
 const resultados=[];
 for(const coProduto of [...new Set(lista)]){
   try{
    const qp=new URLSearchParams({cepDestino:dest,cepOrigem:origem,psObjeto:String(pesoGramas),tpObjeto:'2',comprimento:n(comprimento),largura:n(largura),altura:n(altura)});
    if(c.dr)qp.set('nuDR',c.dr);
    const preco=await api(`https://api.correios.com.br/preco/v1/nacional/${encodeURIComponent(coProduto)}?${qp}`);
    const qz=new URLSearchParams({cepOrigem:origem,cepDestino:dest});
    const prazo=await api(`https://api.correios.com.br/prazo/v1/nacional/${encodeURIComponent(coProduto)}?${qz}`);
    resultados.push({coProduto,servico:(nomes.get(coProduto)||(preco?.txNome??preco?.nome??'')),valor:br(preco.pcFinal??preco.precoFinal??preco.valor),prazoDias:prazoNum(prazo),preco,prazo});
   }catch(e){resultados.push({coProduto,servico:nomes.get(coProduto)||'',erro:e.message,resposta:e.resposta||null});}
 }
 const validos=resultados.filter(x=>!x.erro&&x.valor>0).sort((a,b)=>a.valor-b.valor);
 return {resultados,melhor:validos[0]||null,configuracao:{dr:c.dr||null,servicos:c.servicos,servicosDetalhes:c.servicosDetalhes,fonte:c.descoberta?'API Meu Contrato':'Variáveis Vercel',aviso:c.aviso||null}};
}

async function rastrear(codigo){
 const cod=String(codigo||'').trim().toUpperCase();
 if(!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod))throw new Error('Código de rastreio dos Correios inválido. Exemplo: AA123456789BR.');
 // O manual oficial da API Rastro exemplifica a consulta somente com resultado=T.
 // Algumas versões do SRO rejeitam o parâmetro idioma mesmo quando pt-BR é informado,
 // retornando SRO-018. Por isso usamos primeiro a forma oficial mínima e mantemos
 // uma segunda tentativa apenas como compatibilidade.
 const base=`https://api.correios.com.br/srorastro/v1/objetos/${encodeURIComponent(cod)}`;
 let ultimoErro=null;
 for(const qs of ['resultado=T','resultado=T&idioma=pt-BR']){
   try{return await api(`${base}?${qs}`);}
   catch(e){
     ultimoErro=e;
     const msg=String(e?.message||'');
     if(!/SRO-018|idioma/i.test(msg))throw e;
   }
 }
 throw ultimoErro||new Error('Não foi possível consultar o objeto nos Correios.');
}


function listaPrepostResposta(d){
  if(Array.isArray(d))return d;
  for(const k of ['itens','items','content','prePostagens','prepostagens','objetos'])if(Array.isArray(d?.[k]))return d[k];
  return [];
}
async function listarPrepostagens({status,page=0,size=100}={}){
  const qp=new URLSearchParams({page:String(page),size:String(size)});if(status)qp.set('status',status);
  let ultimo;
  for(const v of ['v2','v1']){
    try{return await api(`https://api.correios.com.br/prepostagem/${v}/prepostagens?${qp}`);}catch(e){ultimo=e;}
  }
  throw ultimo||new Error('Não foi possível consultar as pré-postagens dos Correios.');
}
function somenteDig(v){return String(v||'').replace(/\D/g,'');}
function normalizaTxt(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();}
function valorProfundo(obj,chaves){
  if(!obj||typeof obj!=='object')return '';
  for(const k of chaves)if(obj[k]!==undefined&&obj[k]!==null&&String(obj[k]).trim())return obj[k];
  for(const v of Object.values(obj)){if(v&&typeof v==='object'){const x=valorProfundo(v,chaves);if(x!==''&&x!==null&&x!==undefined)return x;}}
  return '';
}
function candidatoPrepost(item,alvo){
  const codigo=String(valorProfundo(item,['codigoObjeto','codObjeto','codigoRastreio','eticket'])||'').trim().toUpperCase();
  if(!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(codigo))return null;
  const cnpj=somenteDig(valorProfundo(item,['cpfCnpj','cpfCNPJ','cnpj','documento']));
  const cep=somenteDig(valorProfundo(item,['cep']));
  const nome=normalizaTxt(valorProfundo(item,['nome','nomeDestinatario','razaoSocial']));
  let score=0;
  if(alvo.cnpj&&cnpj===alvo.cnpj)score+=100;
  if(alvo.cep&&cep===alvo.cep)score+=30;
  if(alvo.nome&&nome&&(nome.includes(alvo.nome)||alvo.nome.includes(nome)))score+=20;
  const data=String(valorProfundo(item,['dataHoraStatusAtual','dataPrePostagem','dataPostagem','dataHora'])||'');
  if(alvo.data&&data){const d1=Date.parse(alvo.data),d2=Date.parse(data);if(Number.isFinite(d1)&&Number.isFinite(d2)&&Math.abs(d1-d2)<=10*86400000)score+=10;}
  return {codigo,score,item};
}
async function descobrirCodigoObjeto(alvo={}){
  const normAlvo={cnpj:somenteDig(alvo.cnpj),cep:somenteDig(alvo.cep),nome:normalizaTxt(alvo.nome),data:alvo.data||''};
  const todos=[];
  for(const status of ['POSTADO','PREPOSTADO']){
    try{const d=await listarPrepostagens({status,page:0,size:100});todos.push(...listaPrepostResposta(d));}catch(e){console.warn('Correios prepostagem',status,e.message);}
  }
  const candidatos=todos.map(x=>candidatoPrepost(x,normAlvo)).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(!candidatos.length)return {codigo:null,motivo:'Nenhuma pré-postagem com código de objeto foi encontrada.'};
  if(candidatos[0].score<30)return {codigo:null,motivo:'Foram encontrados objetos, mas sem correspondência segura com o destinatário do pedido.',candidatos:candidatos.slice(0,5).map(x=>({codigo:x.codigo,score:x.score}))};
  if(candidatos[1]&&candidatos[1].score===candidatos[0].score)return {codigo:null,motivo:'Mais de um objeto corresponde ao pedido; informe o código manualmente para evitar vínculo incorreto.',candidatos:candidatos.slice(0,5).map(x=>({codigo:x.codigo,score:x.score}))};
  return {codigo:candidatos[0].codigo,item:candidatos[0].item,score:candidatos[0].score};
}

module.exports={cfg,token,gerarToken,api,apiComToken,descobrirContrato,configuracaoEfetiva,cotar,rastrear,listarPrepostagens,descobrirCodigoObjeto};
