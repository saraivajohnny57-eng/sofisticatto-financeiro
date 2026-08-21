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
 const cod=String(codigo||'').trim().toUpperCase();if(!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod))throw new Error('Código de rastreio dos Correios inválido. Exemplo: AA123456789BR.');
 return api(`https://api.correios.com.br/srorastro/v1/objetos/${encodeURIComponent(cod)}?resultado=T`);
}

module.exports={cfg,token,gerarToken,api,apiComToken,descobrirContrato,configuracaoEfetiva,cotar,rastrear};
