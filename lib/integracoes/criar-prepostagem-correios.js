const {gerarToken,configuracaoEfetiva,buscarCepPorEndereco,listarPrepostagens,listaPrepostResposta,valorProfundo}=require('./_correios');

function txt(v){return String(v??'').trim();}
function dig(v){return txt(v).replace(/\D/g,'');}
function num(v){
  // V122: valores numéricos vindos do JSON já usam ponto como separador decimal.
  // A rotina anterior removia TODOS os pontos; assim 13.625 kg virava 13625 kg,
  // fazendo os Correios recusarem o objeto por excesso de peso.
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let s=String(v??'').trim().replace(/\s/g,'');
  if(!s)return 0;
  if(s.includes(',')&&s.includes('.')){
    s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  }else if(s.includes(',')){
    s=s.replace(',','.');
  }
  const n=Number(s.replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
}
function cidadeUf(v,ufSeparada){
  const s=txt(v); const uf=txt(ufSeparada).toUpperCase();
  if(uf)return {cidade:s.replace(/\s*[\/-]\s*[A-Z]{2}\s*$/i,'').trim(),uf};
  const m=s.match(/^(.*?)[\/-]\s*([A-Z]{2})\s*$/i);
  return m?{cidade:m[1].trim(),uf:m[2].toUpperCase()}:{cidade:s,uf:''};
}
function dimensoes(v){
  const a=String(v||'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)?.map(Number)||[];
  let [x,y,z]=a.length>=3?a:[38,29,35];
  // O portal costuma guardar 0,38 x 0,29 x 0,35 (metros); API espera cm.
  const conv=n=>n>0&&n<=3?n*100:n;
  [x,y,z]=[conv(x),conv(y),conv(z)].map(n=>Math.max(1,Math.round(n||1)));
  return {comprimento:x,largura:y,altura:z};
}
function telefone(v){
  let d=dig(v);
  // Aceita telefone brasileiro com ou sem DDI 55.
  if((d.length===12 || d.length===13) && d.startsWith('55')) d=d.slice(2);
  // Fixo: DDD (2) + número (8). Celular: DDD (2) + número (9).
  if(d.length===10 || d.length===11){
    return {ddd:d.slice(0,2),numero:d.slice(2)};
  }
  // Telefone do destinatário é opcional nos Correios. Não inventamos um número
  // quando o cadastro está vazio/incompleto, pois a API pode rejeitar o fallback.
  return null;
}
function pessoa({nome,cpfCnpj,telefone:tel,email,endereco,telefoneFallback}){
  let t=telefone(tel);
  if(!t && telefoneFallback) t=telefone(telefoneFallback);
  const e=endereco||{};
  const obj={
    nome:txt(nome).slice(0,80), cpfCnpj:dig(cpfCnpj),
    email:txt(email).slice(0,80),
    endereco:{
      cep:dig(e.cep), logradouro:txt(e.logradouro).slice(0,100), numero:txt(e.numero||'S/N').slice(0,10),
      complemento:txt(e.complemento).slice(0,50), bairro:txt(e.bairro).slice(0,50), cidade:txt(e.cidade).slice(0,50), uf:txt(e.uf).toUpperCase().slice(0,2)
    }
  };
  if(t){ obj.dddTelefone=t.ddd; obj.telefone=t.numero; }
  if(!obj.email)delete obj.email;
  if(!obj.cpfCnpj)delete obj.cpfCnpj;
  return obj;
}
async function consultarRegistroPrepostagem({id,codigoObjeto}){
  const alvoId=txt(id);
  const alvoCodigo=txt(codigoObjeto).toUpperCase();
  const tentativas=[];
  // A consulta oficial /v2/prepostagens é a fonte de verdade do que ficou gravado
  // nos Correios. Fazemos pequenas tentativas porque a criação pode levar alguns
  // instantes para aparecer na listagem.
  for(let rodada=1;rodada<=3;rodada++){
    for(const status of ['PREPOSTADO','PREATENDIDO','POSTADO']){
      try{
        const resp=await listarPrepostagens({status,tipoObjeto:'REGISTRADO',page:0,size:100});
        const itens=listaPrepostResposta(resp);
        const item=itens.find(x=>{
          const rid=txt(valorProfundo(x,['id','idPrePostagem','prePostagemId']));
          const rcod=txt(valorProfundo(x,['codigoObjeto','codObjeto','codigoRastreio','eticket'])).toUpperCase();
          return (alvoId&&rid===alvoId)||(alvoCodigo&&rcod===alvoCodigo);
        });
        tentativas.push({rodada,status,total:itens.length,encontrado:Boolean(item)});
        if(item)return {encontrado:true,status,item,tentativas};
      }catch(e){tentativas.push({rodada,status,erro:String(e?.message||e).slice(0,240)});}
    }
    if(rodada<3)await new Promise(r=>setTimeout(r,500*rodada));
  }
  return {encontrado:false,tentativas};
}

async function postPre(payload){
  const token=await gerarToken('cartao');
  const r=await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Language':'pt-BR','Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  const raw=await r.text(); let d={}; try{d=raw?JSON.parse(raw):{}}catch{d={texto:raw}};
  if(!r.ok)throw Object.assign(new Error(d.mensagem||d.message||d.erro||d.msgs?.[0]||`Correios HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
  return d;
}
module.exports=async function handler(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({ok:false,erro:'Use POST.'});
    const b=req.body||{}; const c=await configuracaoEfetiva();
    const codigo=dig(b.codigoServico).slice(0,5);
    const permitidos=new Set((c.servicos||[]).map(String));
    if(!/^\d{5}$/.test(codigo))return res.status(400).json({ok:false,erro:'Informe o serviço Correios selecionado na cotação (ex.: 03298 PAC CONTRATO AG).'});
    if(permitidos.size && !permitidos.has(codigo))return res.status(400).json({ok:false,erro:`O serviço ${codigo} não está na lista CONTRATO AG ativa do cartão.`});
    const peso=Math.max(1,Math.round(num(b.pesoKg)*1000||num(b.pesoGramas)||1));
    const dm=dimensoes(b.medidas);
    const destCU=cidadeUf(b.destino?.cidade,b.destino?.uf);
    const remCU=cidadeUf(b.remetente?.cidade||'Goiânia',b.remetente?.uf||'GO');
    const remetente=pessoa({
      nome:b.remetente?.nome||process.env.CORREIOS_REMETENTE_NOME||'SOFISTICATTO COSMÉTICOS',
      cpfCnpj:b.remetente?.cpfCnpj||c.cnpj,
      telefone:b.remetente?.telefone||process.env.CORREIOS_REMETENTE_TELEFONE||'(62) 3293-0035',
      telefoneFallback:'(62) 3293-0035',
      email:b.remetente?.email||process.env.CORREIOS_REMETENTE_EMAIL||'',
      endereco:{
        cep:b.remetente?.cep||c.cepOrigem||'74550470',
        logradouro:b.remetente?.logradouro||process.env.CORREIOS_REMETENTE_LOGRADOURO||'Rua 03',
        numero:b.remetente?.numero||process.env.CORREIOS_REMETENTE_NUMERO||'217',
        complemento:b.remetente?.complemento||process.env.CORREIOS_REMETENTE_COMPLEMENTO||'Qd.35, Lt.14E',
        bairro:b.remetente?.bairro||process.env.CORREIOS_REMETENTE_BAIRRO||'Vila Abajá', cidade:remCU.cidade||'Goiânia',uf:remCU.uf||'GO'
      }
    });
    if(!/^\d{2}$/.test(remetente.dddTelefone||'') || !/^\d{8,9}$/.test(remetente.telefone||'')){
      return res.status(400).json({ok:false,erro:`Telefone do remetente inválido para os Correios. DDD: ${remetente.dddTelefone||'-'} / número: ${remetente.telefone||'-'}. Configure no formato (62) 3293-0035 ou (62) 99999-9999.`});
    }
    let destinatario=pessoa({
      nome:b.destino?.nome,cpfCnpj:b.destino?.cpfCnpj,telefone:b.destino?.telefone,email:b.destino?.email,
      endereco:{cep:b.destino?.cep,logradouro:b.destino?.logradouro,numero:b.destino?.numero,complemento:b.destino?.complemento,bairro:b.destino?.bairro,cidade:destCU.cidade,uf:destCU.uf}
    });
    const cepOriginal=destinatario.endereco.cep;
    let cepFallback=null;
    async function tentarCepEspecifico(){
      const busca=await buscarCepPorEndereco({uf:destinatario.endereco.uf,localidade:destinatario.endereco.cidade,bairro:destinatario.endereco.bairro,logradouro:destinatario.endereco.logradouro,endereco:[destinatario.endereco.logradouro,destinatario.endereco.numero].filter(Boolean).join(', ')});
      if(busca?.encontrado && busca.cep && busca.cep!==destinatario.endereco.cep){
        cepFallback={...busca,cepOriginal,cepUtilizado:busca.cep};
        destinatario={...destinatario,endereco:{...destinatario.endereco,cep:busca.cep}};
        return true;
      }
      return false;
    }
    if(/000$/.test(destinatario.endereco.cep)){
      try{await tentarCepEspecifico();}catch(e){console.warn('Fallback CEP pré-postagem:',e.message);}
    }
    const faltam=[];
    if(destinatario.endereco.cep.length!==8)faltam.push('CEP'); if(!destinatario.endereco.logradouro)faltam.push('logradouro'); if(!destinatario.endereco.bairro)faltam.push('bairro'); if(!destinatario.endereco.cidade)faltam.push('cidade'); if(destinatario.endereco.uf.length!==2)faltam.push('UF'); if(!destinatario.nome)faltam.push('nome do destinatário');
    if(faltam.length)return res.status(400).json({ok:false,erro:'Complete os dados do destinatário antes da pré-postagem: '+faltam.join(', ')+'.'});
    const chave=dig(b.chaveNFe); const nf=dig(b.numeroNf);
    const valor=Math.max(0.01,num(b.valorNf)||0.01); const mercadoria=txt(b.mercadoria)||'Cosméticos';
    // V127 — espelha a declaração de risco da tela oficial dos Correios:
    // 095 é EXCLUSIVO para Artigos Perigosos ANAC / objeto com restrição aérea.
    // A escolha do usuário é tratada de forma binária e explícita:
    //   pode avião     => listaServicoAdicional: []
    //   não pode avião => listaServicoAdicional: [{ codigoServicoAdicional: '095' }]
    // Assim não existe herança/ambiguidade no payload enviado aos Correios.
    const restricaoAereaConfirmada=b.restricaoAereaConfirmada===true;
    const cienteObjetoNaoProibido=b.cienteObjetoNaoProibido!==false;
    if(!cienteObjetoNaoProibido)return res.status(400).json({ok:false,erro:'Confirme que não está enviando objeto proibido no fluxo postal.'});
    const adicionaisEntrada=Array.isArray(b.listaServicoAdicional)?b.listaServicoAdicional:[];
    const adicionaisSeguros=adicionaisEntrada.filter(x=>{
      const cod=dig(x?.codigoServicoAdicional ?? x);
      // Nunca aceite 095 vindo do front quando a escolha explícita foi "pode avião".
      return cod && cod!=='095';
    });
    if(restricaoAereaConfirmada) adicionaisSeguros.push({codigoServicoAdicional:'095'});

    const base={
      idCorreios:c.usuario,numeroCartaoPostagem:c.cartao||undefined,codigoServico:codigo,
      codigoFormatoObjetoInformado:'2',pesoCubico:0,pesoInformado:peso,
      comprimentoInformado:dm.comprimento,alturaInformada:dm.altura,larguraInformada:dm.largura,diametroInformado:0,
      precoPostagem:0,precoPrePostagem:0,cienteObjetoNaoProibido:'1',modalidadePagamento:'2',solicitarColeta:'N',logisticaReversa:'N',
      remetente,destinatario
    };
    // V129: quando NÃO há risco aéreo, omitimos completamente listaServicoAdicional.
    // O diagnóstico V128 mostrou que enviar [] fazia o registro persistido pelos Correios
    // aparecer com 095 mesmo sem o portal tê-lo enviado. Para risco confirmado, enviamos 095.
    if(adicionaisSeguros.length) base.listaServicoAdicional=adicionaisSeguros;
    const baseFinal=base;
    let payload;
    // V129: preserva cada item da declaração informado no portal.
    // Antes o backend condensava tudo em um único item genérico (ex.: "COSMÉTICOS").
    const itensEntrada=Array.isArray(b.itensDeclaracaoConteudo)?b.itensDeclaracaoConteudo:(Array.isArray(b.itens)?b.itens:[]);
    let itensDeclaracao=itensEntrada.map((x,i)=>{
      const descricao=txt(x?.descricao??x?.conteudo).slice(0,100);
      const quantidade=Math.max(1,Math.round(num(x?.quantidade)||1));
      const valorItem=Math.max(0.01,num(x?.valor??x?.valorUnitario)||0.01);
      const pesoItem=Math.max(1,Math.round(num(x?.pesoLiquidoGrama)||Math.max(1,Math.floor(peso/Math.max(1,itensEntrada.length)))));
      return descricao?{conteudo:descricao,descricao,quantidade,valor:valorItem,pesoLiquidoGrama:pesoItem}:null;
    }).filter(Boolean);
    if(!itensDeclaracao.length){
      itensDeclaracao=[{conteudo:mercadoria,descricao:mercadoria,quantidade:1,valor,pesoLiquidoGrama:peso}];
    }
    if(chave.length===44){
      payload={...baseFinal,tipoDocumento:'NF',numeroNotaFiscal:nf||undefined,chaveNFe:chave,itensDeclaracaoConteudo:itensDeclaracao};
    }else{
      payload={...baseFinal,tipoDocumento:'DC',emiteDCe:'S',itensDeclaracaoConteudo:itensDeclaracao};
    }
    Object.keys(payload).forEach(k=>payload[k]===undefined&&delete payload[k]);
    let d;
    async function postarComCompatibilidade(p){
      try{return {d:await postPre(p),payload:p};}catch(e){
        const msg=String(e?.message||'')+' '+JSON.stringify(e?.resposta||{});
        // Alguns cadastros antigos possuem telefone do destinatário incompleto ou em
        // formato não aceito pela Pré-postagem. Como o telefone é opcional, repetimos
        // a requisição sem ele em vez de bloquear a emissão da etiqueta.
        if(e.httpStatus===400 && /telefone do destinat[aá]rio|destinat[aá]rio.+telefone/i.test(msg) && p.destinatario){
          const pSemTelefone={...p,destinatario:{...p.destinatario}};
          delete pSemTelefone.destinatario.dddTelefone;
          delete pSemTelefone.destinatario.telefone;
          return {d:await postPre(pSemTelefone),payload:pSemTelefone};
        }
        if(e.httpStatus===400 && p.itensDeclaracaoConteudo){
          const p2={...p,declaracaoConteudo:p.itensDeclaracaoConteudo.map(x=>({descricao:x.descricao,quantidade:x.quantidade,valor:x.valor,pesoLiquidoGrama:x.pesoLiquidoGrama}))};
          delete p2.itensDeclaracaoConteudo; return {d:await postPre(p2),payload:p2};
        }
        throw e;
      }
    }
    try{const x=await postarComCompatibilidade(payload);d=x.d;payload=x.payload;}
    catch(e){
      const msg=String(e?.message||'')+' '+JSON.stringify(e?.resposta||{});
      if(/CEP-003|CEP.+não foi encontrado|CEP.+nao foi encontrado/i.test(msg) && !cepFallback){
        const achou=await tentarCepEspecifico();
        if(achou){payload={...payload,destinatario};const x=await postarComCompatibilidade(payload);d=x.d;payload=x.payload;}
        else throw Object.assign(new Error(`O CEP ${cepOriginal} foi recusado pela pré-postagem e não foi possível localizar automaticamente um CEP específico para ${destinatario.endereco.logradouro}, ${destinatario.endereco.numero} - ${destinatario.endereco.cidade}/${destinatario.endereco.uf}. Atualize o CEP do cliente e tente novamente.`),{httpStatus:400,resposta:e.resposta});
      }else throw e;
    }
    const id=txt(d.id||d.idPrePostagem||d.prePostagemId); const codigoObjeto=txt(d.codigoObjeto||d.objeto?.codigo||d.codigoRastreio).toUpperCase();
    if(!id)throw Object.assign(new Error('Os Correios aceitaram a requisição, mas não retornaram o ID da pré-postagem.'),{resposta:d});
    const listaRetorno=Array.isArray(d?.listaServicoAdicional)?d.listaServicoAdicional:[];
    const retornoTem095=listaRetorno.some(x=>dig(x?.codigoServicoAdicional ?? x)==='095');
    const enviadoTem095=Array.isArray(payload.listaServicoAdicional)&&payload.listaServicoAdicional.some(x=>dig(x?.codigoServicoAdicional ?? x)==='095');
    const diagnosticoAereo={
      escolhaUsuario:restricaoAereaConfirmada?'NAO_PODE_AVIAO':'PODE_AVIAO',
      codigo095Enviado:enviadoTem095,
      listaServicoAdicionalEnviada:payload.listaServicoAdicional||[],
      campoListaServicoAdicionalOmitido:!Object.prototype.hasOwnProperty.call(payload,'listaServicoAdicional'),
      cienteObjetoNaoProibido:payload.cienteObjetoNaoProibido,
      codigo095Retornado:retornoTem095,
      listaServicoAdicionalRetornada:listaRetorno,
      objetoCargo:d?.objetoCargo??null,
      declaracaoRisco:restricaoAereaConfirmada?'SIM':'NAO',
      observacaoModal:'Espelhado da tela oficial: SIM = possui risco/095; NÃO = não põe em risco o transporte aéreo/sem 095.',
      coerente:restricaoAereaConfirmada?enviadoTem095:!enviadoTem095
    };
    // V128 — consulta a pré-postagem novamente nos Correios antes de liberar o diagnóstico.
    // Assim conseguimos comparar o POST enviado com o registro efetivamente persistido
    // pelo PPN, que é o registro usado posteriormente na geração do rótulo oficial.
    const registro=await consultarRegistroPrepostagem({id,codigoObjeto});
    const itemRegistro=registro?.item||null;
    const listaRegistro=Array.isArray(itemRegistro?.listaServicoAdicional)?itemRegistro.listaServicoAdicional:[];
    const registroTem095=listaRegistro.some(x=>dig(x?.codigoServicoAdicional ?? x)==='095');
    const objetoCargoRegistro=itemRegistro?valorProfundo(itemRegistro,['objetoCargo']):null;
    diagnosticoAereo.registroCorreios={
      consultado:true,
      encontrado:Boolean(registro?.encontrado),
      status:registro?.status||null,
      codigo095Gravado:registroTem095,
      listaServicoAdicionalGravada:listaRegistro,
      objetoCargo:objetoCargoRegistro??null,
      tentativas:registro?.tentativas||[]
    };
    diagnosticoAereo.divergenciaRegistro=Boolean(registro?.encontrado)&&(registroTem095!==enviadoTem095);
    diagnosticoAereo.conclusao=registro?.encontrado
      ? (diagnosticoAereo.divergenciaRegistro
          ? 'DIVERGENCIA: os Correios gravaram uma classificação diferente da enviada pelo portal.'
          : 'O registro dos Correios manteve a mesma presença/ausência do adicional 095 enviada pelo portal.')
      : 'Pré-postagem criada, mas ainda não apareceu na consulta /v2/prepostagens. O diagnóstico será mantido para conferência pelos logs.';
    console.log('[CORREIOS AEREO V129]',{id,codigoObjeto,...diagnosticoAereo});
    return res.status(200).json({ok:true,idPrePostagem:id,codigoObjeto,codigoServico:codigo,servico:(c.servicosDetalhes||[]).find(x=>String(x.codigo)===codigo)?.descricao||codigo,cepOriginal,cepUtilizado:destinatario.endereco.cep,cepFallback,diagnosticoAereo,registroCorreios:itemRegistro,raw:d});
  }catch(e){return res.status(Number(e.httpStatus)||500).json({ok:false,erro:e.message,resposta:e.resposta||null});}
};
