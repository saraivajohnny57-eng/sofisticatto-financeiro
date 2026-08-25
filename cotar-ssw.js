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
async function buscarIntegracao(nome){
  const rows=await supabaseRest('transportadora_integracoes',{query:'?select=convite_id,transportadora_nome,integracao_tipo,api_versao,ambiente_atual&limit=500'});
  const alvo=nomeNorm(nome);
  return (rows||[]).find(x=>{const n=nomeNorm(x.transportadora_nome);return n===alvo||n.includes(alvo)||alvo.includes(n)||alvo.split(' ').some(w=>w.length>=3&&n.split(' ').includes(w));})||null;
}
function soapEnvelope(ns,p){return `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${ns}"><soapenv:Body><urn:cotar soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><dominio xsi:type="xsd:string">${xmlEsc(p.dominio)}</dominio><login xsi:type="xsd:string">${xmlEsc(p.login)}</login><senha xsi:type="xsd:string">${xmlEsc(p.senha)}</senha><cnpjPagador xsi:type="xsd:string">${xmlEsc(p.cnpjPagador)}</cnpjPagador><cepOrigem xsi:type="xsd:int">${xmlEsc(p.cepOrigem)}</cepOrigem><cepDestino xsi:type="xsd:int">${xmlEsc(p.cepDestino)}</cepDestino><valorNF xsi:type="xsd:decimal">${xmlEsc(p.valorNF)}</valorNF><quantidade xsi:type="xsd:int">${xmlEsc(p.quantidade)}</quantidade><peso xsi:type="xsd:decimal">${xmlEsc(p.peso)}</peso><volume xsi:type="xsd:decimal">${xmlEsc(p.volume)}</volume><mercadoria xsi:type="xsd:int">${xmlEsc(p.mercadoria)}</mercadoria><cnpjDestinatario xsi:type="xsd:string">${xmlEsc(p.cnpjDestinatario)}</cnpjDestinatario><coletar xsi:type="xsd:string">${xmlEsc(p.coletar)}</coletar><cnpjRemetente xsi:type="xsd:string">${xmlEsc(p.cnpjRemetente)}</cnpjRemetente></urn:cotar></soapenv:Body></soapenv:Envelope>`;}
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
    const integ=await buscarIntegracao(tr.nome);if(!integ?.convite_id)return json(res,422,{ok:false,erro:`Integração SSW não localizada para ${tr.nome}.`});
    const ambiente=String(integ.ambiente_atual||'producao').toLowerCase()==='homologacao'?'homologacao':'producao';
    const cred=await obterCredenciaisIntegracao(integ.convite_id,ambiente);
    const dominio=String(cred.ssw_dominio||cred.dominio||'').trim().toUpperCase();
    const login=String(cred.ssw_login||cred.login||cred.usuario||'').trim();
    const senha=String(cred.ssw_senha||cred.senha||'').trim();
    if(!dominio||!login||!senha)return json(res,422,{ok:false,erro:`Cadastre Domínio SSW, Login e Senha WebService de ${tr.nome} no Portal de Integrações.`});
    const cepOrigem=String(b.cep_origem||'74550470').replace(/\D/g,'');const cepDestino=String(b.cep_destino||'').replace(/\D/g,'');
    const cnpjPagador=String(b.cnpj_pagador||'').replace(/\D/g,'');const cnpjDest=String(b.cnpj_destinatario||'').replace(/\D/g,'');const cnpjRem=String(b.cnpj_remetente||'05451985000195').replace(/\D/g,'');
    if(cepOrigem.length!==8||cepDestino.length!==8)return json(res,422,{ok:false,erro:'CEP origem/destino inválido para cotação SSW.'});
    if(cnpjPagador.length!==14)return json(res,422,{ok:false,erro:'O SSW exige CNPJ pagador com 14 dígitos para esta cotação.'});
    const quantidade=Math.max(1,Number(b.quantidade||1)||1);const peso=Math.max(0,numero(b.peso));
    const volInformado=Math.max(0,numero(b.volume));const volume=volInformado||volumeM3(b.medidas,quantidade);
    if(!peso&&!volume)return json(res,422,{ok:false,erro:'Informe peso ou medidas/volume para cotação SSW.'});
    const mercadoria=Number(cred.ssw_codigo_mercadoria||b.mercadoria_codigo||1)||1;
    const dados=await chamarSoap({dominio,login,senha,cnpjPagador,cepOrigem:Number(cepOrigem),cepDestino:Number(cepDestino),valorNF:numero(b.valor_nf),quantidade,peso,volume,mercadoria,cnpjDestinatario:cnpjDest,coletar:String(b.coletar||'S').toUpperCase().startsWith('S')?'S':'N',cnpjRemetente:cnpjRem});
    return json(res,200,{ok:true,transportadora:tr.nome,valor:dados.valor,prazo:dados.prazo,mensagem:dados.mensagem,alerta:dados.erro===1,detalhes:dados.detalhes,metodo:'SSW sswCotacao.cotar'});
  }catch(e){console.error('cotar-ssw:',e);return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
