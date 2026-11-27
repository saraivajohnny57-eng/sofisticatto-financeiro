const {json,exigirAdminOuCron,supabaseRest}=require('./_utils');
const {listarPrepostagens,listaPrepostResposta,valorProfundo}=require('./_correios');
const {statusSSW:classificarStatusSSW,confirmaColetaSSW}=require('./_ssw-validacao');

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\bcoreios\b/g,'correios');}
function statusSSW(desc,codigo){return classificarStatusSSW(desc,codigo);}
function matchNome(a,b){
  const x=norm(a),y=norm(b);if(!x||!y)return false;
  if(x===y||x.includes(y)||y.includes(x))return true;
  const xa=x.split(' ').filter(w=>w.length>=3),ya=y.split(' ').filter(w=>w.length>=3);
  return xa.some(w=>ya.includes(w));
}
function tipoIntegracao(nome,integracoes){
  const n=norm(nome);
  if(/rodonaves/.test(n))return'rodonaves';
  if(/correios/.test(n))return'correios';
  if(/(^| )alfa( |$)/.test(n)){
    const alfa=(integracoes||[]).find(x=>/(^| )alfa( |$)/.test(norm(x.transportadora_nome)));
    if(!alfa || alfa.rastreamento_ativo!==true || String(alfa.status_tecnico||'').toLowerCase()==='suspensa')return null;
    return 'alfa';
  }
  if(/braspress/.test(n))return'braspress';
  const i=(integracoes||[]).find(x=>matchNome(nome,x.transportadora_nome));
  if(i&&i.rastreamento_ativo===true&&String(i.status_tecnico||'').toLowerCase()!=='suspensa'&&(String(i.integracao_tipo||'').toLowerCase()==='webservice'||/ssw/i.test(String(i.api_versao||''))))return'ssw';
  if(/accert|(^| )tg( |$)/.test(n))return'ssw';
  return null;
}

function txt(v){return String(v??'').trim();}
function dig(v){return txt(v).replace(/\D/g,'');}
function dataIso(v){const t=Date.parse(txt(v));return Number.isFinite(t)?new Date(t).toISOString():new Date().toISOString();}
function codigoObjeto(item){return txt(valorProfundo(item,['codigoObjeto','codObjeto','codigoRastreio','eticket'])).toUpperCase();}
function nomeDestinatario(item){const d=item?.destinatario||item?.destino||{};return txt(d.nome||d.nomeDestinatario||d.razaoSocial||valorProfundo(item,['nomeDestinatario','razaoSocial']))||'Destinatário Correios';}
function cnpjDestinatario(item){const d=item?.destinatario||item?.destino||{};return dig(d.cpfCnpj||d.cpfCNPJ||d.cnpj||d.documento||valorProfundo(item,['cpfCnpjDestinatario','cnpjDestinatario']));}
function cepDestinatario(item){const d=item?.destinatario||item?.destino||{};return dig(d.cep||valorProfundo(item,['cepDestinatario']));}
function statusPrepost(item){return txt(valorProfundo(item,['statusAtual','status'])).toUpperCase();}
function numeroNfPrepost(item){return txt(valorProfundo(item,['numeroNotaFiscal','numeroNFe','numeroNfe','notaFiscal','nf']));}
function dataPrepost(item){return txt(valorProfundo(item,['dataHoraStatusAtual','dataPostagem','dataPrePostagem','dataHora']));}

