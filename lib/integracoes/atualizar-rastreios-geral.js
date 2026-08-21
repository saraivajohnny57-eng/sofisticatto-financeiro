const {json,exigirAdminOuCron,supabaseRest}=require('./_utils');

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\bcoreios\b/g,'correios');}
function statusSSW(desc,codigo){
  const s=norm(`${desc||''} ${codigo||''}`);
  if(/entreg|baixa realizada|ctrc entregue|entrega realizada/.test(s))return'entregue';
  if(/saiu.*entrega|em rota|rota de entrega|veiculo em entrega/.test(s))return'saiu_entrega';
  if(/filial|unidade|chegada|recebid.*unidade|transferencia/.test(s))return'na_filial';
  if(/cancel|devol/.test(s))return'cancelado';
  if(/ocorr|insucesso|recusa|ausente|endereco|avaria|extravio/.test(s))return'ocorrencia';
  return'em_transito';
}
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
  if(/(^| )alfa( |$)/.test(n))return'alfa';
  const i=(integracoes||[]).find(x=>matchNome(nome,x.transportadora_nome));
  if(i&&(String(i.integracao_tipo||'').toLowerCase()==='webservice'||/ssw/i.test(String(i.api_versao||''))))return'ssw';
  if(/accert|(^| )tg( |$)/.test(n))return'ssw';
  return null;
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
  const oc=(rows||[]).find(x=>!x.transportadora_nome||matchNome(nome,x.transportadora_nome))||(rows||[])[0];
  if(!oc)return null;
  const st=statusSSW(oc.descricao,oc.codigo_ocorrencia);
  const quando=oc.data_hora_evento&&Number.isFinite(Date.parse(oc.data_hora_evento))?new Date(oc.data_hora_evento).toISOString():(oc.processado_em||oc.created_at||new Date().toISOString());
  const patch={
    status:st,status_api:oc.descricao||'Ocorrência SSW',
    ultima_ocorrencia:[oc.descricao,oc.complemento].filter(Boolean).join(' — '),
    ultima_ocorrencia_em:quando,metodo_consulta:'SSW / ocorrência recebida',
    consultado_api_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),
    atualizado_por:'sincronizacao_automatica_v46'
  };
  if(st==='entregue')patch.finalizado_em=quando;
  await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(item.id)}`,body:patch});
  return {status:st,descricao:oc.descricao||'Ocorrência SSW'};
}

module.exports=async function(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdminOuCron(req,res))return;
  try{
    const admin=String(process.env.INTEGRATIONS_ADMIN_KEY||'');
    if(!admin)return json(res,500,{ok:false,erro:'INTEGRATIONS_ADMIN_KEY não configurada no servidor.'});
    const integracoes=await supabaseRest('transportadora_integracoes',{query:'?select=transportadora_nome,status_tecnico,rastreamento_ativo,coleta_ativa,integracao_tipo,api_versao,convite_id&or=(rastreamento_ativo.eq.true,coleta_ativa.eq.true)&limit=500'}).catch(()=>[]);
    const rastreios=await supabaseRest('logistica_rastreamentos',{query:'?select=id,status,protocolo_rastreio,numero_cte,numero_nfe,chave_nfe,frete_transportadoras(nome)&sentido=eq.saida&status=not.in.(entregue,recebido,cancelado)&order=created_at.desc&limit=300'}).catch(()=>[]);
    const host=String(req.headers['x-forwarded-host']||req.headers.host||process.env.VERCEL_URL||'').replace(/^https?:\/\//,'');
    const proto=String(req.headers['x-forwarded-proto']||'https');
    if(!host)return json(res,500,{ok:false,erro:'Não foi possível determinar a URL do portal.'});
    const base=`${proto}://${host}/api/integracoes`;
    const resultados=[];let consultados=0,atualizados=0,entregues=0,erros=0,ignorados=0;

    for(const item of (rastreios||[])){
      const nome=item.frete_transportadoras?.nome||'';
      const tipo=tipoIntegracao(nome,integracoes);
      if(!tipo){ignorados++;continue;}
      const temId=Boolean(item.protocolo_rastreio||item.numero_cte||item.numero_nfe||item.chave_nfe);
      if(!temId&&tipo!=='correios'){ignorados++;continue;}
      let action='';
      if(tipo==='rodonaves')action='consultar-rastreio-rodonaves';
      if(tipo==='alfa')action='consultar-rastreio-alfa';
      if(tipo==='correios')action='consultar-rastreio-correios';
      if(tipo==='ssw')action='consultar-rastreio-ssw';
      const qp=new URLSearchParams({action,registro_id:String(item.id)});
      if(tipo==='correios'){
        const cod=String(item.protocolo_rastreio||item.numero_cte||'').trim().toUpperCase();
        if(/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod))qp.set('codigo',cod);
      }
      try{
        consultados++;
        const rr=await fetch(`${base}?${qp}`,{headers:{'x-integrations-admin-key':admin,Accept:'application/json'}});
        const d=await rr.json().catch(()=>({}));
        if(!rr.ok)throw new Error(d.erro||`HTTP ${rr.status}`);
        atualizados++;
        if(String(d.status||'')==='entregue')entregues++;
        resultados.push({id:item.id,transportadora:nome,tipo,ok:true,status:d.status||null});
      }catch(e){
        if(tipo==='ssw'){
          try{
            const local=await aplicarUltimaOcorrenciaSSW(item);
            if(local){atualizados++;if(local.status==='entregue')entregues++;resultados.push({id:item.id,transportadora:nome,tipo,ok:true,fonte:'ocorrencia_ssw',status:local.status});continue;}
          }catch{}
        }
        erros++;resultados.push({id:item.id,transportadora:nome,tipo,ok:false,erro:e.message});
      }
      await new Promise(r=>setTimeout(r,180));
    }
    return json(res,200,{ok:true,total:(rastreios||[]).length,consultados,atualizados,entregues,erros,ignorados,resultados:resultados.slice(0,100),executado_em:new Date().toISOString()});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
