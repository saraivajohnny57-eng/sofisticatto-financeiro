/* V418 — GNRE na emissão de etiquetas. Prévia/registro local; sem transmissão fiscal. */
(function(){
const $=id=>document.getElementById(id);
const digits=v=>String(v||'').replace(/\D/g,'');
const num=v=>{let s=String(v??'').trim().replace(/\s|R\$/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0};
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let xmlInfo={}, quote=null;
function chave(){return digits($('etqChave')?.value).slice(0,44)}
function key(){return 'sof_gnre_v418_'+(chave()||'nf_'+String($('etqNf')?.value||'').trim())}
function getSaved(){try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}}
function show(s){if($('gnreEtiquetaStatus'))$('gnreEtiquetaStatus').textContent=s}
function modal(open){$('gnreEtiquetaModal').style.display=open?'flex':'none'}
function calc(){const modo=$('gnreEtModo').value,nf=num($('gnreEtNf').value),frete=num($('gnreEtFrete').value);let v=0;
 if(modo==='planilha2')v=(nf+frete)*.02;
 if(modo==='automatico'){const p=num($('gnreEtPercentual').value);v=(nf+frete)*p/100}
 if(modo!=='manual')$('gnreEtValor').value=v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 $('gnreEtValor').readOnly=modo!=='manual';
 $('gnreEtAviso').textContent=modo==='automatico'?'Estimativa DIFAL: informe a alíquota validada para esta operação e UF. Não é cálculo fiscal oficial.':modo==='planilha2'?'Estimativa da planilha: (NF + frete) × 2%.':'Valor informado manualmente, sujeito à validação fiscal.';
}
async function loadQuote(){quote=null;const nf=String($('etqNf')?.value||'').trim();if(!nf||typeof banco==='undefined')return;
 try{const r=await banco.from('frete_cotacoes').select('id,numero_nf,cliente_nome,gnre_modo,gnre_estimado,valor_nf,uf_destino,criado_em').eq('numero_nf',nf).order('criado_em',{ascending:false}).limit(10);
 if(r.error)return;const name=String($('etqCliente')?.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const uf=String($('etqUf')?.value||'').toUpperCase();
 const list=(r.data||[]).filter(q=>String(q.uf_destino||'').toUpperCase()===uf&&String(q.cliente_nome||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===name);
 if(list.length===1)quote=list[0];
 else if(list.length>1)show('Há mais de uma cotação para esta NF e cliente. Confira manualmente o valor; nenhuma foi selecionada.');
 }catch(e){console.warn('Consulta GNRE indisponível:',e.message)}
}
async function refresh(){const saved=getSaved();show(saved?`GNRE preparada: ${money(saved.valor)} (${saved.modo}) — aguardando validação e emissão oficial.`:'Nenhuma GNRE preparada para esta NF. Você pode calcular mesmo sem cotação.');await loadQuote();if(quote&&!saved)show(`Cotação encontrada para NF ${quote.numero_nf}: GNRE ${money(quote.gnre_estimado)}. Confira antes de salvar.`)}
window.abrirGnreEtiqueta=async function(){await refresh();const saved=getSaved();$('gnreEtNfNumero').textContent=$('etqNf')?.value||'Não informada';$('gnreEtChave').textContent=chave()||'Importe o XML da NF-e';$('gnreEtCliente').textContent=$('etqCliente')?.value||'Não informado';$('gnreEtUf').textContent=$('etqUf')?.value||'—';
 $('gnreEtNf').value=saved?.valor_nf??quote?.valor_nf??xmlInfo.valorNf??'';$('gnreEtFrete').value=saved?.frete??'';$('gnreEtPercentual').value=saved?.percentual??'0';$('gnreEtModo').value=saved?.modo??(quote?.gnre_modo==='planilha2'?'planilha2':quote?.gnre_modo==='automatico'?'automatico':'planilha2');
 if(saved?.modo==='manual'||(quote?.gnre_modo==='manual'&&!saved))$('gnreEtModo').value='manual';calc();if(saved?.valor!=null)$('gnreEtValor').value=Number(saved.valor).toLocaleString('pt-BR',{minimumFractionDigits:2});else if(quote?.gnre_estimado>0)$('gnreEtValor').value=Number(quote.gnre_estimado).toLocaleString('pt-BR',{minimumFractionDigits:2});modal(true)};
window.fecharGnreEtiqueta=()=>modal(false);
window.calcularGnreEtiqueta=calc;
window.salvarGnreEtiqueta=function(){if(chave().length!==44){alert('Importe o XML da NF-e com uma chave de 44 dígitos antes de salvar a GNRE.');return}const valor=num($('gnreEtValor').value);if(!Number.isFinite(valor)||valor<=0){alert('Informe um valor GNRE válido e maior que zero.');return}if(!confirm(`Confirmar o valor de ${money(valor)} para a NF ${$('etqNf')?.value}?\n\nEste registro NÃO emite a guia oficial.`))return;
 const item={chave:chave(),nf:$('etqNf')?.value,cliente:$('etqCliente')?.value,uf:$('etqUf')?.value,modo:$('gnreEtModo').value,valor,valor_nf:num($('gnreEtNf').value),frete:num($('gnreEtFrete').value),percentual:num($('gnreEtPercentual').value),cotacao_id:quote?.id||null,estado:'aguardando_integracao',atualizado_em:new Date().toISOString()};
 try{localStorage.setItem(key(),JSON.stringify(item));show(`GNRE preparada: ${money(valor)} — pendente de emissão oficial. Registro salvo neste navegador.`);modal(false)}catch{alert('Não foi possível salvar a preparação neste navegador.')}};
function init(){const target=$('etqXml');if(!target)return;const wrap=document.createElement('div');wrap.className='campo-largo';wrap.innerHTML=`<div style="margin:8px 0;padding:14px;border:1px solid #c6e6d2;border-radius:12px;background:#f3fff6"><b>GNRE da nota fiscal</b><p style="margin:6px 0;color:#455a4d;font-size:13px">Com ou sem cotação: escolha estimativa DIFAL, 2% (NF + frete) ou valor manual. Confirme os dados antes da emissão.</p><button type="button" class="btn verde" onclick="abrirGnreEtiqueta()">🟢 Gerar GNRE</button><div id="gnreEtiquetaStatus" role="status" style="margin-top:8px;font-size:12px">Importe o XML e confira os dados fiscais.</div></div>`;target.closest('.campo-largo').insertAdjacentElement('afterend',wrap);
 const overlay=document.createElement('div');overlay.id='gnreEtiquetaModal';overlay.style.cssText='display:none;position:fixed;inset:0;background:#0009;z-index:110000;align-items:center;justify-content:center;padding:12px';overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Preparar GNRE" style="background:white;border-radius:15px;padding:22px;width:min(620px,96vw);max-height:90vh;overflow:auto;color:#24223a"><h2>GNRE — Conferência antes da emissão</h2><p style="font-size:13px">NF <b id="gnreEtNfNumero"></b> · UF <b id="gnreEtUf"></b><br>Cliente: <b id="gnreEtCliente"></b><br>Chave: <small id="gnreEtChave" style="overflow-wrap:anywhere"></small></p><label>Forma de cálculo<select id="gnreEtModo" onchange="calcularGnreEtiqueta()" style="width:100%;padding:10px"><option value="automatico">Estimativa DIFAL</option><option value="planilha2">GNRE 2% (NF + frete)</option><option value="manual">Valor manual</option></select></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><label>Valor da NF (R$)<input id="gnreEtNf" oninput="calcularGnreEtiqueta()" style="width:100%"></label><label>Valor do frete (R$)<input id="gnreEtFrete" oninput="calcularGnreEtiqueta()" style="width:100%"></label><label>Alíquota DIFAL (%)<input id="gnreEtPercentual" oninput="calcularGnreEtiqueta()" style="width:100%"></label><label>Valor GNRE (R$)<input id="gnreEtValor" style="width:100%"></label></div><p id="gnreEtAviso" style="font-size:12px;color:#665e8b"></p><p style="background:#fff3d5;padding:10px;border-radius:8px;font-size:12px">Esta versão prepara e registra o valor localmente; não transmite XML fiscal, não gera guia oficial e não confirma pagamento. A emissão depende da autenticação GNRE e validação dos dados obrigatórios.</p><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn azul" onclick="fecharGnreEtiqueta()">Cancelar</button><button type="button" class="btn verde" onclick="salvarGnreEtiqueta()">Confirmar e salvar preparação</button></div></div>`;document.body.appendChild(overlay);
 target.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f){try{const xml=new DOMParser().parseFromString(await f.text(),'application/xml');xmlInfo.valorNf=xml.querySelector('total ICMSTot vNF')?.textContent||''}catch{}}setTimeout(refresh,800)});
 $('etqNf')?.addEventListener('change',refresh);$('etqChave')?.addEventListener('change',refresh);refresh();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