async function localizarTransportadorasCorreios(){
  const rows=await supabaseRest('frete_transportadoras',{query:'?select=id,nome&limit=500'}).catch(()=>[]);
  return (rows||[]).filter(x=>/correios|coreios/i.test(String(x.nome||'')));
}
async function importarObjetosCorreiosAbertos(){
  const transportadoras=await localizarTransportadorasCorreios();
  const trans=transportadoras[0]||null;
  if(!trans?.id)return {importados:0,atualizados:0,encontrados:0,avisos:['Transportadora Correios não encontrada no cadastro.']};
  const todos=[];const avisos=[];
  for(const status of ['POSTADO','PREPOSTADO','PREATENDIDO']){
    for(let page=0;page<5;page++){
      try{
        const d=await listarPrepostagens({status,tipoObjeto:'REGISTRADO',page,size:100});
        const itens=listaPrepostResposta(d);todos.push(...itens);
        const temProxima=Boolean(d?.hasNext??d?.temProximaPagina??(Number(d?.page?.number)<Number((d?.page?.totalPages||1)-1)));
        if(itens.length<100&&!temProxima)break;
      }catch(e){avisos.push(`${status}: ${e.message}`);break;}
    }
  }
  const unicos=[...new Map(todos.map(x=>[codigoObjeto(x),x]).filter(([c])=>/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c))).values()];
  const idsCorreios=transportadoras.map(x=>String(x.id)).filter(Boolean);
  const filtroTrans=idsCorreios.length?`&transportadora_id=in.(${idsCorreios.join(',')})`:'';
  // V84: procura o objeto em TODOS os cadastros Correios (Correios, CORREIOS PAC,
  // Correios 03298 etc.), para que o mesmo código não seja importado novamente.
  let abertos=await supabaseRest('logistica_rastreamentos',{query:`?select=id,status,protocolo_rastreio,numero_nfe,parceiro_nome,transportadora_id,coleta_agendamento_id,created_at,metodo_consulta&sentido=eq.saida${filtroTrans}&order=created_at.desc&limit=1200`}).catch(()=>[]);
  // Preservar os registros cancelados (exclusão lógica): não importá-los novamente.
  let importados=0,atualizados=0;
  for(const item of unicos){
    const codigo=codigoObjeto(item);const st=statusPrepost(item);const quando=dataIso(dataPrepost(item));const nf=numeroNfPrepost(item);const nome=nomeDestinatario(item);const nn=norm(nome);
    // Nunca criar uma remessa cujo retorno oficial seja cancelado ou expirado.
    if(/CANCEL|EXPIR|ESTORN/.test(st))continue;
    let existente=(abertos||[]).find(x=>String(x.protocolo_rastreio||'').toUpperCase()===codigo)||null;
    // Um código já excluído ou finalizado não pode voltar para Saídas em Trânsito.
    if(existente&&['cancelado','entregue','recebido'].includes(String(existente.status||'').toLowerCase()))continue;
    if(!existente&&nf)existente=(abertos||[]).find(x=>
      txt(x.numero_nfe)===nf && !['cancelado','entregue','recebido'].includes(x.status)
      && (!x.protocolo_rastreio||String(x.protocolo_rastreio).toUpperCase()===codigo)
    )||null;
    if(!existente&&nn){const porNome=(abertos||[]).filter(x=>
      norm(x.parceiro_nome)===nn&&!x.protocolo_rastreio&&!x.numero_nfe
      &&!['cancelado','entregue','recebido'].includes(x.status)
    );if(porNome.length===1)existente=porNome[0];}
    // A pré-postagem não substitui histórico mais detalhado já obtido pelo Rastro.
    if(existente?.id&&String(existente.protocolo_rastreio||'').toUpperCase()===codigo&&/Correios API Rastro/i.test(existente.metodo_consulta||''))continue;
    const patch={
      transportadora_id:existente?.transportadora_id||trans.id,protocolo_rastreio:codigo,
      parceiro_nome:existente?.parceiro_nome||nome,
      data_postagem:quando.slice(0,10),
      status:/CANCEL|EXPIR|ESTORN/.test(st)
        ?'cancelado'
        :(/POSTADO/.test(st)&&!/PREPOSTADO/.test(st)?'em_transito':'aguardando_coleta'),
      ultima_ocorrencia:`Correios • ${st||'OBJETO LOCALIZADO NO CONTRATO'}`,
      ultima_ocorrencia_em:quando,metodo_consulta:'Correios API Pré-Postagem',
      consulta_api:item,consultado_api_em:new Date().toISOString(),
      atualizado_em:new Date().toISOString(),atualizado_por:'correios_prepostagem_importacao_v47'
    };
    // preserva detalhes úteis para busca/diagnóstico sem exigir colunas novas
    const extras=[cnpjDestinatario(item)&&`CNPJ/CPF destino ${cnpjDestinatario(item)}`,cepDestinatario(item)&&`CEP ${cepDestinatario(item)}`].filter(Boolean).join(' • ');
    if(extras)patch.observacao=extras;
    if(existente?.id){
      if(nf&&!existente.numero_nfe)patch.numero_nfe=nf;
      await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(existente.id)}`,body:patch});atualizados++;
      existente={...existente,...patch};abertos=(abertos||[]).map(x=>x.id===existente.id?existente:x);
    }else{
      const criado=await supabaseRest('logistica_rastreamentos',{method:'POST',body:{sentido:'saida',numero_nfe:nf||null,chave_nfe:null,numero_cte:null,volumes:null,...patch}});importados++;
      if(criado?.[0])abertos.push(criado[0]);
    }
  }
  return {importados,atualizados,encontrados:unicos.length,avisos};
}
/* V475 — reativação segura da conciliação de coleta por ocorrência real. */
function eventoRealDeRetiradaV475(descricao,quando){
 const data=Date.parse(String(quando||''));
 if(!Number.isFinite(data)||data>Date.now()+300000||data<Date.parse('2020-01-01'))return false;
 return confirmaColetaSSW(String(descricao||''));
}

async function efetivarRetiradaConfirmadaV475(item,descricao,quando,fonte='rastreio_api'){
 if(!item?.coleta_agendamento_id||!eventoRealDeRetiradaV475(descricao,quando))return false;
 const id=String(item.coleta_agendamento_id);
 const rows=await supabaseRest('coleta_agendamentos',{query:`?select=id,status,coletado_em,numero_nf,transportadora_id&id=eq.${encodeURIComponent(id)}&limit=1`});
 const c=rows?.[0];
 if(!c||c.coletado_em||['coletado','cancelado','cancelamento_solicitado'].includes(String(c.status||'').toLowerCase()))return false;
 const num=x=>String(x||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
 if(String(c.transportadora_id||'')!==String(item.transportadora_id||'')||!num(c.numero_nf)||!num(item.numero_nfe)||num(c.numero_nf)!==num(item.numero_nfe))return false;
 const agora=new Date().toISOString();
 const rowsUpdated=await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(c.status)}&coletado_em=is.null`,body:{
   status:'coletado',status_api:String(descricao).slice(0,900),coletado_em:new Date(quando).toISOString(),
   sincronizado_em:agora,sincronizacao_erro:null,atualizado_em:agora
 }});
 if(!Array.isArray(rowsUpdated)||rowsUpdated.length!==1)return false;
 await supabaseRest('coleta_status_eventos',{method:'POST',body:{
   agendamento_id:id,status_anterior:c.status,status_novo:'coletado',origem:'rastreio_confirmado_automatico_v475',
   detalhes:{fonte,descricao:String(descricao).slice(0,450),quando:new Date(quando).toISOString(),rastreio_id:item.id,numero_nf:item.numero_nfe},
   usuario:'sistema'
 }}).catch(e=>console.warn('Coleta confirmada sem evento de auditoria:',e.message));
 return true;
}

