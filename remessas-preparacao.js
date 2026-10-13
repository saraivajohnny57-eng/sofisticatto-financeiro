/* V357 — Preparação local de títulos para futura integração CNAB.
   Não registra boletos, não gera linha digitável nem transmite arquivos ao banco. */
(()=>{'use strict';
const KEY='sofisticatto_remessas_preparacao_v357';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ler(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function gravar(a){localStorage.setItem(KEY,JSON.stringify(a));render()}
function dinheiro(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function id(){return 'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function formulario(){return {banco:$('remBanco').value,cliente:$('remCliente').value.trim(),documento:$('remDocumento').value.replace(/\D/g,''),pedido:$('remPedido').value.trim(),valor:Math.round(Number($('remValor').value)*100),vencimento:$('remVencimento').value,observacoes:$('remObservacoes').value.trim()}}
// V358 — pesquisa no cadastro existente de clientes, por nome, CPF ou CNPJ.
// Respeita o cliente Supabase e as politicas RLS da sessao atual; nao cria novos clientes.
let buscaSequencia=0, buscaTimer=null, sugestoesAtuais=[];
const soDigitos=v=>String(v||'').replace(/\D/g,'');
function esconderSugestoes(){const el=$('remSugestoes');if(el)el.style.display='none';$('remCliente')?.setAttribute('aria-expanded','false')}
window.remessaEscolherClienteV358=function(indice){const c=sugestoesAtuais[indice];if(!c)return;$('remCliente').value=c.nome||'';$('remDocumento').value=c.cpf_cnpj||'';esconderSugestoes();$('remBuscaStatus').textContent='Cliente selecionado do cadastro.';}
window.remessaBuscarClientesV358=function(){
 const termo=$('remCliente')?.value.trim()||'', status=$('remBuscaStatus');
 const seq=++buscaSequencia;clearTimeout(buscaTimer);
 if(termo.length<2){esconderSugestoes();if(status)status.textContent='Digite pelo menos 2 caracteres.';return}
 buscaTimer=setTimeout(async()=>{
  const db=typeof banco!=='undefined'?banco:null;
  if(!db||typeof db.from!=='function'){if(status)status.textContent='Cadastro indisponivel nesta sessao.';return}
  if(status)status.textContent='Pesquisando clientes...';
  try{
   const digits=soDigitos(termo), filtros=[];
   // Consulta separada evita interpolar caracteres especiais no filtro PostgREST.
   const respostas=[await db.from('email_clientes').select('id,nome,cpf_cnpj').ilike('nome','%'+termo.replace(/[%_]/g,'')+'%').limit(15)];
   if(digits.length>=3)respostas.push(await db.from('email_clientes').select('id,nome,cpf_cnpj').ilike('cpf_cnpj','%'+digits+'%').limit(15));
   if(seq!==buscaSequencia)return;
   const mapa=new Map();let erro=null;
   for(const r of respostas){if(r.error){erro=r.error;continue}for(const c of r.data||[])mapa.set(String(c.id),c)}
   sugestoesAtuais=[...mapa.values()].slice(0,20);
   const el=$('remSugestoes');if(!el)return;
   el.innerHTML=sugestoesAtuais.map((c,i)=>'<button type="button" role="option" style="display:block;width:100%;text-align:left;background:white;color:#242424;border:0;border-bottom:1px solid #eee;padding:9px;cursor:pointer" onclick="remessaEscolherClienteV358('+i+')"><strong>'+escape(c.nome)+'</strong><br><small>'+escape(c.cpf_cnpj||'Documento nao cadastrado')+'</small></button>').join('');
   el.style.display=sugestoesAtuais.length?'block':'none';$('remCliente').setAttribute('aria-expanded',String(!!sugestoesAtuais.length));
   if(status)status.textContent=sugestoesAtuais.length?sugestoesAtuais.length+' cliente(s) encontrado(s). Selecione um.':erro?'Consulta indisponivel: '+erro.message:'Nenhum cliente encontrado.';
  }catch(e){if(seq===buscaSequencia&&status)status.textContent='Nao foi possivel consultar o cadastro.'}
 },260);
};
window.remessaPrepararV357=function(){const d=formulario();if(!d.cliente||!/^\d{11}$|^\d{14}$/.test(d.documento)||!d.pedido||!Number.isSafeInteger(d.valor)||d.valor<=0||!d.vencimento){alert('Preencha cliente, CPF/CNPJ (11 ou 14 dígitos), pedido, valor positivo e vencimento.');return}const a=ler();if(a.some(x=>x.banco===d.banco&&x.documento===d.documento&&x.pedido===d.pedido)){if(!confirm('Ja existe rascunho para este banco, documento e pedido. Deseja adicionar outro mesmo assim?'))return}a.push({...d,id:id(),situacao:'rascunho',criadoEm:new Date().toISOString()});gravar(a)};
window.remessaAlterarV357=function(chave,acao){let a=ler(),d=a.find(x=>x.id===chave);if(!d)return;if(acao==='excluir'){if(!confirm('Excluir este rascunho local?'))return;a=a.filter(x=>x.id!==chave)}else if(acao==='aprovar'){d.situacao='aprovado';d.aprovadoEm=new Date().toISOString()}else if(acao==='reabrir'){d.situacao='rascunho';delete d.aprovadoEm}else if(acao==='editar'){if(d.situacao!=='rascunho'){alert('Reabra o rascunho antes de editar.');return}const valor=prompt('Valor em R$ (use ponto como decimal):',(d.valor/100).toFixed(2));if(valor===null)return;const cents=Math.round(Number(valor.replace(',','.'))*100);if(!Number.isSafeInteger(cents)||cents<=0){alert('Valor inválido.');return}const venc=prompt('Vencimento (AAAA-MM-DD):',d.vencimento);if(venc===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(venc)){alert('Data inválida.');return}d.valor=cents;d.vencimento=venc}gravar(a)};
window.remessaExportarV357=function(){const a=ler().filter(x=>x.situacao==='aprovado');if(!a.length){alert('Não há rascunhos aprovados.');return}const pacote={tipo:'CONFERENCIA_INTERNA_NAO_CNAB',versao:357,exportadoEm:new Date().toISOString(),aviso:'Este arquivo NÃO é remessa bancária. Não enviar ao banco. Sem Nosso Número ou código de barras bancário.',titulos:a};const b=new Blob([JSON.stringify(pacote,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),link=document.createElement('a');link.href=u;link.download='sofisticatto_conferencia_remessas_'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(u),3000)};
function render(){const el=$('remLista');if(!el)return;const a=ler();el.innerHTML=a.length?a.map(x=>`<tr><td>${escape(x.banco.toUpperCase())}</td><td>${escape(x.cliente)}<br><small>${escape(x.documento)} · Pedido ${escape(x.pedido)}</small></td><td>${dinheiro(x.valor/100)}</td><td>${escape(x.vencimento)}</td><td>${x.situacao==='aprovado'?'Aprovado para conferência':'Rascunho local'}</td><td><button class="btn" onclick="remessaAlterarV357('${x.id}','${x.situacao==='aprovado'?'reabrir':'editar'}')">${x.situacao==='aprovado'?'Reabrir':'Editar'}</button> ${x.situacao==='rascunho'?`<button class="btn verde" onclick="remessaAlterarV357('${x.id}','aprovar')">Aprovar</button>`:''} <button class="btn" onclick="remessaAlterarV357('${x.id}','excluir')">Excluir</button></td></tr>`).join(''):'<tr><td colspan="6">Nenhum título preparado neste navegador.</td></tr>';const s=$('remResumo');if(s)s.textContent=`${a.length} título(s) locais · ${a.filter(x=>x.situacao==='aprovado').length} aprovado(s) para conferência`}
// V359: consulta SOMENTE LEITURA aos mesmos lançamentos da tela Relatório Financeiro.
// A escolha preenche o formulário de rascunho; nunca envia ou registra boleto.
let relatoriosEmAndamentoV359=[];
window.remessaCarregarRelatoriosV359=async function(){
 const tb=$('remRelatoriosLista'),status=$('remRelatoriosStatus');if(!tb)return;
 tb.innerHTML='<tr><td colspan="7">Consultando relatórios...</td></tr>';if(status)status.textContent='Consultando lançamentos em andamento...';
 try{
  const db=typeof banco!=='undefined'?banco:null;if(!db)throw Error('Sessão do Supabase indisponível.');
  const {data,error}=await db.from('boletos').select('*').neq('status','Finalizado').order('valor',{ascending:false}).limit(500);
  if(error)throw error;
  relatoriosEmAndamentoV359=data||[];
  window.remessaFiltrarRelatoriosV359();
 }catch(e){relatoriosEmAndamentoV359=[];tb.innerHTML='<tr><td colspan="7">Não foi possível carregar os relatórios.</td></tr>';if(status)status.textContent='Erro ao consultar: '+String(e.message||e)}
};
window.remessaFiltrarRelatoriosV359=function(){
 const tb=$('remRelatoriosLista'),status=$('remRelatoriosStatus');if(!tb)return;
 const q=String($('remFiltroRelatorios')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const rows=relatoriosEmAndamentoV359.map((r,i)=>({r,i})).filter(({r})=>!q||[r.nome,r.numero_nf,r.pedido,r.nf,r.banco].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
 tb.innerHTML=rows.length?rows.map(({r,i})=>{
  const ps=Array.isArray(r.parcelas_json)?r.parcelas_json:[];
  const cond=escape(r.condicao_pagamento||'Não definida');
  const bancoTexto=escape(r.banco||'Não definido');
  const pedido=escape(r.numero_nf||r.pedido||r.nf||'—');
  return `<tr><td><input type="checkbox" class="remSelecionarV360" data-i="${i}" aria-label="Selecionar relatório ${escape(r.nome||'')}"></td><td>${escape(r.nome||'—')}</td><td>${bancoTexto}</td><td>${pedido}</td><td>${dinheiro(Number(r.valor)||0)}</td><td>${cond}${ps.length?' · '+ps.length+' parcela(s)':''}</td><td><button type="button" class="btn azul" onclick="remessaUsarRelatorioV359(${i})">Usar dados</button></td></tr>`;
 }).join(''):'<tr><td colspan="7">Nenhum relatório em andamento corresponde à pesquisa.</td></tr>';
 if(status)status.textContent=`${rows.length} relatório(s) exibido(s) · ${relatoriosEmAndamentoV359.length} carregado(s). Somente leitura; máximo de 500 por consulta.`;
};
window.remessaUsarRelatorioV359=async function(i){
 const r=relatoriosEmAndamentoV359[i];if(!r)return;
 const codigo=String(r.banco||'').toLocaleLowerCase('pt-BR');
 if(codigo.includes('bradesco'))$('remBanco').value='bradesco';
 else if(codigo.includes('brasil')||codigo==='bb')$('remBanco').value='bb';
 $('remCliente').value=String(r.nome||'');$('remPedido').value=String(r.numero_nf||r.pedido||r.nf||'');
 $('remValor').value=Number(r.valor||0).toFixed(2);
 $('remDocumento').value='';
 if(r.cliente_id){try{const db=typeof banco!=='undefined'?banco:null;if(db){const {data}=await db.from('email_clientes').select('cpf_cnpj').eq('id',r.cliente_id).maybeSingle();if(data?.cpf_cnpj)$('remDocumento').value=data.cpf_cnpj}}catch(e){console.warn('Documento do cliente não encontrado:',e)}}
 const ps=Array.isArray(r.parcelas_json)?r.parcelas_json:[];
 if(ps.length===1){const d=ps[0].vencimento||ps[0].data_vencimento||'';if(/^\d{4}-\d{2}-\d{2}$/.test(d))$('remVencimento').value=d}
 $('remObservacoes').value='Origem: relatório financeiro '+String(r.id||'')+(ps.length>1?' — conferir e preparar cada parcela separadamente':'');
 $('remBuscaStatus').textContent='Dados importados do relatório. Confira CPF/CNPJ, vencimento e parcelas antes de adicionar um rascunho.';
 $('remCliente').focus();
};
// V360: preparação em lote apenas de rascunhos locais, nunca boletos ou remessas bancárias.
window.remessaSelecionarTodosV360=function(marcar){document.querySelectorAll('#remRelatoriosLista .remSelecionarV360').forEach(c=>c.checked=!!marcar)};
window.remessaPrepararSelecionadosV360=async function(){
 const indices=[...document.querySelectorAll('#remRelatoriosLista .remSelecionarV360:checked')].map(c=>Number(c.dataset.i));
 if(!indices.length){alert('Selecione um ou mais relatórios.');return}
 const db=typeof banco!=='undefined'?banco:null;
 if(!db){alert('Supabase indisponível.');return}
 if(!confirm('Preparar '+indices.length+' relatório(s) como rascunhos locais? Nenhum boleto será emitido ou enviado ao banco.'))return;
 const lista=ler(), erros=[], preparados=[];
 for(const i of indices){
  const r=relatoriosEmAndamentoV359[i];if(!r)continue;
  const nome=String(r.nome||'').trim(), pedido=String(r.numero_nf||r.pedido||r.nf||'').trim();
  const bc=String(r.banco||'').toLowerCase(), bancoNome=bc.includes('bradesco')?'bradesco':bc.includes('brasil')||bc==='bb'?'bb':null;
  if(!nome||!pedido||!bancoNome){erros.push(nome||'Relatório '+i+': banco, cliente ou pedido ausente');continue}
  let doc='';
  if(r.cliente_id){try{const q=await db.from('email_clientes').select('cpf_cnpj').eq('id',r.cliente_id).maybeSingle();doc=String(q.data?.cpf_cnpj||'').replace(/\D/g,'')}catch(e){}}
  if(!/^\d{11}$|^\d{14}$/.test(doc)){
   const q=await db.from('email_clientes').select('cpf_cnpj').ilike('nome',nome).limit(2);
   if(!q.error&&q.data?.length===1)doc=String(q.data[0].cpf_cnpj||'').replace(/\D/g,'');
  }
  if(!/^\d{11}$|^\d{14}$/.test(doc)){erros.push(nome+': CPF/CNPJ não encontrado; selecione o cliente manualmente');continue}
  let parcelas=Array.isArray(r.parcelas_json)?r.parcelas_json:[];
  // Nunca inventar vencimento ou divisão: cada parcela precisa conter valor e data explícitos.
  if(!parcelas.length){erros.push(nome+': parcelas não disponíveis no relatório');continue}
  const itens=[];
  for(let n=0;n<parcelas.length;n++){
   const p=parcelas[n], data=String(p.vencimento||p.data_vencimento||p.data||'');
   const bruto=p.valor??p.valor_parcela??p.valorParcela;
   const valor=typeof bruto==='number'?bruto:Number(String(bruto||'').replace(/\./g,'').replace(',','.'));
   const centavos=Math.round(valor*100);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(data)||!Number.isSafeInteger(centavos)||centavos<=0){erros.push(nome+': parcela '+(n+1)+' sem valor ou vencimento confiável');itens.length=0;break}
   const chave=pedido+'-'+(n+1)+'de'+parcelas.length;
   if(lista.some(x=>x.banco===bancoNome&&x.documento===doc&&x.pedido===chave)){erros.push(nome+': parcela '+(n+1)+' já preparada');continue}
   itens.push({id:id(),banco:bancoNome,cliente:nome,documento:doc,pedido:chave,valor:centavos,vencimento:data,observacoes:'Origem: relatório '+String(r.id||'')+'; parcela '+(n+1)+'/'+parcelas.length,situacao:'rascunho',criadoEm:new Date().toISOString()});
  }
  if(itens.length){lista.push(...itens);preparados.push(...itens)}
 }
 if(preparados.length)gravar(lista);
 alert(preparados.length+' parcela(s) preparadas como rascunho local. Nenhuma emissão ou registro bancário foi realizado.'+(erros.length?'\n\nPendências ('+erros.length+'):\n'+erros.slice(0,12).join('\n'):''));
};
// V361: compartilhamento de rascunhos com Supabase, sem operações bancárias.
// O identificador local é preservado para permitir importação idempotente.
const TABELA_V361='remessas_preparacao';
function dbV361(){return typeof banco!=='undefined'&&banco&&typeof banco.from==='function'?banco:null}
function statusV361(msg){const e=$('remSyncStatusV361');if(e)e.textContent=msg}
window.remessaSincronizarV361=async function(){
 const db=dbV361();if(!db){statusV361('Sessão do Supabase indisponível.');return}
 if(!confirm('Enviar os rascunhos locais para o Supabase? Os registros serão compartilhados com os usuários autenticados autorizados pela política do banco de dados. Nenhuma operação bancária será realizada.'))return;
 const locais=ler();if(!locais.length){statusV361('Não há rascunhos locais para enviar.');return}
 const dados=locais.map(x=>({id_local:x.id,banco:x.banco,cliente:x.cliente,documento:x.documento,pedido:x.pedido,valor_centavos:x.valor,vencimento:x.vencimento,observacoes:x.observacoes||'',situacao:x.situacao==='aprovado'?'aprovado':'rascunho'}));
 statusV361('Enviando rascunhos ao Supabase...');
 const {error}=await db.from(TABELA_V361).upsert(dados,{onConflict:'id_local'});
 if(error){statusV361('Não foi possível salvar: '+error.message+'. Confira se executou SQL_V361_REMESSAS_PREPARACAO.sql.');return}
 statusV361(dados.length+' título(s) enviados ao Supabase. Nenhum boleto foi registrado.');
};
window.remessaImportarV361=async function(){
 const db=dbV361();if(!db){statusV361('Sessão do Supabase indisponível.');return}
 statusV361('Consultando títulos compartilhados...');
 const {data,error}=await db.from(TABELA_V361).select('id_local,banco,cliente,documento,pedido,valor_centavos,vencimento,observacoes,situacao,criado_em').order('criado_em',{ascending:false}).limit(1000);
 if(error){statusV361('Erro na consulta: '+error.message);return}
 const locais=ler(),existentes=new Set(locais.map(x=>x.id));let novos=0,divergentes=0;
 for(const x of data||[]){if(existentes.has(x.id_local)){divergentes++;continue}locais.push({id:x.id_local,banco:x.banco,cliente:x.cliente,documento:x.documento,pedido:x.pedido,valor:x.valor_centavos,vencimento:x.vencimento,observacoes:x.observacoes,situacao:x.situacao,criadoEm:x.criado_em});existentes.add(x.id_local);novos++}
 if(novos)gravar(locais);
 statusV361(novos+' título(s) importados, '+divergentes+' já existentes preservados. Importação não altera registros locais existentes.');
};
window.remessaAprovarLoteV361=function(){
 const a=ler(),rascunhos=a.filter(x=>x.situacao==='rascunho');if(!rascunhos.length){alert('Não há rascunhos para aprovar.');return}
 if(!confirm('Aprovar '+rascunhos.length+' rascunho(s) para conferência interna? Isso NÃO gera boletos ou remessa bancária.'))return;
 for(const d of rascunhos){d.situacao='aprovado';d.aprovadoEm=new Date().toISOString()}
 gravar(a);statusV361(rascunhos.length+' título(s) aprovados localmente. Use Enviar ao Supabase para compartilhar.');
};
const renderOriginalV359=render;
window.remessaRenderV357=function(){renderOriginalV359();if(!relatoriosEmAndamentoV359.length)window.remessaCarregarRelatoriosV359()};

})();
