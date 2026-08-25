const { gerarToken, listarPrepostagens, listaPrepostResposta, valorProfundo } = require('./_correios');

function txt(v){ return String(v??'').trim(); }
function dig(v){ return txt(v).replace(/\D/g,''); }
function norm(v){ return txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(); }
function idPre(item){
  return txt(valorProfundo(item,['id','idPrePostagem','idPrepostagem','codigoPrePostagem','prePostagemId','prepostagemId']));
}
function codigoObj(item){
  return txt(valorProfundo(item,['codigoObjeto','codObjeto','codigoRastreio','eticket'])).toUpperCase();
}
function nfItem(item){ return dig(valorProfundo(item,['numeroNotaFiscal','numeroNFe','numeroNfe','notaFiscal','nf'])); }
function cepItem(item){ return dig(valorProfundo(item,['cep','cepDestino','cepDestinatario'])); }
function nomeItem(item){ return norm(valorProfundo(item,['nomeDestinatario','nome','razaoSocial','destinatario'])); }

async function todosPrepost(){
  const todos=[];
  for(const status of ['PREPOSTADO','PREATENDIDO','POSTADO']){
    for(let page=0;page<5;page++){
      try{
        const d=await listarPrepostagens({status,tipoObjeto:'REGISTRADO',page,size:100});
        const itens=listaPrepostResposta(d);
        todos.push(...itens);
        const next=Boolean(d?.hasNext ?? d?.temProximaPagina ?? (d?.page?.number < ((d?.page?.totalPages||1)-1)));
        if(itens.length<100 && !next) break;
      }catch(e){ break; }
    }
  }
  return todos;
}

async function localizar({id,codigoObjeto,nf,nome,cep}={}){
  const idAlvo=txt(id), cod=txt(codigoObjeto).toUpperCase(), nfAlvo=dig(nf), nomeAlvo=norm(nome), cepAlvo=dig(cep);
  const itens=await todosPrepost();
  const candidatos=itens.map(item=>{
    const iid=idPre(item), icod=codigoObj(item), inf=nfItem(item), inome=nomeItem(item), icep=cepItem(item);
    let score=0;
    if(idAlvo && iid===idAlvo) score+=1000;
    if(cod && icod===cod) score+=900;
    if(nfAlvo && inf===nfAlvo) score+=300;
    if(cepAlvo && icep===cepAlvo) score+=80;
    if(nomeAlvo && inome && (inome.includes(nomeAlvo)||nomeAlvo.includes(inome))) score+=60;
    return {score,id:iid,codigoObjeto:icod,nf:inf,nome:inome,cep:icep,item};
  }).filter(x=>x.id && x.score>0).sort((a,b)=>b.score-a.score);
  if(!candidatos.length) return {ok:false,erro:'Nenhuma pré-postagem dos Correios corresponde aos dados informados.'};
  if(candidatos[1] && candidatos[1].score===candidatos[0].score && candidatos[0].score<900){
    return {ok:false,erro:'Mais de uma pré-postagem corresponde ao pedido. Informe o código de rastreio ou o ID da pré-postagem.',candidatos:candidatos.slice(0,5).map(x=>({id:x.id,codigoObjeto:x.codigoObjeto,nf:x.nf,nome:x.nome,score:x.score}))};
  }
  return {ok:true,...candidatos[0]};
}

async function correiosRaw(url,opts={}){
  const t=await gerarToken('cartao');
  return fetch(url,{...opts,headers:{Authorization:`Bearer ${t}`,Accept:'*/*','Accept-Language':'pt-BR',...(opts.headers||{})}});
}

async function emitirDeclaracao(id){
  const r=await correiosRaw(`https://api.correios.com.br/prepostagem/v1/prepostagens/declaracaoconteudo/${encodeURIComponent(id)}`);
  const buf=Buffer.from(await r.arrayBuffer());
  if(!r.ok){
    const s=buf.toString('utf8'); let d={}; try{d=JSON.parse(s)}catch{}
    throw Object.assign(new Error(d.mensagem||d.message||d.erro||s||`Correios HTTP ${r.status}`),{httpStatus:r.status});
  }
  return {buffer:buf,contentType:r.headers.get('content-type')||'text/html; charset=utf-8'};
}

async function emitirRotulo(id,tipoRotulo='P'){
  const body=JSON.stringify({idsPrePostagem:[id],tipoRotulo:String(tipoRotulo||'P').toUpperCase()==='R'?'R':'P',formatoRotulo:'ET'});
  const urls=[
    'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf',
    'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo'
  ];
  let ultimo=null;
  for(const url of urls){
    const r=await correiosRaw(url,{method:'POST',headers:{'Content-Type':'application/json'},body});
    const buf=Buffer.from(await r.arrayBuffer());
    const ct=r.headers.get('content-type')||'';
    if(r.ok){
      if(/pdf|html|octet-stream/i.test(ct) || buf.slice(0,4).toString()==='%PDF') return {buffer:buf,contentType:ct||'application/pdf'};
      const s=buf.toString('utf8'); let d={}; try{d=JSON.parse(s)}catch{d={texto:s}}
      // Algumas versões retornam o documento em base64.
      const b64=d.pdfBase64||d.base64||d.arquivoBase64||d.conteudoBase64;
      if(b64) return {buffer:Buffer.from(b64,'base64'),contentType:'application/pdf'};
      ultimo=Object.assign(new Error('Os Correios aceitaram a solicitação do rótulo, mas retornaram processamento assíncrono. Tente novamente em alguns segundos.'),{resposta:d,httpStatus:202});
      continue;
    }
    const s=buf.toString('utf8'); let d={}; try{d=JSON.parse(s)}catch{d={texto:s}}
    ultimo=Object.assign(new Error(d.mensagem||d.message||d.erro||d.msgs?.[0]||s||`Correios HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  }
  throw ultimo||new Error('Não foi possível emitir o rótulo oficial dos Correios.');
}

module.exports=async function handler(req,res){
  try{
    const acao=txt(req.query?.modo||req.body?.modo||'localizar');
    const p={...req.query,...req.body};
    if(acao==='localizar'){
      const r=await localizar(p);
      return res.status(r.ok?200:404).json(r);
    }
    let id=txt(p.idPrePostagem||p.id);
    let loc=null;
    if(!id){ loc=await localizar(p); if(!loc.ok) return res.status(404).json(loc); id=loc.id; }
    if(acao==='declaracao'){
      const d=await emitirDeclaracao(id);
      res.setHeader('Content-Type',d.contentType);
      res.setHeader('Content-Disposition',`inline; filename="declaracao-correios-${id}.html"`);
      return res.status(200).send(d.buffer);
    }
    if(acao==='rotulo'){
      const d=await emitirRotulo(id,p.tipoRotulo);
      res.setHeader('Content-Type',d.contentType);
      res.setHeader('Content-Disposition',`inline; filename="rotulo-correios-${id}.pdf"`);
      return res.status(200).send(d.buffer);
    }
    return res.status(400).json({ok:false,erro:'Modo inválido.'});
  }catch(e){
    return res.status(Number(e.httpStatus)||500).json({ok:false,erro:e.message,resposta:e.resposta||null});
  }
};

module.exports.localizar=localizar;
