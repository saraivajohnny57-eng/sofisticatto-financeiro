const {gerarToken,configuracaoEfetiva,buscarCepPorEndereco}=require('./_correios');

function txt(v){return String(v??'').trim();}
function dig(v){return txt(v).replace(/\D/g,'');}
function num(v){const n=Number(String(v??'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;}
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
  // Fallback seguro usado pela Sofisticatto.
  return {ddd:'62',numero:'32930035'};
}
function pessoa({nome,cpfCnpj,telefone:tel,email,endereco}){
  const t=telefone(tel); const e=endereco||{};
  const obj={
    nome:txt(nome).slice(0,80), cpfCnpj:dig(cpfCnpj),
    dddTelefone:t.ddd, telefone:t.numero, email:txt(email).slice(0,80),
    endereco:{
      cep:dig(e.cep), logradouro:txt(e.logradouro).slice(0,100), numero:txt(e.numero||'S/N').slice(0,10),
      complemento:txt(e.complemento).slice(0,50), bairro:txt(e.bairro).slice(0,50), cidade:txt(e.cidade).slice(0,50), uf:txt(e.uf).toUpperCase().slice(0,2)
    }
  };
  if(!obj.email)delete obj.email;
  if(!obj.cpfCnpj)delete obj.cpfCnpj;
  return obj;
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
      email:b.remetente?.email||process.env.CORREIOS_REMETENTE_EMAIL||'',
      endereco:{
        cep:b.remetente?.cep||c.cepOrigem||'74550470',
        logradouro:b.remetente?.logradouro||process.env.CORREIOS_REMETENTE_LOGRADOURO||'Rua 03',
        numero:b.remetente?.numero||process.env.CORREIOS_REMETENTE_NUMERO||'217',
        complemento:b.remetente?.complemento||process.env.CORREIOS_REMETENTE_COMPLEMENTO||'Qd.35, Lt.14E',
        bairro:b.remetente?.bairro||process.env.CORREIOS_REMETENTE_BAIRRO||'Vila Abajá', cidade:remCU.cidade||'Goiânia',uf:remCU.uf||'GO'
      }
    });
    if(!/^\d{2}$/.test(remetente.dddTelefone) || !/^\d{8,9}$/.test(remetente.telefone)){
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
    const base={
      idCorreios:c.usuario,numeroCartaoPostagem:c.cartao||undefined,codigoServico:codigo,
      codigoFormatoObjetoInformado:'2',pesoCubico:0,pesoInformado:peso,
      comprimentoInformado:dm.comprimento,alturaInformada:dm.altura,larguraInformada:dm.largura,diametroInformado:0,
      precoPostagem:0,precoPrePostagem:0,cienteObjetoNaoProibido:'1',modalidadePagamento:'2',solicitarColeta:'N',
      // Envio comum por padrão: NÃO adiciona o serviço 095 (Artigos Perigosos ANAC / restrição aérea).
      // Os Correios orientam informar o 095 somente quando o conteúdo realmente possuir restrição para transporte aéreo.
      // listaServicoAdicional fica ausente, em vez de enviar 095 automaticamente.
      remetente,destinatario
    };
    // O 095 (Artigos Perigosos ANAC / restrição aérea) só é enviado após escolha explícita
    // no balão da pré-postagem. PAC/SEDEX por si só nunca ativa essa marcação.
    const adicionaisEntrada=Array.isArray(b.listaServicoAdicional)?b.listaServicoAdicional:[];
    const restricaoAereaConfirmada=b.restricaoAereaConfirmada===true;
    const adicionaisSeguros=adicionaisEntrada.filter(x=>{
      const cod=dig(x?.codigoServicoAdicional ?? x);
      return cod!=='095' || restricaoAereaConfirmada;
    });
    if(restricaoAereaConfirmada && !adicionaisSeguros.some(x=>dig(x?.codigoServicoAdicional ?? x)==='095')) adicionaisSeguros.push({codigoServicoAdicional:'095'});
    if(adicionaisSeguros.length) base.listaServicoAdicional=adicionaisSeguros;
    let payload;
    if(chave.length===44){
      payload={...base,tipoDocumento:'NF',numeroNotaFiscal:nf||undefined,chaveNFe:chave};
    }else{
      payload={...base,tipoDocumento:'DC',emiteDCe:'S',itensDeclaracaoConteudo:[{conteudo:mercadoria,descricao:mercadoria,quantidade:1,valor,pesoLiquidoGrama:peso}]};
    }
    Object.keys(payload).forEach(k=>payload[k]===undefined&&delete payload[k]);
    let d;
    async function postarComCompatibilidade(p){
      try{return {d:await postPre(p),payload:p};}catch(e){
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
    return res.status(200).json({ok:true,idPrePostagem:id,codigoObjeto,codigoServico:codigo,servico:(c.servicosDetalhes||[]).find(x=>String(x.codigo)===codigo)?.descricao||codigo,cepOriginal,cepUtilizado:destinatario.endereco.cep,cepFallback,raw:d});
  }catch(e){return res.status(Number(e.httpStatus)||500).json({ok:false,erro:e.message,resposta:e.resposta||null});}
};
