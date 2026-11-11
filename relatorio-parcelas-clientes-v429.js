/* Sofisticatto V429: Relatórios, parcelas e cadastro de clientes. */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const money=v=>typeof v==='number'?v:valorParaNumero(String(v??''));
const cents=v=>{const n=money(v);return Number.isFinite(n)&&n>0?Math.round(n*100):null;};
const fmt=c=>(c/100).toFixed(2).replace('.',',');
const split=(total,n)=>total>=n?Array.from({length:n},(_,i)=>(Math.floor(total/n)+(i<total%n?1:0))/100):[];
const validDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
let current=null,saving=false,clientSaving=false;
function initModals(){
 if(el('rp429_modal'))return;
 const css=document.createElement('style');
 css.textContent='.rp429-bg{position:fixed;inset:0;background:#26173caa;z-index:99999;display:none;justify-content:center;align-items:center;padding:12px}.rp429-bg.open{display:flex}.rp429-box{background:white;border-radius:17px;padding:22px;width:min(760px,98vw);max-height:92vh;overflow:auto;box-shadow:0 15px 45px #25183c55}.rp429-box h2{margin:0 0 8px;color:#5947a0;font-size:21px}.rp429-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.rp429-box label{display:block;font-weight:700;font-size:12px;margin:7px 0;color:#493a8e}.rp429-box input,.rp429-box select{width:100%;box-sizing:border-box;border:1px solid #d9d3e8;border-radius:9px;padding:10px;background:#faf9ff}.rp429-box table{width:100%;border-collapse:collapse;margin:14px 0}.rp429-box td,.rp429-box th{padding:6px;border-bottom:1px solid #eee}.rp429-alert{padding:11px;border-radius:9px;background:#eaf7ee;color:#215b38;font-weight:700;margin:12px 0}.rp429-alert.error{background:#fff0f0;color:#b42121;border:1px solid #eeb3b3}.rp429-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap}.rp429-actions button,.rp429-small,.rp429-new{border:0;border-radius:9px;background:#5b49a5;color:white;padding:10px 13px;font-weight:700;cursor:pointer}.rp429-actions button:disabled{opacity:.5}.rp429-small,.rp429-new{background:#efeafb;color:#5844a4}.rp429-new{display:block;width:100%;text-align:left}@media(max-width:600px){.rp429-grid{grid-template-columns:1fr}.rp429-box{padding:12px}.rp429-box td{padding:3px}}';
 document.head.appendChild(css);
 const box=document.createElement('div');
 box.innerHTML=[
 '<div id="rp429_modal" class="rp429-bg" role="dialog" aria-modal="true"><div class="rp429-box">',
 '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2>💰 Editar parcelas</h2><p>Valores e vencimentos de cada parcela</p></div><button id="rp429_close" class="rp429-small">✕</button></div>',
 '<div class="rp429-grid"><div><label>Valor total do relatório</label><input id="rp429_total" inputmode="decimal"></div><div><label>Cliente</label><input id="rp429_nome"></div></div>',
 '<p><button class="rp429-small" id="rp429_distribuir">↻ Recalcular valores automaticamente</button></p>',
 '<div style="overflow-x:auto"><table><thead><tr><th>Parcela</th><th>Valor R$</th><th>Vencimento</th></tr></thead><tbody id="rp429_rows"></tbody></table></div>',
 '<div id="rp429_alert" class="rp429-alert" aria-live="polite"></div>',
 '<small>Parcelas preparadas serão sincronizadas. Boletos já emitidos não podem ser alterados no relatório.</small>',
 '<div class="rp429-actions"><button id="rp429_cancel" class="rp429-small">Cancelar</button><button id="rp429_save">💾 Salvar parcelas e datas</button></div>',
 '</div></div>',
 '<div id="rp429_client" class="rp429-bg" role="dialog" aria-modal="true"><div class="rp429-box">',
 '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2>➕ Cadastrar cliente</h2><p>Novo cliente na lista do Relatório</p></div><button id="rp429_client_close" class="rp429-small">✕</button></div>',
 '<div class="rp429-grid">',
 '<div><label>Nome / Razão social *</label><input id="rp429_c_nome"></div>',
 '<div><label>CPF/CNPJ *</label><input id="rp429_c_doc" inputmode="numeric"></div>',
 '<div><label>CEP *</label><input id="rp429_c_cep" inputmode="numeric"></div>',
 '<div><label>Número *</label><input id="rp429_c_num"></div>',
 '<div><label>Endereço *</label><input id="rp429_c_end"></div>',
 '<div><label>Complemento</label><input id="rp429_c_comp"></div>',
 '<div><label>Bairro *</label><input id="rp429_c_bairro"></div>',
 '<div><label>Cidade *</label><input id="rp429_c_cidade"></div>',
 '<div><label>UF *</label><input id="rp429_c_uf" maxlength="2"></div>',
 '<div><label>Vendedora</label><select id="rp429_c_vend"><option value="">Sem vínculo</option></select></div>',
 '<div><label>E-mail</label><input id="rp429_c_email" type="email"></div>',
 '</div><div id="rp429_c_alert" class="rp429-alert"></div>',
 '<div class="rp429-actions"><button id="rp429_client_cancel" class="rp429-small">Cancelar</button><button id="rp429_client_save">💾 Cadastrar e selecionar</button></div>',
 '</div></div>'].join('');
 document.body.append(...box.children);
 el('rp429_close').onclick=el('rp429_cancel').onclick=close;
 el('rp429_save').onclick=save;
 el('rp429_total').oninput=validate;
 el('rp429_distribuir').onclick=redistribute;
 el('rp429_client_close').onclick=el('rp429_client_cancel').onclick=()=>el('rp429_client').classList.remove('open');
 el('rp429_client_save').onclick=saveClient;
 el('rp429_c_cep').onblur=lookupCEP;
 el('rp429_c_doc').oninput=function(){this.value=this.value.replace(/[^0-9./-]/g,'').slice(0,18);};
 el('rp429_c_uf').oninput=function(){this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);};
}
function setMessage(id,txt,error=false){const e=el(id);e.classList.toggle('error',error);e.textContent=txt;}
function sum(){return [...document.querySelectorAll('.rp429-partval')].reduce((a,e)=>a+(cents(e.value)||0),0);}
function validate(){
 const total=cents(el('rp429_total').value),s=sum();
 const dates=[...document.querySelectorAll('.rp429-partdate')].every(e=>validDate(e.value));
 const amounts=[...document.querySelectorAll('.rp429-partval')].every(e=>!!cents(e.value));
 const ok=!!total&&s===total&&dates&&amounts;
 setMessage('rp429_alert','Valor total: '+(total?fmt(total):'inválido')+' | Soma das parcelas: '+fmt(s)+' | Diferença: '+(total===null?'—':fmt(Math.abs(total-s)))+(ok?' ✓ Conferido':' ⚠ Ajuste os valores e vencimentos até a soma coincidir.'),!ok);
 el('rp429_save').disabled=!ok||saving;return ok;
}
function redistribute(){
 const total=cents(el('rp429_total').value),list=[...document.querySelectorAll('.rp429-partval')],vals=split(total,list.length);
 if(!vals.length)return setMessage('rp429_alert','Valor insuficiente para as parcelas.',true);
 list.forEach((e,i)=>e.value=fmt(Math.round(vals[i]*100)));validate();
}
function close(){if(!saving){el('rp429_modal')?.classList.remove('open');current=null;}}
async function open(id,options={}){
 initModals();
 const q=await banco.from('boletos').select('*').eq('id',id).single();
 if(q.error||!q.data)return alert('Não foi possível carregar o relatório.');
 const r=q.data,p=Array.isArray(r.parcelas_json)?r.parcelas_json:[];
 if(!p.length)return alert('Defina as parcelas neste relatório antes de editar.');
 current={id,rel:r};
 const total=options.total??cents(r.valor);
 el('rp429_total').value=fmt(total||0);el('rp429_nome').value=options.nome||r.nome||'';
 const vals=options.auto?split(total,p.length):null;
 el('rp429_rows').innerHTML='';
 p.forEach((part,i)=>{
  const tr=document.createElement('tr'),td=document.createElement('td'),tv=document.createElement('td'),dt=document.createElement('td');
  td.textContent=(i+1)+'/'+p.length;
  const value=document.createElement('input');value.className='rp429-partval';value.inputMode='decimal';value.value=fmt(vals?.length?Math.round(vals[i]*100):(cents(part.valor)||0));value.oninput=validate;
  const date=document.createElement('input');date.type='date';date.className='rp429-partdate';date.value=String(part.vencimento||'').slice(0,10);date.onchange=validate;
  tv.append(value);dt.append(date);tr.append(td,tv,dt);el('rp429_rows').append(tr);
 });
 el('rp429_modal').classList.add('open');validate();
}
async function save(){
 if(!current||saving||!validate())return;
 const total=cents(el('rp429_total').value),name=el('rp429_nome').value.trim();
 if(!name)return setMessage('rp429_alert','Informe o nome do cliente.',true);
 const values=[...document.querySelectorAll('.rp429-partval')];
 const dates=[...document.querySelectorAll('.rp429-partdate')];
 const list=current.rel.parcelas_json.map((p,i)=>Object.assign({},p,{
  numero:i+1,total:values.length,valor:cents(values[i].value)/100,vencimento:dates[i].value
 }));
 saving=true;el('rp429_save').disabled=true;
 try{
  const r=await banco.rpc('relatorio_atualizar_parcelas_v429',{
   p_relatorio_id:current.id,p_total:total/100,p_parcelas:list,p_nome:name
  });
  if(r.error)throw r.error;
  el('rp429_modal').classList.remove('open');current=null;
  alert('Relatório salvo. Parcelas e datas atualizadas'+(r.data?.preparadas_sincronizadas?' também na fila de emissão.':'.')+' Nenhum boleto registrado foi alterado.');
  await carregarRelatorios();
 }catch(e){setMessage('rp429_alert','Não foi possível salvar: '+(e.message||e),true)}
 finally{saving=false;if(current)validate();}
}
function openClient(){
 initModals();
 const text=el('nome')?.value.trim()||'',digits=text.replace(/\D/g,'');
 el('rp429_c_nome').value=digits.length>=11&&digits.length<=14?'':text;
 el('rp429_c_doc').value=digits.length>=11&&digits.length<=14?text:'';
 for(const k of ['cep','num','end','comp','bairro','cidade','uf','email'])el('rp429_c_'+k).value='';
 const sel=el('rp429_c_vend');sel.innerHTML='<option value="">Sem vínculo</option>';
 for(const v of (typeof emailVendedoras!=='undefined'?emailVendedoras:[])){
  const o=document.createElement('option');o.value=v.id;o.textContent=v.nome||'Vendedora';sel.append(o);
 }
 setMessage('rp429_c_alert','Preencha os dados para cadastrar o cliente.');
 el('listaSugestoesClienteRelatorio')?.classList.remove('ativa');
 el('rp429_client').classList.add('open');
}
async function lookupCEP(){
 const cep=el('rp429_c_cep').value.replace(/\D/g,'');
 if(cep.length!==8||typeof consultarCepRelatorio!=='function')return;
 try{
  const r=await consultarCepRelatorio(cep);
  if(!r?.ok)return;
  for(const [key,v] of Object.entries({cidade:r.cidade,uf:r.uf,bairro:r.bairro,end:r.logradouro})){
   if(v&&!el('rp429_c_'+key).value.trim())el('rp429_c_'+key).value=v;
  }
 }catch(_){}
}
async function saveClient(){
 if(clientSaving)return;
 const get=k=>el('rp429_c_'+k)?.value.trim()||'',doc=get('doc').replace(/\D/g,''),nome=get('nome');
 const data={nome,cpf_cnpj:doc,cep:get('cep').replace(/\D/g,''),numero:get('num'),endereco:get('end'),
  complemento:get('comp'),bairro:get('bairro'),cidade:get('cidade'),uf:get('uf').toUpperCase(),
  emails:get('email')?[get('email')]:[],vendedora_id:get('vend')||null,ativo:true,criado_por:usuarioLogado?.login||'financeiro'};
 if(!nome||![11,14].includes(doc.length)||data.cep.length!==8||!data.numero||!data.endereco||!data.bairro||!data.cidade||!/^[A-Z]{2}$/.test(data.uf))
  return setMessage('rp429_c_alert','Preencha nome, CPF/CNPJ, CEP, endereço, número, bairro, cidade e UF.',true);
 const exists=(emailClientes||[]).find(x=>String(x.cpf_cnpj||'').replace(/\D/g,'')===doc||
 String(x.nome||'').trim().toUpperCase()===nome.toUpperCase());
 if(exists){el('rp429_client').classList.remove('open');return selecionarSugestaoClienteRelatorio(exists.id,true)}
 clientSaving=true;el('rp429_client_save').disabled=true;
 try{
  if(typeof validarCadastroClienteParaBancosComCep==='function'){
   const v=await validarCadastroClienteParaBancosComCep(data);
   if(!v.ok)throw Error((v.problemas||[]).join('; ')||'Cadastro bancário incompleto.');
  }
  const check=await banco.from('email_clientes').select('id').eq('cpf_cnpj',doc).limit(1);
  if(check.error)throw check.error;
  if(check.data?.length)throw Error('CPF/CNPJ já cadastrado. Pesquise novamente.');
  const result=await banco.from('email_clientes').insert([data]).select('id').single();
  if(result.error)throw result.error;
  await carregarClientesEmail();
  el('rp429_client').classList.remove('open');
  await selecionarSugestaoClienteRelatorio(result.data.id,true);
  if(typeof mostrarBalaoSistema==='function')mostrarBalaoSistema('Cliente cadastrado','Cliente selecionado no Relatório.');
 }catch(e){setMessage('rp429_c_alert','Cadastro não salvo: '+(e.message||e),true)}
 finally{clientSaving=false;el('rp429_client_save').disabled=false;}
}
function install(){
 initModals();
 const oldTable=window.montarTabela;
 if(typeof oldTable==='function'){
  window.montarTabela=function(){
   const r=oldTable.apply(this,arguments);
   document.querySelectorAll('button[onclick^="editarVencimentosRelatorioV375("]').forEach(bt=>{
    const m=bt.getAttribute('onclick')?.match(/['"]([^'"]+)['"]/);
    if(!m||bt.parentNode?.querySelector('.rp429-parcels'))return;
    const b=document.createElement('button');b.type='button';b.className='btn azul rp429-parcels';b.textContent='💰 Parcelas';
    b.onclick=()=>open(m[1]);bt.insertAdjacentElement('afterend',b);
   });
   return r;
  };
  window.montarTabela();
 }
 const oldEdit=window.editarRelatorio;
 if(typeof oldEdit==='function'){
  window.editarRelatorio=async function(id){
   const r=(todosBoletos||[]).find(x=>String(x.id)===String(id));
   const val=el('edit_valor_'+id),name=el('edit_nome_'+id);
   if(!r||!val||!name)return oldEdit(id);
   const next=cents(val.value),prev=cents(r.valor);
   if(!next)return alert('Informe um valor total válido.');
   const p=Array.isArray(r.parcelas_json)?r.parcelas_json:[];
   const sum=p.reduce((s,x)=>s+(cents(x.valor)||0),0);
   if(p.length&&(next!==prev||sum!==next))return open(id,{total:next,nome:name.value,auto:next!==prev});
   return oldEdit(id);
  };
 }
 window.editarVencimentosRelatorioV375=id=>open(id);
 const oldSearch=window.mostrarSugestoesClienteRelatorio;
 if(typeof oldSearch==='function'){
  window.mostrarSugestoesClienteRelatorio=function(){
   oldSearch.apply(this,arguments);
   const input=el('nome'),list=el('listaSugestoesClienteRelatorio');
   if(!input||!list||input.value.trim().length<3||list.querySelector('.sugestao-item'))return;
   list.innerHTML='';list.classList.add('ativa');
   const b=document.createElement('button');b.type='button';b.className='rp429-new';
   b.textContent='➕ Cliente não encontrado? Cadastrar agora';
   b.onmousedown=e=>e.preventDefault();b.onclick=openClient;list.appendChild(b);
  };
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();