async function marcarColetaSSWComoRealizada(item,descricao,quando){
 return efetivarRetiradaConfirmadaV475(item,descricao,quando,'ssw_consulta_automatica');
}

async function recuperarVinculosColetasV475(rastreios){
 const resumo={analisadas:0,vinculos_recuperados:0,rastreios_recuperados:0,coletas_confirmadas:0,sem_confirmacao:0,pendentes_ids:[],erros:[]};
 const coletas=await supabaseRest('coleta_agendamentos',{query:'?select=id,cliente_nome,numero_nf,chave_nfe,protocolo_rastreio,numero_cte,protocolo_cotacao,transportadora_id,data_programada,status,coletado_em,dados,frete_transportadoras(nome)&status=in.(solicitado,confirmado,em_coleta,em_aberto)&coletado_em=is.null&numero_nf=not.is.null&order=created_at.desc&limit=120'});
 for(const c of coletas||[]){
  resumo.analisadas++;
  resumo.pendentes_ids.push(String(c.id));
  try{
   const numero=String(c.numero_nf||'').trim(),tr=String(c.transportadora_id||'');
   if(!/^\d{4,10}$/.test(numero)||!tr){resumo.sem_confirmacao++;continue;}
   const porId=rastreios.filter(x=>String(x.coleta_agendamento_id||'')===String(c.id));
   const porNf=rastreios.filter(x=>String(x.numero_nfe||'').trim()===numero&&String(x.transportadora_id||'')===tr);
   let rast=porId.length===1?porId[0]:null;
   if(porId.length>1){resumo.sem_confirmacao++;continue;}
   if(!rast&&porNf.length===1&&(!porNf[0].coleta_agendamento_id||String(porNf[0].coleta_agendamento_id)===String(c.id))){
    rast=porNf[0];
    if(!rast.coleta_agendamento_id){
     const alteradas=await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(rast.id)}&coleta_agendamento_id=is.null`,body:{coleta_agendamento_id:c.id,atualizado_em:new Date().toISOString(),atualizado_por:'recuperacao_vinculo_v475'}});
     if(!Array.isArray(alteradas)||alteradas.length!==1){resumo.sem_confirmacao++;continue;}
     rast={...rast,coleta_agendamento_id:c.id};
     const i=rastreios.findIndex(x=>x.id===rast.id);if(i>=0)rastreios[i]=rast;
     resumo.vinculos_recuperados++;
    }
   }
   if(!rast&&porNf.length===0&&resumo.rastreios_recuperados<10){
     // A janela de 700 rastreios pode omitir títulos antigos/entregues:
     // pesquisa exata antes de inserir para evitar duplicar o mesmo NF + transportadora.
     const outros=await supabaseRest('logistica_rastreamentos',{query:`?select=id,status,coleta_agendamento_id,transportadora_id,numero_nfe,ultima_ocorrencia,ultima_ocorrencia_em,status_api,metodo_consulta&numero_nfe=eq.${encodeURIComponent(numero)}&transportadora_id=eq.${encodeURIComponent(tr)}&limit=3`});
     if(outros?.length){
       if(outros.length!==1|| (outros[0].coleta_agendamento_id && String(outros[0].coleta_agendamento_id)!==String(c.id))){
         resumo.sem_confirmacao++;continue; // ambíguo: não cria duplicidade nem vincula outra coleta
       }
       rast={...outros[0],frete_transportadoras:c.frete_transportadoras};
       if(!rast.coleta_agendamento_id){
         const patch=await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(rast.id)}&coleta_agendamento_id=is.null`,body:{coleta_agendamento_id:c.id,atualizado_em:new Date().toISOString(),atualizado_por:'recuperacao_vinculo_v475'}});
         if(patch?.length!==1){resumo.sem_confirmacao++;continue;}
         rast.coleta_agendamento_id=c.id;resumo.vinculos_recuperados++;
       }
       if(!rastreios.some(x=>String(x.id)===String(rast.id)))rastreios.push(rast);
     }else{
       const chave=String(c.chave_nfe||c?.dados?.chave_nfe||'').replace(/\D/g,'');
       const dados={sentido:'saida',parceiro_nome:c.cliente_nome||'Cliente',transportadora_id:tr,
         coleta_agendamento_id:c.id,numero_nfe:numero,chave_nfe:chave.length===44?chave:null,
         protocolo_rastreio:c.protocolo_rastreio&&c.protocolo_rastreio!==c.protocolo_cotacao?c.protocolo_rastreio:null,
         numero_cte:c.numero_cte||null,status:'aguardando_coleta',origem:'coleta_agendamento',
         observacao:'NF vinculada automaticamente; coleta ainda sem confirmação',
         atualizado_em:new Date().toISOString(),atualizado_por:'recuperacao_vinculo_v475'};
       const criado=await supabaseRest('logistica_rastreamentos',{method:'POST',body:dados});
       rast=criado?.[0]||null;
       if(rast){rast.frete_transportadoras=c.frete_transportadoras;rastreios.push(rast);resumo.rastreios_recuperados++;}
     }
   }
   if(!rast||String(rast.coleta_agendamento_id)!==String(c.id)){resumo.sem_confirmacao++;continue;}
   const origem=String(rast.metodo_consulta||'');
   const descricao=[rast.status_api,rast.ultima_ocorrencia].filter(Boolean).join(' — ');
   if(!origem||/pendente|manual|aguardando|simula|teste|local/i.test(origem)||
       !eventoRealDeRetiradaV475(descricao,rast.ultima_ocorrencia_em)){resumo.sem_confirmacao++;continue;}
   if(await efetivarRetiradaConfirmadaV475(rast,descricao,rast.ultima_ocorrencia_em,origem))resumo.coletas_confirmadas++;
   else resumo.sem_confirmacao++;
  }catch(e){resumo.erros.push({coleta_id:c.id,erro:String(e.message||e).slice(0,180)});}
 }
 return resumo;
}

