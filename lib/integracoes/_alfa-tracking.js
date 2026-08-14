function soNumeros(v){return String(v||"").replace(/\D/g,"");}
const URL="https://api.alfatransportes.com.br/rastreamento/v1.3/";

function dataIso(v){
  const s=String(v||"").trim(); if(!s)return null;
  const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if(br)return `${br[3]}-${br[2]}-${br[1]}${br[4]?`T${br[4]}:${br[5]}:00`:""}`;
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{2}:\d{2})(?::\d{2})?)?/);
  if(iso)return iso[2]?`${iso[1]}T${iso[2]}:00`:iso[1];
  return null;
}
function ultimaOcorrencia(d){
  const extras=Array.isArray(d?.ocorrenciasExtras)?d.ocorrenciasExtras:[];
  if(extras.length){
    const e=extras[extras.length-1];
    return {texto:e.descricaoOcorrencia||"Ocorrência Alfa",data:dataIso(e.dataOcorrencia)};
  }
  const emb=Array.isArray(d?.dadosEmbarque)?d.dadosEmbarque:[];
  if(emb.length){
    const e=emb[emb.length-1];
    return {texto:`Em trânsito: ${e.cidadeOrigem||""} → ${e.cidadeDestino||""}`.replace(/\s+/g," ").trim(),data:dataIso(e.horaChegada||e.horaSaida)};
  }
  return {texto:"Mercadoria localizada na Alfa Transportes",data:null};
}
function normalizarStatus(d){
  if(d?.dadosEntrega?.dataEntrega)return "entregue";
  const oc=ultimaOcorrencia(d).texto.toUpperCase();
  if(/ENTREG/.test(oc)&&/SAI|ROTA|RUA/.test(oc))return "saiu_entrega";
  if(/ENTREGUE|ENTREGA REALIZADA|ENTREGA EFETUADA|FINALIZAD/.test(oc))return "entregue";
  if(/OCORR|RECUSA|AVARIA|SINISTRO|DEVOLU|ENDERECO NAO|DESTINATARIO AUSENTE/.test(oc))return "ocorrencia";
  if(/FILIAL|UNIDADE|AGENCIA|TERMINAL/.test(oc))return "na_filial";
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
  return {
    status,statusBruto:d?.dadosEntrega?.dataEntrega?"ENTREGUE":oc.texto,
    numeroCte:String(d?.dadosCte?.numeroCte||"")||null,
    previsaoEntrega:dataIso(d?.dadosCte?.dataPrivista)?.slice(0,10)||null,
    ultimaOcorrencia:oc.texto,ultimaOcorrenciaEm:oc.data,
    comprovanteUrl:d?.dadosEntrega?.urlComprovante||null,
    recebedor:d?.dadosEntrega?.recebedorMercadoria||null,
    dataEntrega:dataIso(d?.dadosEntrega?.dataEntrega),
    metodoConsulta:"nota fiscal Alfa",valorConsultado:String(nf),dados:d
  };
}
module.exports={consultarAlfa};
