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
function valorCampo(o, nomes){
  if(!o||typeof o!=="object")return null;
  const alvo=new Set(nomes.map(x=>norm(x).replace(/[^a-z0-9]/g,'')));
  for(const [k,v] of Object.entries(o)){
    if(alvo.has(norm(k).replace(/[^a-z0-9]/g,'')) && v!=null && typeof v!=="object" && txt(v))return v;
  }
  return null;
}
function localEvento(x){
  const cidade=txt(valorCampo(x,['cidade','cidadeOcorrencia','municipio','localidade']));
  const uf=txt(valorCampo(x,['uf','estado','ufOcorrencia']));
  const unidade=txt(valorCampo(x,['unidade','filial','unidadeBraspress','nomeFilial','terminal']));
  const local=txt(valorCampo(x,['local','localOcorrencia']));
  return [local||cidade,uf,unidade].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
}
function extrairEventos(d){
  // Estrutura oficial Tracking V3 Braspress:
  // { conhecimentos:[{ timeline:[{descricao,data}], ocorrencias:[{descricao,data}], ... }] }
  const conhecimentos=Array.isArray(d?.conhecimentos)?d.conhecimentos:[];
  const eventos=[];
  for(const c of conhecimentos){
    const base={
      conhecimento:txt(c?.numero),
      origem:txt(c?.origem),
      destino:[txt(c?.cidade),txt(c?.uf)].filter(Boolean).join(' / '),
      previsaoEntrega:txt(c?.previsaoEntrega),
      dataEntrega:txt(c?.dataEntrega)
    };
    for(const x of (Array.isArray(c?.timeline)?c.timeline:[])){
      eventos.push({
        titulo:txt(x?.descricao)||'Movimentação Braspress',
        descricao:txt(x?.descricao)||'Movimentação Braspress',
        data:dataVal(x?.data), local:'', unidade:'', destino:base.destino,
        codigo:'', recebedor:'', documentoRecebedor:'', comprovante:'',
        tipo:'timeline', conhecimento:base.conhecimento, origem:base.origem,
        previsaoEntrega:base.previsaoEntrega, oficial:true
      });
    }
    for(const x of (Array.isArray(c?.ocorrencias)?c.ocorrencias:[])){
      eventos.push({
        titulo:txt(x?.descricao)||'Ocorrência Braspress',
        descricao:txt(x?.descricao)||'Ocorrência Braspress',
        data:dataVal(x?.data), local:'', unidade:'', destino:base.destino,
        codigo:'', recebedor:'', documentoRecebedor:'', comprovante:'',
        tipo:'ocorrencia', conhecimento:base.conhecimento, origem:base.origem,
        previsaoEntrega:base.previsaoEntrega, oficial:true
      });
    }
  }
  // Compatibilidade defensiva se a Braspress alterar/encapsular o JSON.
  if(!eventos.length){
    const candidatos=arrays(d).sort((a,b)=>b.length-a.length);
    const arr=candidatos.find(a=>a.some(x=>x&&typeof x==='object'&&(deep(x,['descricao','ocorrencia','status','evento','historico','descricaoOcorrencia'])||deep(x,['data','dataHora','dataOcorrencia','dataEvento']))))||[];
    for(const x of arr){
      const titulo=txt(valorCampo(x,['ocorrencia','evento','status','situacao','descricaoStatus','tipo']))||txt(deep(x,['ocorrencia','evento','status','situacao','descricaoStatus']));
      const descricao=txt(valorCampo(x,['descricao','descricaoOcorrencia','historico','mensagem','complemento','detalhe']))||titulo;
      eventos.push({titulo:titulo||descricao||'Ocorrência Braspress',descricao,data:dataVal(valorCampo(x,['dataHora','dataOcorrencia','dataEvento','data','dataStatus','dataMovimento','data_hora'])),local:localEvento(x),unidade:txt(valorCampo(x,['unidade','filial','unidadeBraspress','nomeFilial','terminal'])),destino:txt(valorCampo(x,['destino','unidadeDestino','filialDestino','cidadeDestino'])),codigo:txt(valorCampo(x,['codigo','codigoOcorrencia','codOcorrencia','codigoEvento'])),recebedor:txt(valorCampo(x,['recebedor','nomeRecebedor','recebidoPor'])),documentoRecebedor:txt(valorCampo(x,['documentoRecebedor','cpfRecebedor','rgRecebedor'])),comprovante:txt(valorCampo(x,['comprovante','urlComprovante','linkComprovante','imagemComprovante'])),tipo:'generico',oficial:false});
    }
  }
  return eventos.filter(x=>x.descricao||x.titulo||x.data);
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
    const conhecimentos=Array.isArray(d?.conhecimentos)?d.conhecimentos:[];
    const conhecimento=conhecimentos[0]||{};
    const eventos=extrairEventos(d);const ultimo=eventos.filter(x=>x.data).sort((a,b)=>Date.parse(b.data)-Date.parse(a.data))[0]||eventos[eventos.length-1]||null;
    const statusBruto=txt(conhecimento.status)||txt(conhecimento.ultimaOcorrencia)||txt(deep(d,['status','situacao','statusEntrega','descricaoStatus']))||ultimo?.descricao||'Em trânsito';
    const status=statusInterno(`${statusBruto} ${conhecimento.ultimaOcorrencia||''} ${ultimo?.descricao||''}`);
    const previsaoRaw=conhecimento.previsaoEntrega||deep(d,['previsaoEntrega','dataPrevisaoEntrega','previsao','dataEntregaPrevista']);
    const previsao=dataVal(previsaoRaw);const cte=txt(conhecimento.numero)||txt(deep(d,['cte','numeroCte','conhecimento','numeroConhecimento']));
    const origem=txt(conhecimento.origem)||[txt(conhecimento.cidadeColeta),txt(conhecimento.ufColeta)].filter(Boolean).join(' / ')||txt(deep(d,['origem','cidadeOrigem','filialOrigem']));
    const destino=[txt(conhecimento.cidade),txt(conhecimento.uf)].filter(Boolean).join(' / ')||txt(deep(d,['destino','cidadeDestino','filialDestino']));
    const dataColeta=dataVal(conhecimento.emissao||deep(d,['dataColeta','coleta','dataEmissao','dataPostagem']));
    const recebedor=txt(deep(d,['recebedor','nomeRecebedor','recebidoPor']));
    const detalhesConhecimento=conhecimentos.map(c=>({numero:txt(c.numero),origem:txt(c.origem),emissao:txt(c.emissao),remetente:txt(c.remetente),destinatario:txt(c.destinatario),tipoFrete:txt(c.tipoFrete),volumes:c.volumes??null,valorMercantil:c.valorMercantil??null,peso:c.peso??null,totalFrete:c.totalFrete??null,previsaoEntrega:txt(c.previsaoEntrega),dataEntrega:txt(c.dataEntrega),status:txt(c.status),cidade:txt(c.cidade),uf:txt(c.uf),cidadeColeta:txt(c.cidadeColeta),ufColeta:txt(c.ufColeta),dataOcorrencia:txt(c.dataOcorrencia),ultimaOcorrencia:txt(c.ultimaOcorrencia),notasFiscais:Array.isArray(c.notasFiscais)?c.notasFiscais:[]}));
    const agora=new Date().toISOString();
    if(registroId){const patch={status,status_api:statusBruto,numero_cte:cte||null,previsao_entrega:previsao?previsao.slice(0,10):null,ultima_ocorrencia:ultimo?.descricao||statusBruto,ultima_ocorrencia_em:ultimo?.data||agora,consulta_api:{retorno:d,eventos,conhecimentos:detalhesConhecimento,fonte:'Braspress Tracking V3',nf,origem,destino,dataColeta,recebedor,previsaoEntrega:previsao?previsao.slice(0,10):null,numeroCte:cte||null},metodo_consulta:'Braspress API V3 • NF',consultado_api_em:agora,sincronizacao_erro:null,atualizado_em:agora,atualizado_por:'api_braspress_v215'};if(status==='entregue')patch.finalizado_em=ultimo?.data||agora;await supabaseRest('logistica_rastreamentos',{method:'PATCH',query:`?id=eq.${encodeURIComponent(registroId)}`,body:patch});}
    return json(res,200,{ok:true,status,statusBruto,previsaoEntrega:previsao?previsao.slice(0,10):null,numeroCte:cte||null,origem,destino,dataColeta,recebedor,ultimaOcorrencia:txt(conhecimento.ultimaOcorrencia)||ultimo?.descricao||statusBruto,ultimaOcorrenciaEm:dataVal(conhecimento.dataOcorrencia)||ultimo?.data||null,eventos,conhecimentos:detalhesConhecimento,dados:d,metodoConsulta:'Braspress API V3 • NF'});
  }catch(e){return json(res,500,{ok:false,erro:e.message});}
};