async function aplicarUltimaOcorrenciaSSW(item){
  let q='?select=*&order=created_at.desc&limit=30';
  const chave=String(item.chave_nfe||'').replace(/\D/g,'');
  const nf=String(item.numero_nfe||'').trim();
  if(chave)q+=`&chave_nfe=eq.${encodeURIComponent(chave)}`;
  else if(nf)q+=`&numero_nfe=eq.${encodeURIComponent(nf)}`;
  else return null;
  const rows=await supabaseRest('ssw_ocorrencias_recebidas',{query:q}).catch(()=>[]);
  const nome=item.frete_transportadoras?.nome||'';
  // Nunca pegar uma ocorrência de outra transportadora/NF por fallback genérico.
  const candidatos=(rows||[]).filter(x=>{
    if(chave.length===44 && String(x.chave_nfe||'').replace(/\D/g,'')!==chave)return false;
    if(chave.length!==44 && nf && String(x.numero_nfe||'').replace(/\D/g,'')!==nf.replace(/\D/g,''))return false;
    const transportadora=String(x.transportadora_nome||'').trim();
    return transportadora ? matchNome(nome,transportadora) : chave.length===44;
  });
  const oc=candidatos.sort((a,b)=>Date.parse(b.data_hora_evento||b.created_at||0)-Date.parse(a.data_hora_evento||a.created_at||0))[0];
  if(!oc)return null;
  const st=statusSSW(oc.descricao,oc.complemento||oc.codigo_ocorrencia);
  if(!st)return null;
  const quando=oc.data_hora_evento&&Number.isFinite(Date.parse(oc.data_hora_evento))?new Date(oc.data_hora_evento).toISOString():(oc.processado_em||oc.created_at||new Date().toISOString());
  const anterior=Date.parse(item.ultima_ocorrencia_em||'');
  if(Number.isFinite(anterior) && Number.isFinite(Date.parse(quando)) && Date.parse(quando)<anterior)return null;
  if(item.status==='entregue' && item.finalizado_em)return null;
  const patch={
    status:st,status_api:oc.descricao||'Ocorrência SSW',
    ultima_ocorrencia:[oc.descricao,oc.complemento].filter(Boolean).join(' — '),
    ultima_ocorrencia_em:quando,metodo_consulta:'SSW / ocorrência recebida',
    consultado_api_em:new Date().toISOString(),sincronizacao_erro:null,atualizado_em:new Date().toISOString(),
    atualizado_por:'sincronizacao_automatica_v49'
  };
  patch.finalizado_em=st==='entregue'?quando:null;
  await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(item.id)}`,body:patch});
  await marcarColetaSSWComoRealizada(item,[oc.descricao,oc.complemento].filter(Boolean).join(' — '),quando);
  return {status:st,descricao:oc.descricao||'Ocorrência SSW'};
}

function selecionarRastreiosParaCicloV475(rastreios,idsPendentes,agora=Date.now()){
 const conjunto=new Set((idsPendentes||[]).map(String));
 const pendentes=rastreios.filter(r=>conjunto.has(String(r.coleta_agendamento_id||'')));
 const restantes=rastreios.filter(r=>!conjunto.has(String(r.coleta_agendamento_id||''))&&!['entregue','recebido','cancelado'].includes(String(r.status||'')));
 const ciclo=Math.floor(agora/300000);
 const pegar=(a,n,mult)=>{if(a.length<=n)return a.slice();const start=(ciclo*mult)%a.length;return Array.from({length:n},(_,i)=>a[(start+i)%a.length]);};
 return [...pegar(pendentes,14,14),...pegar(restantes,18,18)];
}

module.exports=async function(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdminOuCron(req,res))return;
  try{
    const admin=String(process.env.INTEGRATIONS_ADMIN_KEY||'');
    if(!admin)return json(res,500,{ok:false,erro:'INTEGRATIONS_ADMIN_KEY não configurada no servidor.'});
    const integracoes=await supabaseRest('transportadora_integracoes',{query:'?select=transportadora_nome,status_tecnico,rastreamento_ativo,coleta_ativa,integracao_tipo,api_versao,convite_id&limit=200'}).catch(()=>[]);
    const rastreios=await supabaseRest('logistica_rastreamentos',{query:'?select=id,status,protocolo_rastreio,numero_cte,numero_nfe,chave_nfe,ultima_ocorrencia,ultima_ocorrencia_em,status_api,metodo_consulta,coleta_agendamento_id,transportadora_id,frete_transportadoras(nome)&sentido=eq.saida&status=not.in.(entregue,recebido,cancelado)&order=created_at.desc&limit=700'});
    let coletasReconciliadas={analisadas:0,vinculos_recuperados:0,rastreios_recuperados:0,coletas_confirmadas:0,sem_confirmacao:0,erros:[]};
    try{coletasReconciliadas=await recuperarVinculosColetasV475(rastreios)}
    catch(e){coletasReconciliadas.erros.push({erro:e.message});console.warn('Conciliação coletas V475:',e.message)}
    let importacaoCorreios={importados:0,atualizados:0,encontrados:0,avisos:[]};
    try{importacaoCorreios=await importarObjetosCorreiosAbertos();}catch(e){importacaoCorreios.avisos=[e.message];}
    const host=String(req.headers['x-forwarded-host']||req.headers.host||process.env.VERCEL_URL||'').replace(/^https?:\/\//,'');
    const proto=String(req.headers['x-forwarded-proto']||'https');
    if(!host)return json(res,500,{ok:false,erro:'Não foi possível determinar a URL do portal.'});
    const base=`${proto}://${host}/api/integracoes`;
    const resultados=[];let consultados=0,atualizados=0,entregues=0,erros=0,ignorados=0;

    const filaAtual=selecionarRastreiosParaCicloV475(rastreios,coletasReconciliadas.pendentes_ids);
    for(const item of filaAtual){
      const nome=item.frete_transportadoras?.nome||'';
      // Parceiros com retorno SSW DANFE comprovado continuam consultáveis pela
      // chave, mesmo sem credenciais particulares da transportadora.
      const danfe=String(item.chave_nfe||'').replace(/\D/g,'');
      const parceiroSSWHistorico=/(^| )(sigmalog|transpress)( |$)/.test(norm(nome));
      const tipo=tipoIntegracao(nome,integracoes) ||
        (/^SSW Tracking DANFE/i.test(String(item.metodo_consulta||'')) ? 'ssw' :
          (parceiroSSWHistorico && danfe.length===44 ? 'ssw':null));
      if(!tipo){ignorados++;continue;}
      const temId=Boolean(item.protocolo_rastreio||item.numero_cte||item.numero_nfe||item.chave_nfe);
      if(!temId&&tipo!=='correios'){ignorados++;continue;}
      let action='';
      if(tipo==='rodonaves')action='consultar-rastreio-rodonaves';
      if(tipo==='alfa')action='consultar-rastreio-alfa';
      if(tipo==='correios')action='consultar-rastreio-correios';
      if(tipo==='ssw')action='consultar-rastreio-ssw';
      if(tipo==='braspress')action='consultar-rastreio-braspress';
      const qp=new URLSearchParams({action,registro_id:String(item.id)});
      // A consulta Rodonaves não resolve os identificadores apenas pelo ID interno.
      // Na sincronização em lote precisamos enviar os mesmos campos usados pelo botão
      // individual, caso contrário ela responde "Informe protocolo/NF/CT-e/chave".
      if(tipo==='rodonaves'){
        if(item.protocolo_rastreio)qp.set('protocolo',String(item.protocolo_rastreio));
        if(item.numero_cte)qp.set('cte',String(item.numero_cte));
        if(item.numero_nfe)qp.set('nfe',String(item.numero_nfe));
        if(item.chave_nfe)qp.set('chave_nfe',String(item.chave_nfe));
      }
      // Alfa exige merNF. A integração em lote deve enviar 'nfe' à rota interna,
      // exatamente como a consulta individual, senão responde NF não informada.
      if(tipo==='alfa'&&item.numero_nfe)qp.set('nfe',String(item.numero_nfe));
      if(tipo==='braspress'&&item.numero_nfe)qp.set('nfe',String(item.numero_nfe));
      if(tipo==='correios'){
        const cod=String(item.protocolo_rastreio||item.numero_cte||'').trim().toUpperCase();
        if(/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod))qp.set('codigo',cod);
      }
      // Ocorrência positiva já recebida: a falha posterior da API não deve desfazer a entrega.
      const comprovante=norm([item.ultima_ocorrencia,item.status_api].filter(Boolean).join(' '));
      const entregaConfirmada=tipo==='rodonaves'&&/(entrega finalizada|entrega realizada|mercadoria entregue|entregue ao destinatario|recebido pelo destinatario|mercadoria retirada recebedor [a-z]{2,})/.test(comprovante)&&!/(nao entregue|entrega nao realizada|tentativa de entrega|entrega nao finalizada|mercadoria retirada.*(origem|coleta))/.test(comprovante);
      if(entregaConfirmada){
        const agora=new Date().toISOString();
        await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(item.id)}`,body:{
          status:'entregue',sincronizacao_erro:null,finalizado_em:item.ultima_ocorrencia_em||agora,
          atualizado_em:agora,atualizado_por:'rodonaves_entrega_confirmada_v457'
        }});
        atualizados++;entregues++;
        resultados.push({id:item.id,transportadora:nome,tipo,ok:true,fonte:'ocorrencia_entrega_confirmada',status:'entregue'});
        continue;
      }
      try{
        consultados++;
        const rr=await fetch(`${base}?${qp}`,{headers:{'x-integrations-admin-key':admin,Accept:'application/json'}});
        const d=await rr.json().catch(()=>({}));
        if(!rr.ok)throw new Error(d.erro||`HTTP ${rr.status}`);
        atualizados++;
        if(['ssw','rodonaves','alfa','braspress'].includes(tipo)&&!d.aguardandoColeta&&!d.semOcorrencias){
          const evidencia=[d.statusBruto,d.ultimaOcorrencia].filter(Boolean).join(' — ');
          const dataReal=d.ultimaOcorrenciaEm||item.ultima_ocorrencia_em||null;
          if(await efetivarRetiradaConfirmadaV475(item,evidencia,dataReal,tipo+'_consulta_api'))coletasReconciliadas.coletas_confirmadas++;
        }
        if(String(d.status||'')==='entregue')entregues++;
        resultados.push({id:item.id,transportadora:nome,tipo,ok:true,status:d.status||null});
      }catch(e){
        if(tipo==='ssw'){
          try{
            const local=await aplicarUltimaOcorrenciaSSW(item);
            if(local){atualizados++;if(local.status==='entregue')entregues++;resultados.push({id:item.id,transportadora:nome,tipo,ok:true,fonte:'ocorrencia_ssw',status:local.status});continue;}
          }catch{}
        }
        try{
          await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(item.id)}`,body:{
            sincronizacao_erro:String(e.message||'Falha ao consultar rastreio').slice(0,900),
            status_api:item.status_api||null,
            metodo_consulta:tipo==='ssw'?'SSW / consulta pendente':(item.metodo_consulta||null),
            consultado_api_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),atualizado_por:'sincronizacao_erro_v51'
          }});
        }catch{}
        erros++;resultados.push({id:item.id,transportadora:nome,tipo,ok:false,erro:e.message});
      }
      await new Promise(r=>setTimeout(r,180));
    }
    return json(res,200,{ok:true,total:(rastreios||[]).length,lote:filaAtual.length,consultados,atualizados,entregues,erros,ignorados,importacaoCorreios,coletasReconciliadas,resultados:resultados.slice(0,100),executado_em:new Date().toISOString()});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
