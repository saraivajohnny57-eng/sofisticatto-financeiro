const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {obterCredenciaisIntegracao}=require('./carregar-credenciais');

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function nomeNorm(v){return norm(v).replace(/[^a-z0-9]+/g,' ').trim();}
function xmlEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function htmlDec(v){return String(v||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function tag(xml,nome){const m=String(xml||'').match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${nome}>`,'i'));return m?htmlDec(m[1]).trim():'';}
function numero(v){const s=String(v??'').trim();if(!s)return 0;const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(n)?n:0;}
function volumeM3(medidas,quantidade=1){
  const nums=String(medidas||'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite)||[];
  if(nums.length<3)return 0;
  let [c,l,a]=nums.slice(0,3);
  // Tela normalmente usa metros (0,38 x 0,29 x 0,35). Se vier em cm, converte.
  if(c>10||l>10||a>10){c/=100;l/=100;a/=100;}
  return +(c*l*a*Math.max(1,Number(quantidade)||1)).toFixed(4);
}
function dimensoesMedidas(medidas){
  const nums=String(medidas||'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite)||[];
  if(nums.length<3)return {comprimento:0,largura:0,altura:0};
  let [c,l,a]=nums.slice(0,3);
  if(c>10||l>10||a>10){c/=100;l/=100;a/=100;}
  return {
    comprimento:+c.toFixed(4),
    largura:+l.toFixed(4),
    altura:+a.toFixed(4)
  };
}
function tokensIdentidadeTransportadora(nome){
  const genericos=new Set(['transportes','transportadora','transportadoras','logistica','logistico','express','expresso','cargas','carga','ltda','sa']);
  return nomeNorm(nome).split(' ').filter(t=>t&&t.length>=2&&!genericos.has(t));
}
function mesmaTransportadoraSSW(a,b){
  const na=nomeNorm(a), nb=nomeNorm(b);
  if(!na||!nb)return false;
  if(na===nb)return true;

  // TG/TGT e ACCERT nunca podem ser confundidas por palavras genéricas como "transportes".
  const aTG=/(^| )tg( |$)|(^| )tgt( |$)/.test(na), bTG=/(^| )tg( |$)|(^| )tgt( |$)/.test(nb);
  const aAcc=/accert/.test(na), bAcc=/accert/.test(nb);
  if(aTG||bTG)return aTG&&bTG;
  if(aAcc||bAcc)return aAcc&&bAcc;

  const ta=tokensIdentidadeTransportadora(na), tb=new Set(tokensIdentidadeTransportadora(nb));
  return ta.some(t=>t.length>=3&&tb.has(t));
}
async function buscarIntegracao(nome){
  const alvo=nomeNorm(nome);
  try{
    const rows=await supabaseRest('transportadora_integracoes',{query:'?select=convite_id,transportadora_nome,integracao_tipo,api_versao,ambiente_atual&limit=500'});
    const exato=(rows||[]).find(x=>nomeNorm(x.transportadora_nome)===alvo);
    const achou=exato||(rows||[]).find(x=>mesmaTransportadoraSSW(nome,x.transportadora_nome));
    if(achou)return achou;
  }catch(e){
    console.warn('Cotação SSW: falha ao consultar transportadora_integracoes:',e.message);
  }

  // Compatibilidade com cadastros antigos feitos antes da Central de Integrações.
  try{
    const convites=await supabaseRest('integracao_convites',{query:'?select=id,transportadora_nome,ambiente&order=created_at.desc&limit=500'});
    const exato=(convites||[]).find(x=>nomeNorm(x.transportadora_nome)===alvo);
    const convite=exato||(convites||[]).find(x=>mesmaTransportadoraSSW(nome,x.transportadora_nome));
    if(convite)return {convite_id:convite.id,transportadora_nome:convite.transportadora_nome,ambiente_atual:convite.ambiente||'producao'};
  }catch(e){
    console.warn('Cotação SSW: falha ao consultar integracao_convites:',e.message);
  }

  // ACCERT/TG podem estar configuradas apenas nas Environment Variables da Vercel.
  if(/accert/i.test(nome)||/(^|\s)tg(\s|$)|tg transportes/i.test(nome)){
    return {convite_id:null,transportadora_nome:nome,ambiente_atual:'producao',origem:'vercel'};
  }
  return null;
}

function credenciaisVercelSSW(nome){
  const n=nomeNorm(nome);

  if(/accert/.test(n)){
    return {
      ssw_dominio:
        process.env.ACCERT_SSW_DOMINIO||
        process.env.ACCERT_DOMINIO||
        process.env.SSW_ACCERT_DOMINIO||
        'ACC',
      ssw_login:
        process.env.ACCERT_SSW_LOGIN||
        process.env.ACCERT_LOGIN||
        process.env.SSW_ACCERT_LOGIN||
        '',
      ssw_senha:
        process.env.ACCERT_SSW_SENHA||
        process.env.ACCERT_SENHA||
        process.env.SSW_ACCERT_SENHA||
        '',
      ssw_codigo_mercadoria:
        process.env.ACCERT_SSW_CODIGO_MERCADORIA||
        process.env.ACCERT_CODIGO_MERCADORIA||
        ''
    };
  }

  if(/(^| )tg( |$)|tg transportes/.test(n)){
    return {
      ssw_dominio:
        process.env.TG_SSW_DOMINIO||
        process.env.TGT_SSW_DOMINIO||
        process.env.TG_DOMINIO||
        process.env.TGT_DOMINIO||
        'TGT',
      ssw_login:
        process.env.TG_SSW_LOGIN||
        process.env.TGT_SSW_LOGIN||
        process.env.TG_LOGIN||
        process.env.TGT_LOGIN||
        '',
      ssw_senha:
        process.env.TG_SSW_SENHA||
        process.env.TGT_SSW_SENHA||
        process.env.TG_SENHA||
        process.env.TGT_SENHA||
        '',
      ssw_codigo_mercadoria:
        process.env.TG_SSW_CODIGO_MERCADORIA||
        process.env.TGT_SSW_CODIGO_MERCADORIA||
        process.env.TG_CODIGO_MERCADORIA||
        process.env.TGT_CODIGO_MERCADORIA||
        ''
    };
  }

  return {};
}
function soapEnvelope(ns,p){return `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${ns}"><soapenv:Body><urn:cotar soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><dominio xsi:type="xsd:string">${xmlEsc(p.dominio)}</dominio><login xsi:type="xsd:string">${xmlEsc(p.login)}</login><senha xsi:type="xsd:string">${xmlEsc(p.senha)}</senha><cnpjPagador xsi:type="xsd:string">${xmlEsc(p.cnpjPagador)}</cnpjPagador><cepOrigem xsi:type="xsd:int">${xmlEsc(p.cepOrigem)}</cepOrigem><cepDestino xsi:type="xsd:int">${xmlEsc(p.cepDestino)}</cepDestino><valorNF xsi:type="xsd:decimal">${xmlEsc(p.valorNF)}</valorNF><quantidade xsi:type="xsd:int">${xmlEsc(p.quantidade)}</quantidade><peso xsi:type="xsd:decimal">${xmlEsc(p.peso)}</peso><volume xsi:type="xsd:decimal">${xmlEsc(p.volume)}</volume><mercadoria xsi:type="xsd:int">${xmlEsc(p.mercadoria)}</mercadoria><cnpjDestinatario xsi:type="xsd:string">${xmlEsc(p.cnpjDestinatario)}</cnpjDestinatario><coletar xsi:type="xsd:string">${xmlEsc(p.coletar)}</coletar><entDificil xsi:type="xsd:string">${xmlEsc(p.entDificil)}</entDificil><destContribuinte xsi:type="xsd:string">${xmlEsc(p.destContribuinte)}</destContribuinte><qtdePares xsi:type="xsd:int">${xmlEsc(p.qtdePares)}</qtdePares><altura xsi:type="xsd:decimal">${xmlEsc(p.altura)}</altura><largura xsi:type="xsd:decimal">${xmlEsc(p.largura)}</largura><comprimento xsi:type="xsd:decimal">${xmlEsc(p.comprimento)}</comprimento><fatorMultiplicador xsi:type="xsd:int">${xmlEsc(p.fatorMultiplicador)}</fatorMultiplicador><cnpjRemetente xsi:type="xsd:string">${xmlEsc(p.cnpjRemetente)}</cnpjRemetente></urn:cotar></soapenv:Body></soapenv:Envelope>`;}
async function chamarSoap(payload){
  const endpoint='https://ssw.inf.br/ws/sswCotacao/index.php';
  const tentativas=[
    {ns:'urn:sswCotacao',action:'urn:sswCotacao#cotar'},
    {ns:'urn:sswCotacao',action:'cotar'},
    {ns:'http://ssw.inf.br/ws/sswCotacao',action:'cotar'}
  ];
  let ultimo;
  for(const t of tentativas){
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':`"${t.action}"`,Accept:'text/xml'},body:soapEnvelope(t.ns,payload)});
      const txt=await r.text();
      if(!r.ok)throw Object.assign(new Error(`SSW Cotação HTTP ${r.status}`),{httpStatus:r.status,resposta:txt.slice(0,2000)});
      const fault=tag(txt,'faultstring');if(fault)throw new Error(fault);
      let retorno=tag(txt,'return')||tag(txt,'cotarReturn')||txt;
      retorno=htmlDec(retorno);
      if(!/<cotacao[\s>]/i.test(retorno)){
        const m=retorno.match(/<cotacao[\s\S]*?<\/cotacao>/i);if(m)retorno=m[0];
      }
      const erro=Number(tag(retorno,'erro'));
      const mensagem=tag(retorno,'mensagem');
      const totalFrete=numero(tag(retorno,'totalFrete')||tag(retorno,'frete'));
      const prazo=Number(tag(retorno,'prazo')||0)||0;
      if(Number.isFinite(erro)&&erro<0)throw Object.assign(new Error(mensagem||`SSW retornou erro ${erro}`),{httpStatus:422,resposta:retorno});
      if(!totalFrete && Number.isFinite(erro)&&erro!==0&&erro!==1)throw Object.assign(new Error(mensagem||`SSW retornou erro ${erro}`),{httpStatus:422,resposta:retorno});
      return {erro:Number.isFinite(erro)?erro:null,mensagem,valor:totalFrete,prazo,xml:retorno,detalhes:{pesoCalculo:numero(tag(retorno,'pesoCalculo')),tabCalculo:tag(retorno,'tabCalculo')}};
    }catch(e){ultimo=e;}
  }
  throw ultimo||new Error('Não foi possível chamar o WebService de Cotação SSW.');
}
module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  try{
    const b=req.body||{};const transportadoraId=String(b.transportadora_id||'').trim();
    if(!transportadoraId)return json(res,400,{ok:false,erro:'transportadora_id é obrigatório.'});
    const trs=await supabaseRest('frete_transportadoras',{query:`?select=id,nome&id=eq.${encodeURIComponent(transportadoraId)}&limit=1`});
    const tr=trs?.[0];if(!tr)return json(res,404,{ok:false,erro:'Transportadora não encontrada.'});
    const integ=await buscarIntegracao(tr.nome);
    if(!integ)return json(res,422,{ok:false,erro:`Integração SSW não localizada para ${tr.nome}.`});

    const ambiente=String(integ.ambiente_atual||'producao').toLowerCase()==='homologacao'?'homologacao':'producao';
    let credPortal={};
    let erroPortal=null;

    if(integ.convite_id){
      try{
        credPortal=await obterCredenciaisIntegracao(integ.convite_id,ambiente);
      }catch(e){
        erroPortal=e;
        console.warn(`Cotação SSW ${tr.nome}: credenciais do Portal indisponíveis; tentando Vercel:`,e.message);
      }
    }

    // V86: mesmas regras já usadas com sucesso por coleta/rastreio.
    // As credenciais do Portal têm prioridade; a Vercel apenas completa campos ausentes.
    const cred={...credenciaisVercelSSW(tr.nome),...credPortal};

    const dominio=String(cred.ssw_dominio||cred.dominio||'').trim().toUpperCase();
    const login=String(cred.ssw_login||cred.username||cred.login||cred.usuario||'').trim();
    const senha=String(cred.ssw_senha||cred.password||cred.senha||'').trim();

    const faltando=[];
    if(!dominio)faltando.push('Domínio SSW');
    if(!login)faltando.push('Login');
    if(!senha)faltando.push('Senha WebService');

    if(faltando.length){
      const origem=integ.convite_id
        ?`O cadastro foi localizado no Portal de Integrações${erroPortal?`, mas ${erroPortal.message}`:''}.`
        :'Não há credenciais completas no Portal de Integrações nem nas variáveis da Vercel.';
      return json(res,422,{
        ok:false,
        codigo:'SSW_CREDENCIAIS_INCOMPLETAS',
        erro:`Não foi possível cotar na ${tr.nome}. Faltando: ${faltando.join(', ')}. ${origem}`,
        faltando,
        diagnostico:{
          transportadora:tr.nome,
          ambiente,
          integracao_localizada:Boolean(integ),
          convite_localizado:Boolean(integ.convite_id),
          credencial_portal_localizada:Boolean(Object.keys(credPortal||{}).length),
          credencial_vercel_detectada:Boolean(
            credenciaisVercelSSW(tr.nome).ssw_login ||
            credenciaisVercelSSW(tr.nome).ssw_senha
          )
        }
      });
    }
    const cepOrigem=String(b.cep_origem||'74550470').replace(/\D/g,'');const cepDestino=String(b.cep_destino||'').replace(/\D/g,'');
    const cnpjPagador=String(b.cnpj_pagador||'').replace(/\D/g,'');const cnpjDest=String(b.cnpj_destinatario||'').replace(/\D/g,'');const cnpjRem=String(b.cnpj_remetente||'05451985000195').replace(/\D/g,'');
    if(cepOrigem.length!==8||cepDestino.length!==8)return json(res,422,{ok:false,erro:'CEP origem/destino inválido para cotação SSW.'});
    if(cnpjPagador.length!==14)return json(res,422,{ok:false,erro:'O SSW exige CNPJ pagador com 14 dígitos para esta cotação.'});
    const quantidade=Math.max(1,Number(b.quantidade||1)||1);const peso=Math.max(0,numero(b.peso));
    const volInformado=Math.max(0,numero(b.volume));const volume=volInformado||volumeM3(b.medidas,quantidade);
    if(!peso&&!volume)return json(res,422,{ok:false,erro:'Informe peso ou medidas/volume para cotação SSW.'});
    const mercadoria=Number(cred.ssw_codigo_mercadoria||b.mercadoria_codigo||1)||1;
    const entDificil=String(b.ent_dificil||b.entDificil||'N').trim().toUpperCase().startsWith('S')?'S':'N';
    const destContribuinte=String(b.dest_contribuinte||b.destContribuinte||'N').trim().toUpperCase().startsWith('S')?'S':'N';

    // V88: parâmetros restantes na ordem oficial do método cotar().
    // Uma única medida se aplica a todos os volumes do pedido.
    const dim=dimensoesMedidas(b.medidas);
    const temDim=dim.altura>0&&dim.largura>0&&dim.comprimento>0;
    const qtdePares=temDim?1:0;
    const fatorMultiplicador=temDim?quantidade:0;

    const dados=await chamarSoap({
      dominio,login,senha,cnpjPagador,
      cepOrigem:Number(cepOrigem),cepDestino:Number(cepDestino),
      valorNF:numero(b.valor_nf),quantidade,peso,volume,mercadoria,
      cnpjDestinatario:cnpjDest,
      coletar:String(b.coletar||'S').toUpperCase().startsWith('S')?'S':'N',
      entDificil,
      destContribuinte,
      qtdePares,
      altura:temDim?dim.altura:0,
      largura:temDim?dim.largura:0,
      comprimento:temDim?dim.comprimento:0,
      fatorMultiplicador,
      cnpjRemetente:cnpjRem
    });
    return json(res,200,{
      ok:true,
      transportadora:tr.nome,
      valor:dados.valor,
      prazo:dados.prazo,
      mensagem:dados.mensagem,
      alerta:dados.erro===1,
      detalhes:dados.detalhes,
      metodo:'SSW sswCotacao.cotar',
      credenciais_origem:Object.keys(credPortal||{}).length?'Portal de Integrações':'Vercel',
      parametros_ssw:{
        entDificil,
        destContribuinte,
        coletar:String(b.coletar||'S').toUpperCase().startsWith('S')?'S':'N'
      }
    });
  }catch(e){console.error('cotar-ssw:',e);return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
