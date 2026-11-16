// Gateway restrito ao Portal. Nenhuma chave service_role é enviada ao navegador.
const auth=require('./secure');
const BLOCKED=new Set([
  'gnre_certificados','integracao_credenciais','integracao_configuracoes',
  'integracoes_bancarias_segredos','integracoes_bradesco_segredos',
  'email_remetentes_smtp','transportadora_endpoints',
  'sofisticatto_dfe_cursor','sofisticatto_dfe_documentos','gnre_homologacao_execucoes',
  'integracao_logs','integracao_convites','integracao_mensagens'
]);
const BANK=new Set([
  'bancos','boletos','notificacoes','notificacoes_sistema','cobrancas_bancarias',
  'integracoes_bancarias_titulos','condicoes_pagamento','email_clientes',
  'email_formas_pagamento','email_prazos_pagamento','email_relatorios_clientes'
]);
const DELIVERY=new Set([
  'corridas','corridas_entregadores','corridas_fechamentos','corridas_feriados',
  'coleta_agendamentos','coleta_status_eventos','coleta_locais',
  'logistica_rastreamentos','notificacoes_sistema'
]);
const TRACKING=new Set([
  'coleta_agendamentos','coleta_locais','coleta_modelos','coleta_pedidos_vinculados','coleta_status_eventos',
  'correios_envios','correios_remetentes','frete_cotacoes','frete_cotacao_respostas',
  'frete_cotacao_negociacoes','frete_icms_uf','frete_modelos','frete_transportadoras',
  'frete_transportadora_cobertura','logistica_rastreamentos',
  'painel_logistico_pendencias','rodonaves_cidades_cache','rodonaves_cotacoes_api',
  'ssw_ocorrencias_recebidas','transportadora_servicos','transportadora_integracoes',
  'email_clientes','email_vendedoras','notificacoes_sistema'
]);
const FUNCTIONS=new Set([
  'relatorio_atualizar_parcelas_v429','frete_cobertura_destino','frete_normalizar_texto',
  'fn_status_rastreio_rank','listar_rodonaves_cotacoes_seguras',
  'fn_deduplicar_rastreamento','bradesco_reservar_seu_numero',
  'fechar_corridas_entregador','excluir_fechamento_corridas'
]);
const ALLOWED_METHODS=new Set(['GET','HEAD','POST','PATCH','DELETE','PUT']);
function fail(res,status,message) {
  res.setHeader('Cache-Control','no-store');
  return res.status(status).json({code:'PORTAL_FINANCEIRO02',message});
}
function canReadOrWrite(user,table,method) {
  const role=String(user.tipo||'').toLowerCase();
  if(table==='usuarios') return role==='admin';
  if(BLOCKED.has(table)) return false;
  if(role==='admin') return true;
  if(role==='financeiro') return true;
  if(role==='banco') return BANK.has(table) && (method!=='DELETE' || table==='notificacoes');
  if(role==='cobranca') return BANK.has(table) && method!=='DELETE';
  if(role==='entregador') return DELIVERY.has(table);
  if(role==='gerente_rastreio') return TRACKING.has(table);
  if(role==='vendedora_rastreio') return TRACKING.has(table) && !['DELETE'].includes(method);
  return false;
}
function permitted(user, name, method, kind) {
  if(kind==='rpc') {
    if(!FUNCTIONS.has(name)) return false;
    if(name.includes('bradesco') || name.includes('relatorio_')) return ['admin','financeiro','banco'].includes(user.tipo);
    if(name.includes('corridas')) return ['admin','entregador','financeiro'].includes(user.tipo);
    return ['admin','financeiro','gerente_rastreio','vendedora_rastreio'].includes(user.tipo);
  }
  return canReadOrWrite(user,name,method);
}
async function collect(req) {
  if(Buffer.isBuffer(req.body)) return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body);
  if(req.body && typeof req.body==='object')return Buffer.from(JSON.stringify(req.body));
  const blocks=[];let length=0;
  for await (const chunk of req){
    length+=chunk.length;
    if(length>4*1024*1024)throw Object.assign(new Error('Corpo excede 4MB'),{status:413});
    blocks.push(chunk);
  }
  return Buffer.concat(blocks);
}
module.exports=async function handler(req,res) {
  try {
    if(!ALLOWED_METHODS.has(req.method))return fail(res,405,'Método inválido');
    if(!auth.sameOrigin(req))return fail(res,403,'Origem não autorizada');
    const user=auth.session(req);
    if(!user)return fail(res,401,'Sessão inválida ou expirada. Faça login novamente.');
    const raw=String(req.query.path||'');
    if(!raw.startsWith('/') || raw.length>10000 || raw.startsWith('//'))return fail(res,400,'Caminho inválido');
    const u=new URL(raw,'https://xrtpidsqbfdlgjefuobs.supabase.co');
    if(u.origin!=='https://xrtpidsqbfdlgjefuobs.supabase.co')return fail(res,403,'Destino inválido');
    const segments=u.pathname.split('/').filter(Boolean);
    const isTable=segments.length===3 && segments[0]==='rest' && segments[1]==='v1' && /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(segments[2]);
    const isRpc=segments.length===4 && segments[0]==='rest' && segments[1]==='v1' && segments[2]==='rpc' && /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(segments[3]);
    const isStorage=segments[0]==='storage' && segments[1]==='v1' && segments[2]==='object' && segments.length>=5 &&
      ((segments[3]==='email-assinaturas') || (segments[3]==='public' && segments[4]==='email-assinaturas'));
    if(!isTable && !isRpc && !isStorage) return fail(res,403,'Rota não autorizada');
    if(isStorage) {
      if(!['admin','financeiro'].includes(user.tipo))return fail(res,403,'Acesso a arquivos não autorizado');
      if(!['GET','HEAD','POST','PUT','DELETE'].includes(req.method))return fail(res,403,'Operação inválida');
    }else {
      const name=isRpc?segments[3]:segments[2];
      if(!permitted(user,name,req.method,isRpc?'rpc':'table'))return fail(res,403,'Permissão insuficiente para esta operação');
      if(!isRpc && name==='usuarios' && req.method==='GET') {
        // Impede retorno da senha mesmo para o administrador.
        const select=u.searchParams.get('select');
        if(select==='*' || !select || select.includes('senha'))u.searchParams.set('select','id,login,tipo,nome_exibicao,ativo,vendedora_id,entregador_id,email_remetente,email_recebimento');
      }
      // Nunca permitir consultar credenciais por relacionamento com outra tabela.
      const queryDecode=decodeURIComponent(u.search);
      if(/integracoes?_.*segredos|gnre_certificados|integracao_credenciais|email_remetentes_smtp|usuarios\s*\(/i.test(queryDecode))
        return fail(res,403,'Relacionamento não autorizado');
    }
    const {url,key}=auth.config();
    const forwardHeaders={apikey:key,Authorization:'Bearer '+key};
    for(const header of ['content-type','accept','prefer','range','accept-profile','content-profile','x-upsert']){
      if(req.headers[header])forwardHeaders[header]=req.headers[header];
    }
    const body=['GET','HEAD'].includes(req.method)?undefined:await collect(req);
    const response=await fetch(url+u.pathname+u.search,{method:req.method,headers:forwardHeaders,body,cache:'no-store',signal:AbortSignal.timeout(20000)});
    for(const header of ['content-type','content-range','location','etag','preference-applied']){
      const value=response.headers.get(header);if(value)res.setHeader(header,value);
    }
    res.setHeader('Cache-Control','no-store');
    const rawData=Buffer.from(await response.arrayBuffer());
    if(isTable && segments[2]==='usuarios' && response.ok && rawData.length) {
      try {
        const parsed=JSON.parse(rawData.toString('utf8'));
        const remove=(u)=>{if(!u || typeof u!=='object')return u; const {senha,...safe}=u;return safe;};
        return res.status(response.status).send(JSON.stringify(Array.isArray(parsed)?parsed.map(remove):remove(parsed)));
      }catch{return fail(res,502,'Não foi possível proteger a resposta de usuários');}
    }
    return res.status(response.status).send(rawData);
  }catch(e){
    console.error('[Financeiro02 portal-data]',e.status||500,String(e.message||'').slice(0,180));
    return fail(res,e.status||502,'Não foi possível acessar a API do Financeiro02');
  }
};