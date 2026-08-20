const crypto=require('crypto');
const {supabaseRest}=require('../lib/integracoes/_utils');

function json(res,status,data){return res.status(status).json(data)}
function dig(v){return String(v??'').replace(/\D/g,'')}
function texto(v){return String(v??'').trim()}
function primeiro(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||''}
function normalizarStatus(desc,codigo){
  const s=`${desc} ${codigo||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/entreg|baixa realizada|ctrc entregue|entrega realizada/.test(s))return 'entregue';
  if(/saiu.*entrega|em rota|rota de entrega|veiculo em entrega/.test(s))return 'saiu_entrega';
  if(/filial|unidade|chegada|recebida.*unidade/.test(s))return 'na_filial';
  if(/transito|em viagem|transferencia|coleta realizada|coletada|coletado|mercadoria colet/.test(s))return 'em_transito';
  if(/cancel|devol/.test(s))return 'cancelado';
  if(/ocorr|insucesso|recusa|ausente|endereco/.test(s))return 'ocorrencia';
  return 'em_transito';
}
function eventoColeta(desc,codigo){
  const s=`${desc} ${codigo||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /coleta realizada|coletada|coletado|mercadoria colet/.test(s);
}

module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido.'});
  try{
    const conviteId=texto(req.query?.convite_id);
    if(!conviteId)return json(res,400,{ok:false,erro:'convite_id é obrigatório no URL do WebService SSW.'});

    const conv=await supabaseRest('integracao_convites',{query:`?select=id,transportadora_nome&id=eq.${encodeURIComponent(conviteId)}&limit=1`});
    if(!conv?.[0]?.id)return json(res,404,{ok:false,erro:'Integração não encontrada.'});
    const nomeTransportadora=conv[0].transportadora_nome;

    // Resolve a transportadora de forma tolerante a maiúsculas/minúsculas e pequenos
    // espaços no cadastro. Isso evita que uma ocorrência SSW seja criada sem vínculo
    // apenas porque o nome do convite não ficou byte a byte igual ao cadastro.
    let trans=await supabaseRest('frete_transportadoras',{
      query:`?select=id,nome&nome=ilike.${encodeURIComponent(nomeTransportadora)}&limit=1`
    }).catch(()=>[]);
    if(!trans?.length){
      const todas=await supabaseRest('frete_transportadoras',{query:'?select=id,nome&limit=500'}).catch(()=>[]);
      const norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
      const alvo=norm(nomeTransportadora);
      const achada=(todas||[]).find(t=>norm(t.nome)===alvo);
      if(achada)trans=[achada];
    }
    const transportadoraId=trans?.[0]?.id||null;

    const corpo=req.body||{};
    const itens=Array.isArray(corpo)?corpo: [corpo];
    const resultados=[];
    for(const item of itens){
      const nf=item.nf||{};
      const cte=item.cte||{};
      const oc=item.ocorrencia||{};
      const numeroNfe=texto(primeiro(nf.numeroNFe,nf.numeroNfe));
      const chaveNfe=dig(primeiro(nf.chaveNFe,nf.chaveNfe));
      const codigo=texto(oc.codigo);
      const descricao=texto(oc.descricao)||'Ocorrência SSW';
      const complemento=texto(oc.complemento);
      const dataEvento=texto(oc.dataHoraEvento);
      const numeroCte=texto(primeiro(cte.numeroCTe,cte.numeroCte));
      const chaveCte=dig(primeiro(cte.chaveCTe,cte.chaveCte));
      const protocolo=texto(item.retorno?.protocolo||'');
      const hash=crypto.createHash('sha256').update(JSON.stringify({conviteId,numeroNfe,chaveNfe,codigo,descricao,complemento,dataEvento,numeroCte,chaveCte})).digest('hex');

      const dup=await supabaseRest('ssw_ocorrencias_recebidas',{query:`?hash_evento=eq.${hash}&limit=1`});
      if(dup?.length){resultados.push({nf:numeroNfe,duplicado:true});continue;}

      const status=normalizarStatus(descricao,codigo);
      const agora=new Date().toISOString();
      let rast=[];
      if(chaveNfe) rast=await supabaseRest('logistica_rastreamentos',{query:`?chave_nfe=eq.${chaveNfe}&transportadora_id=eq.${encodeURIComponent(transportadoraId||'00000000-0000-0000-0000-000000000000')}&limit=1`});
      if(!rast?.length && numeroNfe) rast=await supabaseRest('logistica_rastreamentos',{query:`?numero_nfe=eq.${encodeURIComponent(numeroNfe)}&transportadora_id=eq.${encodeURIComponent(transportadoraId||'00000000-0000-0000-0000-000000000000')}&limit=1`});

      const patch={status,status_api:descricao,numero_cte:numeroCte||null,ultima_ocorrencia:complemento?`${descricao} — ${complemento}`:descricao,ultima_ocorrencia_em:new Date(dataEvento).toString()!=='Invalid Date'?new Date(dataEvento).toISOString():agora,consulta_api:{origem:'ssw_webservice_ocorrencias',codigo,descricao,complemento,dataHoraEvento:dataEvento,nf,cte,ocorrencia:oc},metodo_consulta:'push_ssw2181',consultado_api_em:agora,sincronizacao_erro:null,atualizado_em:agora,atualizado_por:'ssw_webservice_ocorrencias'};
      if(status==='entregue')patch.finalizado_em=agora;

      if(rast?.[0]?.id){
        await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(rast[0].id)}`,body:patch});
      }else if(numeroNfe||chaveNfe){
        const novo={sentido:'saida',parceiro_nome:nomeTransportadora,transportadora_id:transportadoraId,numero_nfe:numeroNfe||null,chave_nfe:chaveNfe||null,numero_cte:numeroCte||null,protocolo_rastreio:protocolo||null,volumes:null,status,observacao:complemento||descricao,finalizado_em:status==='entregue'?agora:null,atualizado_em:agora,atualizado_por:'ssw_webservice_ocorrencias'};
        await supabaseRest('logistica_rastreamentos',{method:'POST',body:novo});
      }

      let coletas=[];
      if(numeroNfe)coletas=await supabaseRest('coleta_agendamentos',{query:`?numero_nf=eq.${encodeURIComponent(numeroNfe)}&transportadora_id=eq.${encodeURIComponent(transportadoraId||'00000000-0000-0000-0000-000000000000')}&limit=10`});
      if(eventoColeta(descricao,codigo)||status!=='aguardando_coleta'){
        for(const c of (coletas||[])){
          const patchColeta={status_api:status==='entregue'?'coletado':'coletado',status:'coletado',coletado_em:agora,sincronizado_em:agora,sincronizacao_erro:null,atualizado_em:agora};
          await supabaseRest('coleta_agendamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(c.id)}`,body:patchColeta});
          await supabaseRest('coleta_status_eventos',{method:'POST',body:{agendamento_id:c.id,status_anterior:c.status,status_novo:'coletado',origem:'ssw_webservice_ocorrencias',detalhes:{codigo,descricao,numeroNfe,chaveNfe},usuario:'sistema'}}).catch(()=>{});
        }
      }

      await supabaseRest('ssw_ocorrencias_recebidas',{method:'POST',body:{convite_id:conviteId,transportadora_nome:nomeTransportadora,hash_evento:hash,numero_nfe:numeroNfe||null,chave_nfe:chaveNfe||null,codigo_ocorrencia:codigo||null,descricao,complemento,data_hora_evento:dataEvento||null,payload:item,processado_em:agora}});
      resultados.push({nf:numeroNfe,chave:chaveNfe,status,processado:true});
    }

    return json(res,200,{ok:true,transportadora:nomeTransportadora,resultados});
  }catch(e){console.error('[SSW OCORRENCIAS]',e);return json(res,500,{ok:false,erro:e.message});}
};
