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
  const tipo=String(tipoRotulo||'P').toUpperCase()==='R'?'R':'P';

  // A API oficial dos Correios gera o rótulo em duas etapas:
  // 1) POST /rotulo/assincrono/pdf -> devolve idRecibo
  // 2) GET  /rotulo/download/assincrono/{idRecibo} -> devolve o PDF/base64
  const body=JSON.stringify({
    idsPrePostagem:[id],
    tipoRotulo:tipo,
    formatoRotulo:'ET',
    imprimeRemetente:'S',
    layoutImpressao:'PADRAO'
  });

  const solicitar=await correiosRaw(
    'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf',
    {method:'POST',headers:{'Content-Type':'application/json'},body}
  );
  const sbuf=Buffer.from(await solicitar.arrayBuffer());
  const stext=sbuf.toString('utf8');
  let recibo={}; try{recibo=JSON.parse(stext)}catch{recibo={texto:stext}}

  if(!solicitar.ok){
    throw Object.assign(
      new Error(recibo.mensagem||recibo.message||recibo.erro||recibo.msgs?.[0]||stext||`Correios HTTP ${solicitar.status}`),
      {httpStatus:solicitar.status,resposta:recibo}
    );
  }

  // Em algumas respostas o PDF pode vir direto.
  const sct=solicitar.headers.get('content-type')||'';
  if(/pdf|octet-stream/i.test(sct) || sbuf.slice(0,4).toString()==='%PDF'){
    return {buffer:sbuf,contentType:sct||'application/pdf'};
  }

  const idRecibo=txt(
    recibo.idRecibo||
    recibo.recibo||
    recibo.id||
    recibo?.dados?.idRecibo||
    recibo?.data?.idRecibo
  );
  const b64direto=recibo.pdfBase64||recibo.base64||recibo.arquivoBase64||recibo.conteudoBase64||recibo.dados;
  if(!idRecibo && typeof b64direto==='string' && b64direto.length>500){
    return {buffer:Buffer.from(b64direto.replace(/^data:application\/pdf;base64,/,''),'base64'),contentType:'application/pdf'};
  }
  if(!idRecibo){
    throw Object.assign(new Error('Os Correios aceitaram a solicitação, mas não retornaram o ID do recibo do rótulo.'),{httpStatus:502,resposta:recibo});
  }

  let ultimo=null;
  // O processamento é assíncrono. Faz pequenas tentativas antes de devolver erro.
  for(let tentativa=0;tentativa<7;tentativa++){
    if(tentativa) await new Promise(r=>setTimeout(r,650));
    const baixar=await correiosRaw(
      `https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/download/assincrono/${encodeURIComponent(idRecibo)}`,
      {method:'GET'}
    );
    const buf=Buffer.from(await baixar.arrayBuffer());
    const ct=baixar.headers.get('content-type')||'';

    if(baixar.ok){
      if(/pdf|octet-stream/i.test(ct) || buf.slice(0,4).toString()==='%PDF'){
        return {buffer:buf,contentType:'application/pdf'};
      }
      const texto=buf.toString('utf8');
      let d={}; try{d=JSON.parse(texto)}catch{d={texto}}
      const b64=d.dados||d.pdfBase64||d.base64||d.arquivoBase64||d.conteudoBase64||d?.data?.dados;
      if(typeof b64==='string' && b64.length>100){
        const limpo=b64.replace(/^data:application\/pdf;base64,/,'');
        return {buffer:Buffer.from(limpo,'base64'),contentType:'application/pdf'};
      }
      ultimo={status:baixar.status,resposta:d};
      continue;
    }

    const texto=buf.toString('utf8');
    let d={}; try{d=JSON.parse(texto)}catch{d={texto}}
    ultimo={status:baixar.status,resposta:d};
    // 404/202 logo após criar o recibo normalmente significa que o arquivo ainda está sendo processado.
    if([202,404,409,425].includes(baixar.status)) continue;
    throw Object.assign(new Error(d.mensagem||d.message||d.erro||d.msgs?.[0]||texto||`Correios HTTP ${baixar.status}`),{httpStatus:baixar.status,resposta:d});
  }

  throw Object.assign(
    new Error('O rótulo foi solicitado aos Correios, mas o PDF ainda está sendo processado. Clique novamente em Rótulo oficial em alguns segundos.'),
    {httpStatus:202,resposta:{idRecibo,...(ultimo||{})}}
  );
}
async function converterRotuloL42(buffer){
  const { PDFDocument } = require('pdf-lib');
  const origem=await PDFDocument.load(buffer);
  const destino=await PDFDocument.create();
  const paginas=origem.getPages();
  if(!paginas.length) throw new Error('O PDF do rótulo oficial veio sem páginas.');

  const mm=72/25.4;
  const alvoW=100*mm, alvoH=150*mm;

  // V79: captura uma área um pouco maior que 100 mm do PDF oficial.
  // O rótulo dos Correios pode ultrapassar ligeiramente os 100 mm na página original
  // (principalmente a borda/logomarca do lado direito). Em vez de cortar, reduzimos
  // proporcionalmente todo o conteúdo para dentro de 100x150 mm.
  const capturaW=110*mm;
  const capturaH=160*mm;
  const margem=2*mm;
  const areaW=alvoW-(margem*2);
  const areaH=alvoH-(margem*2);

  for(const pg of paginas){
    const {width,height}=pg.getSize();
    const cropW=Math.min(width,capturaW);
    const cropH=Math.min(height,capturaH);
    const yBottom=Math.max(0,height-cropH);

    const emb=await destino.embedPage(pg,{
      left:0,
      bottom:yBottom,
      right:cropW,
      top:height
    });

    const out=destino.addPage([alvoW,alvoH]);
    const escala=Math.min(areaW/cropW,areaH/cropH);
    const w=cropW*escala;
    const h=cropH*escala;

    out.drawPage(emb,{
      x:(alvoW-w)/2,
      y:alvoH-margem-h,
      width:w,
      height:h
    });
  }
  return Buffer.from(await destino.save());
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
    if(acao==='rotulo' || acao==='rotulo-l42'){
      const d=await emitirRotulo(id,p.tipoRotulo);
      const buffer=acao==='rotulo-l42' ? await converterRotuloL42(d.buffer) : d.buffer;
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`inline; filename="${acao==='rotulo-l42'?'rotulo-l42-100x150':'rotulo-correios'}-${id}.pdf"`);
      return res.status(200).send(buffer);
    }
    return res.status(400).json({ok:false,erro:'Modo inválido.'});
  }catch(e){
    return res.status(Number(e.httpStatus)||500).json({ok:false,erro:e.message,resposta:e.resposta||null});
  }
};

module.exports.localizar=localizar;
