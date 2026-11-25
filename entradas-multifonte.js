/* Entradas V524: conciliação de CT-e e consulta de fontes compatíveis.
 * Não trata documento fiscal como prova de coleta/entrega. Não cria registros cancelados novamente.
 */
(function(){
'use strict';
const dig=v=>String(v||'').replace(/\D/g,'');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const finais=new Set(['recebido','entregue','cancelado']);
const baseNome=v=>norm(v).replace(/\b(?:TRANSPORTADORA|TRANSPORTES|RODOVIARIOS|LOGISTICA|LTDA|EIRELI|EIRE|SA)\b/g,'').replace(/\s+/g,' ').trim();
function escolherTransportadora(doc,lista){
 const ativas=lista.filter(x=>x.ativa!==false),id=dig(doc.cnpjTransportadora);
 const exatos=id.length===14?ativas.filter(x=>[x.cnpj,x.cpf_cnpj,x.documento].some(v=>dig(v)===id)):[];
 if(exatos.length===1)return exatos[0];if(exatos.length>1)return null;
 const nome=baseNome(doc.transportadora);
 let achados=ativas.filter(x=>nome&&baseNome(x.nome)===nome);
 if(achados.length===1)return achados[0];
 // Caiapó identifica filiais no XML (ex.: CAIAPO CARGAS - SAO), sem confundir outros grupos.
 if(/^CAIAPO CARGAS(?: |$)/.test(nome)){
  achados=ativas.filter(x=>baseNome(x.nome)==='CAIAPO CARGAS');
  if(achados.length===1)return achados[0];
 }
 return null;
}
function agrupar(docs,alvo){
 const grupos=new Map();
 for(const d of docs||[]){
  if(!d.destinatarioConfirmado||dig(d.cnpjDestinatario)!=='05451985000195'||!d.remetente||!d.transportadora||!d.numeroCte)continue;
  for(const chave of new Set((d.chavesNfe||[]).map(dig))){
   if(!/^\d{44}$/.test(chave)||chave.slice(20,22)!=='55'||(alvo&&chave!==alvo))continue;
   if(!grupos.has(chave))grupos.set(chave,[]);
   grupos.get(chave).push(d);
  }
 }
 return grupos;
}
const aviso=(box,t)=>{const p=document.createElement('p');p.textContent=t;box.append(p);return p};
let emCurso=false;
async function conciliar(chave,docs,transportadoras){
 const numero=String(Number(chave.slice(25,34)));
 const ids=new Set(docs.map(x=>dig(x.cnpjTransportadora)||baseNome(x.transportadora)));
 // Busca global por chave, inclusive recebidas e canceladas; nunca por número isolado.
 const q=await banco.from('logistica_rastreamentos').select('*,frete_transportadoras(nome)').eq('sentido','entrada').eq('chave_nfe',chave).limit(3);
 if(q.error)throw Error(q.error.message);
 if(q.data?.length>1)throw Error('Há mais de um cadastro para a chave; confira manualmente.');
 let atual=q.data?.[0]||null;
 const d=docs[0],carrier=escolherTransportadora(d,transportadoras);
 if(!atual){
  const legacy=await banco.from('logistica_rastreamentos').select('*,frete_transportadoras(nome)').eq('sentido','entrada').eq('numero_nfe',numero).limit(100);
  if(legacy.error)throw Error(legacy.error.message);
  const ambiguos=(legacy.data||[]).filter(x=>!dig(x.chave_nfe)&&norm(x.parceiro_nome)===norm(d.remetente));
  if(ambiguos.length){
   if(ambiguos.length!==1||!carrier||String(ambiguos[0].transportadora_id)!==String(carrier.id)||String(ambiguos[0].numero_cte||'')!==String(d.numeroCte))throw Error('Cadastro antigo sem chave: confirme o vínculo manualmente antes de registrar.');
   atual=ambiguos[0];
  }
 }
 if(atual&&finais.has(atual.status))return {tipo:'preservado',id:atual.id,final:true};
 if(ids.size!==1)return {tipo:'conferir',motivo:'Mais de uma transportadora vinculada à chave; possível redespacho. Não alterei o trecho.'};
 // O CT-e mais recente nem sempre corresponde ao trecho cadastrado. Não substituir o transportador.
 if(atual?.transportadora_id&&(!carrier||String(atual.transportadora_id)!==String(carrier.id)))return {tipo:'conferir',motivo:'Transportadora do CT-e difere do cadastro; possível redespacho.'};
 if(!carrier)return {tipo:'conferir',motivo:'Transportadora não identificada de forma única no cadastro: '+d.transportadora};
 if(atual?.numero_cte&&String(atual.numero_cte)!==String(d.numeroCte))return {tipo:'conferir',motivo:'CT-e diferente do já cadastrado; confira o trecho.'};
 const origem=[d.origemTransporte,d.destinoTransporte].filter(Boolean).join(' → ');
 const meta={chave_cte:d.chaveCte||null,numero_cte:d.numeroCte,cnpj_transportadora:dig(d.cnpjTransportadora),origem:d.origemTransporte||null,destino:d.destinoTransporte||null,data_emissao:d.dataEmissao||null};
 const patch={chave_nfe:chave,numero_nfe:numero,numero_cte:d.numeroCte,transportadora_id:carrier.id,atualizado_em:new Date().toISOString()};
 if(!atual){
  const texto=['CT-e localizado no Gmail; movimentação ainda não confirmada.',origem&&'Trecho declarado: '+origem].filter(Boolean).join(' ');
  const r=await banco.from('logistica_rastreamentos').insert({...patch,sentido:'entrada',parceiro_nome:d.remetente,status:'aguardando_coleta',origem:'gmail_cte',observacao:texto,consulta_api:{documento_cte:meta}}).select('id').single();
  if(r.error)throw Error(r.error.message);if(!r.data?.id)throw Error('Cadastro não confirmado.');
  return {tipo:'registrado',id:r.data.id};
 }
 // Só preenche identificadores/documento, sem apagar ocorrências ou datas anteriores.
 const extra={...(atual.consulta_api||{}),documento_cte:meta};
 const r=await banco.from('logistica_rastreamentos').update({...patch,consulta_api:extra}).eq('id',atual.id).eq('status',atual.status).select('id').maybeSingle();
 if(r.error||!r.data)throw Error(r.error?.message||'Registro mudou durante a conferência.');
 return {tipo:'atualizado',id:atual.id};
}
async function consultarGmailExato(r,admin){
 const chave=dig(r.chave_nfe);
 if(chave.length!==44)return [];
 const resp=await fetch('/api/integracoes?action=descobrir-entradas-gmail',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':admin},body:JSON.stringify({dias:30,chaveNfe:chave})});
 const d=await resp.json().catch(()=>({}));if(!resp.ok||!d.ok)throw Error(d.erro||'Gmail indisponível');
 return (d.resultados||[]).filter(x=>x.destinatarioConfirmado&&(x.chavesNfe||[]).includes(chave));
}
async function rastrear(r,botao,{silencioso=false,recarregar=true,usarGmail=true}={}){
 const original=botao?.textContent,logs=[];
 let sucesso=false;
 const nome=norm(r.frete_transportadoras?.nome);
 const red=!!estadoRedespachoV523(r);
 const chave=dig(r.chave_nfe);
 if(finais.has(r.status))return {sucesso:false,logs:['Registro encerrado; histórico preservado.']};
 if(botao){botao.disabled=true;botao.textContent='Consultando fontes...';}
 try{
  const admin=await chaveAdminColeta();if(!admin)throw Error('Autorização administrativa necessária.');
  // APIs que exigem NF/CT-e usam o cadastro já vinculado. Nunca consultar outra empresa aleatória.
  const direto=red?null:/RODONAVES/.test(nome)?()=>consultarRastreioRodonavesRegistro(r.id,{chave:admin}):/\bALFA\b/.test(nome)?()=>consultarRastreioAlfaRegistro(r.id,{chave:admin}):/CORREIOS|COREIOS/.test(nome)?()=>consultarRastreioCorreiosRegistro(r.id,{chave:admin}):null;
  if(direto){
   try{const x=await direto();const d=x.dados||{};sucesso=d.ok!==false&&!d.semEventos&&!d.semAtualizacao&&!!(d.ultimaOcorrencia||d.eventos?.length||d.totalEventos);logs.push('API própria: '+(sucesso?'ocorrências retornadas':'sem ocorrência nova confirmada'));}
   catch(e){logs.push('API própria: '+e.message);}
  }
  if(!sucesso&&chave.length===44&&!/CORREIOS|COREIOS/.test(nome)){
   sucesso=await atualizarRastreioDanfeV440(r,null,{silencioso:true,recarregar:false});
   logs.push('SSW DANFE: '+(sucesso?'histórico consultado':'sem ocorrências confirmadas'));
  }
  // Só consulta ocorrências recebidas por EDI com chave exata, e nunca encerra redespacho com eventos genéricos.
  if(!sucesso&&!red&&chave.length===44){
   try{
    const q=await banco.from('ssw_ocorrencias_recebidas').select('*').eq('chave_nfe',chave).limit(25);
    if(q.error)throw Error(q.error.message);
    const matches=(q.data||[]).filter(x=>x.transportadora_nome&&baseNome(x.transportadora_nome)===baseNome(nome));
    const ord=matches.filter(x=>Number.isFinite(Date.parse(x.data_hora_evento))).sort((a,b)=>Date.parse(b.data_hora_evento)-Date.parse(a.data_hora_evento));
    const ev=ord[0];
    if(ev&&Date.parse(ev.data_hora_evento)>(Date.parse(r.ultima_ocorrencia_em)||0)){
     const t=[ev.descricao,ev.complemento].filter(Boolean).join(' — ');
     const st=normalizarStatusOcorrenciaSSWCliente(t,ev.codigo_ocorrencia);
     // Recebimento final só com prova explícita; casos ambíguos ficam para conferência.
     const estado=eventoRedespachoV523({descricao:t})?'em_transito':st==='entregue'?'em_transito':st;
     const patch={ultima_ocorrencia:t,ultima_ocorrencia_em:new Date(ev.data_hora_evento).toISOString(),status_api:t,metodo_consulta:'SSW / EDI recebido',consultado_api_em:new Date().toISOString()};
     if(estado!=='aguardando_coleta'&&estado!=='cancelado')patch.status=estado;
     const up=await banco.from('logistica_rastreamentos').update(patch).eq('id',r.id).eq('status',r.status).select('id').maybeSingle();
     if(up.error||!up.data)throw Error('Gravação EDI não confirmada');
     sucesso=true;
    }
    logs.push('EDI recebido: '+(sucesso?'ocorrência atualizada':'sem evento mais recente associado à transportadora'));
   }catch(e){logs.push('EDI: '+e.message);}
  }
  if(usarGmail&&(!sucesso||red)){
   try{const docs=await consultarGmailExato(r,admin);logs.push('Gmail CT-e: '+docs.length+' documento(s) vinculado(s) à chave; não são eventos de entrega.');
    if(docs.length)logs.push('Transportadoras nos CT-es: '+[...new Set(docs.map(x=>x.transportadora))].join(', '));
   }catch(e){logs.push('Gmail: '+e.message);}
  }
  if(/CAIAPO/.test(nome))logs.push('Caiapó utiliza Senior Tracking. Consulta automática Senior ainda não autorizada; use a opção oficial para confirmar novas ocorrências.');
  if(red)logs.push('Redespacho: entrega final continua pendente até confirmação do segundo trecho. Use a consulta específica na linha do tempo.');
  if(recarregar){await carregarRastreamentosLogistica('entrada');if(typeof carregarRastreamentosEntregues==='function')await carregarRastreamentosEntregues();}
  if(!silencioso)alert('NF '+(r.numero_nfe||'—')+'\n\n'+logs.join('\n')+'\n\n'+(sucesso?'Consulta concluída. Veja a linha do tempo.':'Nenhuma atualização de movimentação confirmada. Histórico preservado.'));
 }catch(e){logs.push(e.message);if(!silencioso)alert(logs.join('\n'));}
 finally{if(botao){botao.disabled=false;botao.textContent=original||'Atualizar rastreio';}}
 return {sucesso,logs};
}
async function aplicar(docs,box,btn,alvo){
 if(emCurso)return;
 const grupos=agrupar(docs,alvo);
 if(!grupos.size){aviso(box,'Nenhum CT-e com chave NF-e e destinatário confirmados está apto ao registro.');return;}
 emCurso=true;btn.disabled=true;const orig=btn.textContent;
 const status=aviso(box,'Preparando '+grupos.size+' nota(s)...');
 const resumo={registrado:0,atualizado:0,preservado:0,conferir:0,erro:0,rastreio:0};
 try{
  const admin=await chaveAdminColeta();if(!admin)throw Error('Autorização administrativa necessária.');
  const tr=await banco.from('frete_transportadoras').select('*').order('nome');
  if(tr.error)throw Error(tr.error.message);
  let i=0;
  for(const [chave,documentos] of grupos){
   status.textContent='Processando '+(++i)+' de '+grupos.size+' — NF '+Number(chave.slice(25,34));
   try{
    const resultado=await conciliar(chave,documentos,tr.data||[]);
    resumo[resultado.tipo]++;
    if(resultado.motivo)aviso(box,'NF '+Number(chave.slice(25,34))+': '+resultado.motivo);
    if(resultado.id&&!resultado.final){
     const r=await obterRastreamentoPorId(resultado.id);
     if(r){const v=await rastrear(r,null,{silencioso:true,recarregar:false,usarGmail:false});if(v.sucesso)resumo.rastreio++;aviso(box,'NF '+r.numero_nfe+': '+resultado.tipo+' — '+v.logs.join(' | '));}
    }
   }catch(e){resumo.erro++;aviso(box,'NF '+Number(chave.slice(25,34))+': '+e.message);}
  }
  await carregarRastreamentosLogistica('entrada');if(typeof carregarRastreamentosEntregues==='function')await carregarRastreamentosEntregues();
  status.textContent='Concluído: '+resumo.registrado+' registrada(s), '+resumo.atualizado+' atualizada(s), '+resumo.preservado+' encerrada(s) preservada(s), '+resumo.conferir+' para conferência, '+resumo.erro+' erro(s). '+resumo.rastreio+' consulta(s) com ocorrências.';
 }catch(e){status.textContent='Falha: '+e.message;}
 finally{emCurso=false;btn.disabled=false;btn.textContent=orig;}
}
function montar(box,docs,d){
 const btn=document.createElement('button');btn.type='button';btn.className='btn verde';btn.textContent='Atualizar ou registrar mercadorias localizadas';
 btn.onclick=()=>aplicar(docs,box,btn);box.append(btn);
 if(d?.parcial)aviso(box,'Busca parcial: somente documentos examinados nesta consulta serão processados.');
 if(docs.some(x=>/CAIAPO/.test(norm(x.transportadora)))){
  const link=document.createElement('a');link.href='https://platform.senior.com.br/logistica-tck/tms/tck-frontend/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Consulta oficial Caiapó / Senior (manual)';link.style.marginLeft='12px';box.append(link);
 }
}
window.montarAcaoEntradasV524=montar;
window.aplicarEntradasGmailV524=aplicar;
window.atualizarEntradaMultiV524=rastrear;
})();
