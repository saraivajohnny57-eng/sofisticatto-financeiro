// Regras compartilhadas para validar a identidade e o evento do rastreamento SSW.
// Não usar o resultado de uma nota fiscal para atualizar outra remessa.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const digits=v=>String(v??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
const text=v=>norm(v).replace(/[^a-z0-9]+/g,' ').trim();
function validarDocumentoSSW(resposta,registro){
  const docs=[];
  if(resposta?.documento)docs.push(resposta.documento);
  if(Array.isArray(resposta?.documentos))docs.push(...resposta.documentos.map(x=>x?.documento||x));
  if(resposta?.header)docs.push(resposta);
  const nfEsperada=digits(registro?.numero_nfe);
  const chaveEsperada=digits(registro?.chave_nfe);
  const clienteEsperado=text(registro?.parceiro_nome);
  const identidades=docs.map(d=>{
    const h=d?.header||d||{};
    return {
      nf:digits(h.nro_nf||h.numero_nf||h.numeroNf||h.numeroNFe||h.nNF),
      chave:digits(h.chave_nfe||h.chaveNFe||h.chave||d?.chave_nfe||d?.chaveNFe),
      cliente:text(h.destinatario||h.nome_destinatario||h.nomeDestinatario)
    };
  }).filter(x=>x.nf||x.chave||x.cliente);
  const dif=identidades.find(x=>{
    const nfConfere=Boolean(nfEsperada&&x.nf&&nfEsperada===x.nf);
    const chaveConfere=Boolean(chaveEsperada.length===44&&x.chave.length===44&&chaveEsperada===x.chave);
    const clienteConfere=Boolean(clienteEsperado&&x.cliente&&
      (clienteEsperado.startsWith(x.cliente)||x.cliente.startsWith(clienteEsperado)));
    // A NF ou chave exata prevalece sobre diferenças entre razão social e nome fantasia.
    // A NF 51146 nunca pode aceitar um retorno da NF 51127.
    return (nfEsperada&&x.nf&&nfEsperada!==x.nf) ||
      (chaveEsperada.length===44&&x.chave.length===44&&chaveEsperada!==x.chave) ||
      (!nfConfere&&!chaveConfere&&clienteEsperado&&x.cliente&&x.cliente.length>=7&&
        clienteEsperado.length>=7&&!clienteConfere);
  });
  if(dif || identidades.length>1){
    return {ok:false,codigo:'SSW_DOCUMENTO_DIVERGENTE',
      motivo:'O SSW retornou NF, chave ou destinatário diferente da remessa, ou múltiplos documentos. Nenhum status foi atualizado.'};
  }
  return {ok:true,identidadeConferida:identidades.length>0,numeroNfe:identidades[0]?.nf||null};
}
function statusSSW(titulo,detalhe=''){
  const tituloNorm=text(titulo), s=text([titulo,detalhe].filter(Boolean).join(' '));
  if(!s)return null;
  // "Saiu para entrega" e "previsão de entrega" não são prova de entrega.
  if(/nao entregue|entrega nao realizada|tentativa de entrega|entrega nao concluida|insucesso|devolu|recusa|extravi/.test(s))return'ocorrencia';
  if(/saiu.{0,20}(para )?entrega|saida.{0,20}(para )?entrega|em rota de entrega|rota de entrega|veiculo em entrega|carteiro saiu/.test(s))return'saiu_entrega';
  if(/\bentregue\b|\bentregues\b|entrega realizada|entrega efetivada|entrega efetuada|entrega concluida|mercadoria entregue|objeto entregue|ctrc entregue|baixa realizada|recebido pelo destinatario/.test(tituloNorm) ||
     (/\bentregue\b|\bentregues\b|entrega realizada|entrega efetivada|entrega efetuada|entrega concluida|mercadoria entregue|objeto entregue|ctrc entregue|baixa realizada|recebido pelo destinatario/.test(s) &&
     !/previsao de entrega|previsao para entrega|previsao.*entreg|data prevista/.test(s)))return'entregue';
  if(/saida de unidade|saida da unidade|transferencia|em transito|em viagem|encaminhad|deslocamento|carregada no veiculo|coleta realizada|mercadoria coletad/.test(s))return'em_transito';
  if(/chegada.*unidade|entrada.*unidade|na filial|unidade destino|recebid.*unidade|centro de distribuicao/.test(s))return'na_filial';
  if(/cancelad/.test(s))return'cancelado';
  if(/ocorrenc|sinistro|ausente|endereco incorreto|avaria/.test(s))return'ocorrencia';
  if(/documento.*emitido|ct.e autorizado|coleta solicitada|aguardando coleta/.test(s))return'aguardando_coleta';
  return null;
}
function confirmaColetaSSW(titulo,detalhe=''){
  const s=text([titulo,detalhe].filter(Boolean).join(' '));
  // Registros reais da transportadora usam "mercadoria recebida" (feminino),
  // além de "recebido pela transportadora". A confirmação precisa ser uma
  // ocorrência logística, nunca mero documento/CT-e emitido ou previsão.
  return /coleta realizada|carregada no veiculo|mercadoria coletad|saida de unidade|saida da unidade|chegada.*unidade|entrada.*unidade|em transferencia|em transito|recebid[ao] pela transportadora|mercadoria recebida pela transportadora|recebid[ao].{0,60}unidade|saiu.{0,20}entrega|entregue ao destinatario|entrega realizada/.test(s)
    && !/nao coletad|nao recebida|nao recebido|nao entregue|tentativa de entrega|previsao|previsto|prevista|documento.*emitido|ct.?e autorizado|coleta solicitada|aguardando coleta|cancelad/.test(s);
}

function extrairPrevisaoEntregaSSW(dados){
  const candidatos=[
    dados?.previsaoEntrega,dados?.previsao_entrega,dados?.dataPrevisaoEntrega,
    dados?.documento?.previsaoEntrega,dados?.documento?.previsao_entrega,
    dados?.documento?.header?.previsaoEntrega,dados?.documento?.header?.previsao_entrega
  ];
  const documentos=[dados?.documento,...(Array.isArray(dados?.documentos)?dados.documentos:[])].filter(Boolean);
  for(const doc of documentos){
    for(const item of [...(Array.isArray(doc?.tracking)?doc.tracking:[]),...(Array.isArray(doc?.documento?.tracking)?doc.documento.tracking:[])]){
      const descricao=String(item?.descricao||item?.complemento||'');
      const match=descricao.match(/previs[aã]o\s+(?:de\s+)?entrega\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i);
      if(match)candidatos.push(match[1]);
    }
  }
  for(const candidato of candidatos){
    const v=String(candidato||'').trim();
    let ano,mes,dia;
    let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m){[,ano,mes,dia]=m;}
    else{m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)continue;[,dia,mes,ano]=m;if(ano.length===2)ano='20'+ano;}
    const iso=ano+'-'+mes.padStart(2,'0')+'-'+dia.padStart(2,'0');
    const obj=new Date(iso+'T12:00:00Z');
    if(!Number.isNaN(obj.getTime())&&obj.toISOString().slice(0,10)===iso)return iso;
  }
  return null;
}

module.exports={validarDocumentoSSW,statusSSW,confirmaColetaSSW,extrairPrevisaoEntregaSSW};
