const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {BASE,soDigitos,headers,ler,credenciaisBraspressProducao}=require('./_braspress');

function txt(v){return String(v??'').trim();}
function norm(v){return txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function deep(obj, nomes){
  const alvo=new Set(nomes.map(x=>norm(x).replace(/[^a-z0-9]/g,'')));
  let achado=null;
  (function walk(v){
    if(achado!=null||v==null)return;
    if(Array.isArray(v)){for(const x of v)walk(x);return;}
    if(typeof v!=='object')return;
    for(const [k,val] of Object.entries(v)){
      const nk=norm(k).replace(/[^a-z0-9]/g,'');
      if(alvo.has(nk)&&val!=null&&typeof val!=='object'&&txt(val)){achado=val;return;}
    }
    for(const val of Object.values(v))walk(val);
  })(obj);
  return achado;
}
function arrays(obj, out=[]){
  if(Array.isArray(obj)){if(obj.some(x=>x&&typeof x==='object'))out.push(obj);for(const x of obj)arrays(x,out);}
  else if(obj&&typeof obj==='object')for(const v of Object.values(obj))arrays(v,out);
  return out;
}
function dataVal(v){if(!v)return null;const s=txt(v);const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);if(br){const d=new Date(`${br[3]}-${br[2]}-${br[1]}T${br[4]||'12'}:${br[5]||'00'}:${br[6]||'00'}-03:00`);return Number.isFinite(d.getTime())?d.toISOString():null;}const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString():null;}
function statusInterno(texto){const s=norm(texto);if(/entregue|entrega realizada|mercadoria entregue|recebido pelo destinatario/.test(s))return'entregue';if(/saiu.*entrega|rota.*entrega|em entrega/.test(s))return'saiu_entrega';if(/cancel|devol/.test(s))return'cancelado';if(/ocorr|recusa|ausente|avaria|extravio|sinistro|fiscal/.test(s))return'ocorrencia';if(/filial|unidade destino|chegada/.test(s))return'na_filial';return'em_transito';}
function extrairEventos(d){
  const candidatos=arrays(d).sort((a,b)=>b.length-a.length);
  const arr=candidatos.find(a=>a.some(x=>x&&typeof x==='object'&&(deep(x,['descricao','ocorrencia','status','evento','historico'])||deep(x,['data','dataHora','dataOcorrencia','dataEvento']))))||[];
  return arr.map(x=>({
    descricao:txt(deep(x,['descricao','ocorrencia','status','evento','historico','descricaoOcorrencia','statusDescricao'])),
    data:dataVal(deep(x,['dataHora','dataOcorrencia','dataEvento','data','dataStatus','dataMovimento'])),
    local:txt(deep(x,['local','cidade','unidade','filial','localidade'])),
    codigo:txt(deep(x,['codigo','codigoOcorrencia','codOcorrencia']))
  })).filter(x=>x.descricao||x.data);
}

module.exports=async function(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res))return;
  const registroId=txt(req.query.registro_id), nf=soDigitos(req.query.nfe||req.query.nf), conviteId=txt(req.query.convite_id);
  if(!nf)return json(res,400,{ok:false,erro:'Informe o número da NF para rastrear na Braspress.'});
  try{
    const achado=await credenciaisBraspressProducao(conviteId);
    const c=achado.credenciais;const cnpj=soDigitos(c.braspress_cnpj);if(!cnpj)throw new Error('CNPJ do remetente Braspress não configurado.');
    const r=await fetch(`${BASE}/v3/tracking/byNf/${encodeURIComponent(cnpj)}/${encodeURIComponent(nf)}/json`,{headers:headers(c)});
    const d=await ler(r);if(!r.ok)return json(res,r.status===404?404:502,{ok:false,erro:`Braspress retornou HTTP ${r.status}: ${d?.message||d?.mensagem||d?.raw||'falha no rastreamento'}`,detalhes:d});
    const eventos=extrairEventos(d);const ultimo=eventos.filter(x=>x.data).sort((a,b)=>Date.parse(b.data)-Date.parse(a.data))[0]||eventos[eventos.length-1]||null;
    const statusBruto=txt(deep(d,['status','situacao','statusEntrega','descricaoStatus']))||ultimo?.descricao||'Em trânsito';
    const status=statusInterno(`${statusBruto} ${ultimo?.descricao||''}`);
    const previsaoRaw=deep(d,['previsaoEntrega','dataPrevisaoEntrega','previsao','dataEntregaPrevista']);
    const previsao=dataVal(previsaoRaw);const cte=txt(deep(d,['cte','numeroCte','conhecimento','numeroConhecimento']));
    const agora=new Date().toISOString();
    if(registroId){const patch={status,status_api:statusBruto,numero_cte:cte||null,previsao_entrega:previsao?previsao.slice(0,10):null,ultima_ocorrencia:ultimo?.descricao||statusBruto,ultima_ocorrencia_em:ultimo?.data||agora,consulta_api:{retorno:d,eventos,fonte:'Braspress Tracking V3',nf},metodo_consulta:'Braspress API V3 • NF',consultado_api_em:agora,sincronizacao_erro:null,atualizado_em:agora,atualizado_por:'api_braspress_v215'};if(status==='entregue')patch.finalizado_em=ultimo?.data||agora;await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});}
    return json(res,200,{ok:true,status,statusBruto,previsaoEntrega:previsao?previsao.slice(0,10):null,numeroCte:cte||null,ultimaOcorrencia:ultimo?.descricao||statusBruto,ultimaOcorrenciaEm:ultimo?.data||null,eventos,dados:d});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
