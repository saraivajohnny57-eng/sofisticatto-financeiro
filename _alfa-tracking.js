function soNumeros(v){return String(v||"").replace(/\D/g,"");}
const URL="https://api.alfatransportes.com.br/rastreamento/v1.3/";

function dataIso(v){
  const s=String(v||"").trim(); if(!s)return null;
  const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if(br)return `${br[3]}-${br[2]}-${br[1]}${br[4]?`T${br[4]}:${br[5]}:00`:""}`;
  const alfa=s.match(/^(\d{4}-\d{2}-\d{2})\s*--\s*(\d{2}):(\d{2})/);
  if(alfa)return `${alfa[1]}T${alfa[2]}:${alfa[3]}:00`;
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{2}:\d{2})(?::\d{2})?)?/);
  if(iso)return iso[2]?`${iso[1]}T${iso[2]}:00`:iso[1];
  return null;
}

function montarOcorrencias(d){
  const itens=[];
  const extras=Array.isArray(d?.ocorrenciasExtras)?d.ocorrenciasExtras:[];
  extras.forEach((e,i)=>itens.push({
    tipo:"ocorrencia",
    codigo:e?.codigoOcorrencia??null,
    descricao:String(e?.descricaoOcorrencia||"Ocorrência Alfa").trim(),
    data:dataIso(e?.dataOcorrencia),
    ordem:i
  }));

  const emb=Array.isArray(d?.dadosEmbarque)?d.dadosEmbarque:[];
  emb.forEach((e,i)=>{
    const cidadeOrigem=String(e?.cidadeOrigem||"").trim();
    const cidadeDestino=String(e?.cidadeDestino||"").trim();
    const dataChegada=dataIso(e?.horaChegada);
    const dataSaida=dataIso(e?.horaSaida);
    const descricao=`Em trânsito: ${cidadeOrigem||"origem"} → ${cidadeDestino||"destino"}`;
    itens.push({
      tipo:"embarque",
      codigo:e?.codigoViagem??null,
      descricao,
      cidadeOrigem,
      cidadeDestino,
      data:dataChegada||dataSaida,
      horaChegada:dataChegada,
      horaSaida:dataSaida,
      ordem:i
    });
  });

  if(d?.dadosEntrega?.dataEntrega){
    itens.push({
      tipo:"entrega",
      codigo:null,
      descricao:"ENTREGA REALIZADA",
      data:dataIso(d.dadosEntrega.dataEntrega),
      recebedor:d.dadosEntrega.recebedorMercadoria||null,
      comprovanteUrl:d.dadosEntrega.urlComprovante||null,
      ordem:itens.length
    });
  }

  return itens
    .filter(x=>x.descricao)
    .sort((a,b)=>{
      const da=a.data?Date.parse(a.data):0;
      const db=b.data?Date.parse(b.data):0;
      return db-da||((b.ordem||0)-(a.ordem||0));
    })
    .map(({ordem,...x})=>x);
}

function ultimaOcorrencia(d){
  const ocorrencias=montarOcorrencias(d);
  if(ocorrencias.length){
    const e=ocorrencias[0];
    return {texto:e.descricao,data:e.data,ocorrencia:e};
  }
  return {texto:"Mercadoria localizada na Alfa Transportes",data:null,ocorrencia:null};
}

function normalizarStatus(d){
  if(d?.dadosEntrega?.dataEntrega)return "entregue";
  const oc=ultimaOcorrencia(d).texto.toUpperCase();
  if(/SA[IÍ]U.*(ENTREGA|ROTA)|ENTREGA.*(ROTA|SA[IÍ]U)|EM ROTA|EM ENTREGA/.test(oc))return "saiu_entrega";
  if(/ENTREGUE|ENTREGA REALIZADA|ENTREGA EFETUADA|FINALIZAD/.test(oc))return "entregue";
  if(/OCORR|RECUSA|AVARIA|SINISTRO|DEVOLU|ENDERECO NAO|DESTINATARIO AUSENTE/.test(oc))return "ocorrencia";
  if(/FILIAL|UNIDADE|AGENCIA|TERMINAL|TRANSBORDO/.test(oc))return "na_filial";
  return "em_transito";
}

async function consultarAlfa({numeroNfe,cnpj}){
  const chave=String(process.env.ALFA_API_KEY||"").trim();
  if(!chave)throw new Error("ALFA_API_KEY não configurada na Vercel.");
  const nf=Number(soNumeros(numeroNfe));
  if(!nf)throw new Error("A Alfa exige o número da Nota Fiscal para rastreamento.");
  const payload={idr:chave,merNF:nf};
  const doc=soNumeros(cnpj); if(doc)payload.tomCnpj=doc;
  const r=await fetch(URL,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify(payload)});
  const texto=await r.text(); let d={};
  try{d=texto?JSON.parse(texto):{}}catch{d={raw:texto}}
  const codigo=Number(d?.status||0);
  if(!r.ok||codigo!==2){
    const msg=d?.nome||d?.message||d?.mensagem||({1:"Rastreamento não concluído.",3:"Falha de conexão na Alfa.",4:"Falta identificação do remetente.",5:"Falha ao verificar identificação.",6:"Identificação não encontrada.",7:"Falha ao recuperar os dados da NF.",8:"Número da NF não informado.",9:"NF não encontrada neste CNPJ."}[codigo])||`Alfa retornou código ${codigo||r.status}.`;
    const e=new Error(msg);e.httpStatus=r.ok?404:r.status;e.resposta=d;throw e;
  }

  const oc=ultimaOcorrencia(d);
  const status=normalizarStatus(d);
  const ocorrencias=montarOcorrencias(d);
  return {
    status,
    statusBruto:oc.texto,
    numeroCte:String(d?.dadosCte?.numeroCte||"")||null,
    previsaoEntrega:dataIso(d?.dadosCte?.dataPrivista)?.slice(0,10)||null,
    ultimaOcorrencia:oc.texto,
    ultimaOcorrenciaEm:oc.data,
    ocorrencias,
    comprovanteUrl:d?.dadosEntrega?.urlComprovante||null,
    recebedor:d?.dadosEntrega?.recebedorMercadoria||null,
    dataEntrega:dataIso(d?.dadosEntrega?.dataEntrega),
    metodoConsulta:"nota fiscal Alfa",
    valorConsultado:String(nf),
    dados:d
  };
}

module.exports={consultarAlfa,montarOcorrencias};
