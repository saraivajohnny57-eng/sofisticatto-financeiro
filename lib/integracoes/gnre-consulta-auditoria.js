'use strict';
// V523: evidencias completas de CONSULTA GNRE, sem nova emissao.
// XML integral cifrado no Financeiro02 (RLS + service role). Navegador recebe apenas inventario.
const crypto=require('node:crypto');
const {supabaseRest,criptografar}=require('./_utils');
const TABELA='gnre_consultas_auditoria';
function mascararMensagem(valor){
  return String(valor??'').replace(/[\r\n\t]+/g,' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/(?:\d[\s./-]?){11,50}/g,'[documento]')
    .slice(0,220);
}
function inventariar(xml){
  const bruto=String(xml||''), nomes=new Map(),codigos=new Map();
  for(const m of bruto.matchAll(/<(?!\/|!|\?)(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(?=[\s/>])/g)){
    const nome=m[1]; nomes.set(nome,(nomes.get(nome)||0)+1);
  }
  // Incluir campos nao previstos pelo parser: nome + quantidade; nenhum valor fiscal pessoal exposto.
  for(const m of bruto.matchAll(/<(?:[A-Za-z_][\w.-]*:)?(codigo|situacaoGuia|ambiente|tipoConsulta|versaoDados)\s*>\s*([A-Za-z0-9_.-]{1,28})\s*<\/(?:[A-Za-z_][\w.-]*:)?\1\s*>/gi)){
    const chave=m[1]+':'+m[2];codigos.set(chave,(codigos.get(chave)||0)+1);
  }
  const c=[...codigos].map(([chave,quantidade])=>({campo:chave.split(':')[0],valor:chave.split(':').slice(1).join(':'),quantidade}));
  return {
    tamanho_bytes:Buffer.byteLength(bruto,'utf8'),
    campos_e_quantidades:Object.fromEntries([...nomes].slice(0,180)),
    total_campos_distintos:nomes.size,
    codigos_e_situacoes:c.slice(0,80),
    soap_fault:/<(?:[A-Za-z_][\w.-]*:)?Fault(?:\s|>)/i.test(bruto),
    xml_escapado:/&lt;[A-Za-z]/i.test(bruto),
    pdf_presente:/<(?:[A-Za-z_][\w.-]*:)?pdfGuias\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?pdfGuias>/i.test(bruto),
    resultado_presente:/<(?:[A-Za-z_][\w.-]*:)?resultado(?:\s|>)/i.test(bruto),
    aviso:'Todas as tags, inclusive nao utilizadas, estao inventariadas; XML integral cifrado e restrito ao servidor.'
  };
}
async function guardar({tipo,http_status,xml,erro,duracao_ms}){
  const bruto=typeof xml==='string'?xml:'';
  const inventario={...inventariar(bruto),erro_transporte:erro?mascararMensagem(erro):null,sem_retorno_http:http_status==null};
  const resumo={salva:false,tipo_consulta:tipo,status_http:http_status??null,inventario};
  if(Buffer.byteLength(bruto,'utf8')>3100000){
    return {...resumo,erro_auditoria:'RESPOSTA_MAIOR_QUE_LIMITE_SEGURO'};
  }
  try{
    const dados={
      chave_idempotencia:'gnre:consulta:51185:'+tipo,
      numero_nfe:'51185',
      tipo_consulta:tipo,
      status_http:http_status??null,
      duracao_ms:duracao_ms??null,
      retorno_sha256:bruto?crypto.createHash('sha256').update(bruto).digest('hex'):null,
      inventario,
      resposta_cifrada:bruto?criptografar({xml:bruto}):null
    };
    const rows=await supabaseRest(TABELA,{method:'POST',body:dados});
    return {...resumo,salva:Array.isArray(rows)&&rows.length===1,
      id_auditoria:rows?.[0]?.id||null,
      sha256:dados.retorno_sha256,
      erro_auditoria:Array.isArray(rows)&&rows.length===1?null:'GRAVACAO_NAO_CONFIRMADA'};
  }catch(e){
    return {...resumo,erro_auditoria:'GRAVACAO_INDISPONIVEL',codigo:String(e?.code||'').slice(0,40)};
  }
}
module.exports={guardar,inventariar};
