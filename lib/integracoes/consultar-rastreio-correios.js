const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {rastrear,descobrirCodigoObjeto}=require('./_correios');
function normalizar(d){
  const obj=d?.objetos?.[0]||d?.objeto||d;
  const lista=(obj?.eventos||obj?.events||[]);
  const ts=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0;};
  const listaOrdenada=[...lista].sort((a,b)=>ts(b?.dtHrCriado||b?.dataHora||b?.data)-ts(a?.dtHrCriado||a?.dataHora||a?.data));
  const eventos=listaOrdenada.map(ev=>({
    titulo:ev?.descricao||ev?.description||ev?.tipo||'Ocorrência Correios',
    descricao:ev?.detalhe||ev?.description||ev?.descricao||'',
    data:ev?.dtHrCriado||ev?.dataHora||ev?.data||null,
    local:[ev?.unidade?.endereco?.cidade||ev?.unidade?.nome||ev?.cidade,ev?.unidade?.endereco?.uf||ev?.uf].filter(Boolean).join(' / '),
    codigo:ev?.codigo||null,raw:ev
  }));
  // V101: não presume que o primeiro item retornado pela API é o mais recente.
  // Além disso, um evento de entrega em qualquer ponto do histórico prevalece,
  // evitando que um objeto já entregue volte visualmente para "aguardando coleta".
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const entregue=listaOrdenada.find(ev=>/\bentregue\b|entrega realizada|objeto entregue|recebido pelo destinatario/.test(norm(ev?.descricao||ev?.description||ev?.tipo))||String(ev?.codigo||'').toUpperCase()==='BDE');
  const ev=entregue||listaOrdenada[0]||{};
  const desc=String(ev?.descricao||ev?.description||ev?.tipo||'Rastreamento consultado').trim();
  const cod=String(ev?.codigo||'').toUpperCase();
  const t=norm(desc);
  let status='aguardando_coleta',coletado=false;
  if(/\bentregue\b|entrega realizada|objeto entregue|recebido pelo destinatario/.test(t)||cod==='BDE'){status='entregue';coletado=true;}
  else if(/saiu.*para.*entrega|saida.*para.*entrega|carteiro saiu|em rota de entrega/.test(t)){status='saiu_entrega';coletado=true;}
  else if(/objeto em transferencia|em transferencia|encaminhad|transferencia|objeto em transito/.test(t)){status='em_transito';coletado=true;}
  else if(/chegou.*unidade|objeto recebido.*unidade|recebido.*unidade|unidade de tratamento|unidade de distribuicao/.test(t)){status='na_filial';coletado=true;}
  else if(/objeto postado|postado apos|postado\b|recebido pelos correios/.test(t)){status='em_transito';coletado=true;}
  else if(/etiqueta emitida|aguardando postagem|pre[- ]?postagem|prepostad|pre[- ]?atendid/.test(t)){status='aguardando_coleta';coletado=false;}
  return {obj,ev,eventos,status,desc,coletado,eventoData:ev?.dtHrCriado||ev?.dataHora||ev?.data||null};
}
function codValido(v){return /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(String(v||'').trim());}
module.exports=async(req,res)=>{if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido.'});if(!exigirAdmin(req,res))return;try{
  const registroId=String(req.query.registro_id||'').trim();let codigo=String(req.query.codigo||req.query.protocolo||'').trim().toUpperCase();let registro=null;
  if(registroId){const rr=await supabaseRest('logistica_rastreamentos',{query:`?select=id,parceiro_nome,protocolo_rastreio,data_postagem,coleta_agendamento_id& id=eq.${encodeURIComponent(registroId)}&limit=1`.replace(' &','&')});registro=rr?.[0]||null;if(!codigo&&codValido(registro?.protocolo_rastreio))codigo=String(registro.protocolo_rastreio).trim().toUpperCase();}
  let auto=null;
  if(!codValido(codigo)&&registro?.coleta_agendamento_id){
    const cc=await supabaseRest('coleta_agendamentos',{query:`?select=id,cliente_nome,dados,data_programada& id=eq.${encodeURIComponent(registro.coleta_agendamento_id)}&limit=1`.replace(' &','&')});
    const c=cc?.[0];const dados=c?.dados||{};
    auto=await descobrirCodigoObjeto({cnpj:dados.cnpj_destino||dados.cpf_cnpj_destino,cep:dados.cep_destino,nome:c?.cliente_nome||dados.razao_destino||registro.parceiro_nome,data:registro.data_postagem||c?.data_programada});
    if(auto?.codigo){codigo=auto.codigo;await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:{protocolo_rastreio:codigo,atualizado_em:new Date().toISOString(),atualizado_por:'correios_prepostagem_auto'}});try{const novoDados={...dados,protocolo_rastreio:codigo};await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registro.coleta_agendamento_id)}`,body:{protocolo_rastreio:codigo,dados:novoDados,atualizado_em:new Date().toISOString()}});}catch{}}
  }
  if(!codValido(codigo))return json(res,422,{ok:false,codigo:'CORREIOS_CODIGO_NAO_LOCALIZADO',erro:auto?.motivo||'Código de rastreio dos Correios não informado e não localizado automaticamente nas pré-postagens do contrato.',descoberta:auto||null});
  const d=await rastrear(codigo);
  const n=normalizar(d);
  const agora=new Date().toISOString();

  if(registroId){
    const patch={
      protocolo_rastreio:codigo,
      status:n.status,
      status_api:n.desc,
      ultima_ocorrencia:n.desc,
      ultima_ocorrencia_em:n.eventoData||agora,
      consulta_api:d,
      metodo_consulta:'Correios API Rastro',
      consultado_api_em:agora,
      atualizado_em:agora,
      atualizado_por:'api_correios_v91'
    };
    if(n.status==='entregue')patch.finalizado_em=n.eventoData||agora;
    try{
      await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});
    }catch(dbErr){
      const msg=String(dbErr?.message||dbErr||'');
      if(/logistica_rastreamentos_status_check/i.test(msg)){
        const e=new Error('O Supabase ainda está com a regra antiga de status. Execute o arquivo sql_v103_correcao_definitiva_status_rastreamento.sql no SQL Editor antes de atualizar o rastreio.');
        e.httpStatus=409; e.resposta={statusCalculado:n.status,statusCorreios:n.desc,erroBanco:msg};
        throw e;
      }
      throw dbErr;
    }

    // Só considera coleta realizada quando os Correios efetivamente registraram
    // a postagem (ou etapa posterior). "Etiqueta emitida" NÃO é coleta.
    if(registro?.coleta_agendamento_id && n.coletado){
      let atual=null;
      try{
        const cc=await supabaseRest('coleta_agendamentos',{query:`?select=id,status,status_api,coletado_em&id=eq.${encodeURIComponent(registro.coleta_agendamento_id)}&limit=1`});
        atual=cc?.[0]||null;
      }catch{}
      const jaColetada=Boolean(atual?.coletado_em)||/coletad/i.test(String(atual?.status||''));
      await supabaseRest('coleta_agendamentos',{
        method:'PATCH',
        query:`?id=eq.${encodeURIComponent(registro.coleta_agendamento_id)}`,
        body:{
          status:'coletado',
          status_api:n.desc,
          coletado_em:atual?.coletado_em||n.eventos?.[0]?.data||agora,
          sincronizado_em:agora,
          sincronizacao_erro:null,
          atualizado_em:agora
        }
      }).catch(()=>{});
      if(!jaColetada){
        await supabaseRest('coleta_status_eventos',{
          method:'POST',
          body:{
            agendamento_id:registro.coleta_agendamento_id,
            status_anterior:atual?.status||'solicitado',
            status_novo:'coletado',
            origem:'correios_postagem_automatica_v91',
            detalhes:{codigo,descricao:n.desc},
            usuario:'sistema'
          }
        }).catch(()=>{});
      }
    }
  }

  return json(res,200,{
    ok:true,
    codigoObjeto:codigo,
    codigoDescobertoAutomaticamente:Boolean(auto?.codigo),
    status:n.status,
    statusBruto:n.desc,
    coletado:n.coletado,
    dados:d,
    eventos:n.eventos
  });
}catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}};
