const {json,exigirAdmin,supabaseRest}=require("./_utils");

const URL="https://api.alfatransportes.com.br/cotacao/v1.2/";

function somenteNumeros(v){return String(v||"").replace(/\D/g,"");}
function numero(v){
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  const s=String(v||"").trim().replace(/\s/g,"");
  if(!s)return 0;
  if(s.includes(","))return Number(s.replace(/\./g,"").replace(",","."))||0;
  return Number(s)||0;
}
function m3DasMedidas(texto,volumes){
  const nums=String(texto||"").replace(/,/g,".").match(/\d+(?:\.\d+)?/g)||[];
  if(nums.length<3)return 0;
  const metros=nums.slice(0,3).map(v=>{
    const n=Number(v||0);
    if(!n)return 0;
    // até 3 = metros (ex.: 0,38); acima de 3 = centímetros (ex.: 38)
    return n<=3?n:n/100;
  });
  return Number((metros[0]*metros[1]*metros[2]*Math.max(1,Number(volumes||1))).toFixed(6));
}
function mensagemRetorno(codigo,descricao){
  const mapa={
    14:"A praça de destino é atendida por terceiro.",
    15:"A Alfa não atende esta praça de destino.",
    22:"Há dados incompletos no cadastro do CNPJ. A Alfa orienta contatar o vendedor responsável."
  };
  return mapa[Number(codigo)]||descricao||`A Alfa retornou o código ${codigo}.`;
}

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  const chave=String(process.env.ALFA_API_KEY||"").trim();
  if(!chave)return json(res,503,{ok:false,erro:"ALFA_API_KEY não configurada na Vercel."});

  const e=req.body||{};
  const doc=somenteNumeros(e.cpf_cnpj_destino);
  const cep=somenteNumeros(e.cep_destino);
  const peso=numero(e.peso_total);
  const valor=numero(e.valor_nf);
  const volumes=Math.max(1,Number(e.volumes||1));
  const m3=numero(e.m3)||m3DasMedidas(e.medidas,volumes);

  const faltam=[];
  if(![11,14].includes(doc.length))faltam.push("CPF/CNPJ do destinatário");
  if(cep.length!==8)faltam.push("CEP do destinatário");
  if(!(valor>0))faltam.push("valor da mercadoria");
  if(!(peso>0))faltam.push("peso");
  if(!(m3>0))faltam.push("medidas/cubagem");
  if(faltam.length)return json(res,422,{ok:false,codigo:"DADOS_INCOMPLETOS",erro:`Para cotar na Alfa, informe: ${faltam.join(", ")}.`});

  const hoje=new Date();
  const dt=`${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,"0")}${String(hoje.getDate()).padStart(2,"0")}`;
  const payload={
    idr:chave,
    cliTip:doc.length===14?1:2,
    cliCnpj:doc,
    cliCep:cep,
    merVlr:Number(valor.toFixed(2)),
    merPeso:Number(peso.toFixed(3)),
    merM3:m3,
    merVol:volumes,
    quim:0,
    dtEmbarque:dt,
    cepRem:"74550470",
    modoJson:1,
    cnpjRem:"05451985000195",
    zonaRural:e.zona_rural?1:0,
    tipoPagador:String(e.tipo_frete||"CIF").toUpperCase()==="FOB"?2:1
  };

  const inicio=Date.now();
  try{
    const r=await fetch(URL,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify(payload)});
    const texto=await r.text();
    let dados={};
    try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

    const codigo=Number(dados?.status?.numero??dados?.status??0);
    const descricao=dados?.status?.descricao||dados?.nome||dados?.message||dados?.mensagem||"";
    if(!r.ok || codigo!==1){
      return json(res,r.ok?422:r.status,{ok:false,codigo_api:codigo||null,erro:mensagemRetorno(codigo,descricao),resposta:dados});
    }

    const c=dados?.cotacao||{};
    const emissao=c?.emissao||{};
    const valores=emissao?.valoresCotacao||{};
    const numeroCotacao=c?.codigoCotacao||dados?.id||"";
    const valorTotal=Number(valores?.valorTotal||0);
    const prazo=String(emissao?.diasEntrega||"").trim();

    try{
      await supabaseRest("integracao_logs",{method:"POST",body:{
        transportadora_nome:"ALFA TRANSPORTES",operacao:"cotacao",ambiente:"producao",
        http_status:r.status,tempo_ms:Date.now()-inicio,sucesso:true,
        mensagem:`Cotação Alfa ${numeroCotacao||"concluída"}`,
        resposta_resumida:{numero_cotacao:numeroCotacao,valor_total:valorTotal,prazo,m3}
      }});
    }catch{}

    return json(res,200,{ok:true,numero_cotacao:numeroCotacao,valor_frete:valorTotal,prazo,
      prazo_dias:Number((prazo.match(/\d+/)||[])[0]||0)||null,
      detalhes_valores:{inicial:valores?.valorInicial||0,pedagio:valores?.valorPedagio||0,seguro:valores?.valorSeguro||0,taxa:valores?.valorTaxa||0,imposto:valores?.valorImposto||0},
      m3_enviado:m3,resposta:dados});
  }catch(err){
    return json(res,502,{ok:false,erro:`Falha de comunicação com a API de Cotação da Alfa: ${err.message}`});
  }
};
