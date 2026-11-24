/* Pesquisa assistida das ENTRADAS. Não grava nem confirma entrega automaticamente. */
(function(){
'use strict';
const panelId='entradaPesquisaTransportadora';
const get=id=>document.getElementById(id);
const dig=v=>String(v||'').replace(/\D/g,'');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const sample={
 nf:'158284',key:'35261100223284000185550030001582841877332371',
 supplier:'AGRO-INDUSTRIAL TARUMA LTDA',
 carrier:'MAROCO TRANSPORTES RODOVIARIOS LTDA',
 transfer:'TRANS-ARAGUAIA LOGISTICA EIRELI'
};
const val=id=>get(id)?.value?.trim()||'';
const msg=s=>{if(get('epStatus'))get('epStatus').textContent=s};
const text=(tag,s)=>{let el=document.createElement(tag);el.textContent=String(s??'');return el};
function montar(){
 const el=get(panelId);
 if(!el||el.dataset.montado)return;
 el.dataset.montado='1';
 el.className='ep-painel';
 const style=document.createElement('style');
 style.textContent='.ep-painel{background:#fbfaff;border:1px solid #d8cdea;border-radius:12px;padding:14px;margin:12px 0;width:100%;box-sizing:border-box}'+
  '.ep-grid{display:grid;grid-template-columns:repeat(2,minmax(170px,1fr));gap:10px}'+
  '.ep-grid label{display:block;font-size:12px;font-weight:600;color:#574982}.ep-grid input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #c9bfe0;border-radius:7px;margin-top:3px}'+
  '.ep-actions{display:flex;flex-wrap:wrap;gap:8px;margin:13px 0}.ep-result{background:white;border:1px solid #d5c9e5;border-radius:9px;padding:12px;margin:8px 0}.ep-result p{margin:5px 0;font-size:12px}'+
  '@media(max-width:600px){.ep-grid{grid-template-columns:1fr}}';
 document.head.appendChild(style);
 el.innerHTML='<h3>Pesquisar transportadora das notas que estão chegando</h3>'+
  '<p>SSW: consulta por chave DANFE. Gmail: CT-es XML disponíveis na conta autorizada. Rodonaves: consulta própria. Os resultados são apenas indícios até conferir o CT-e e as ocorrências.</p>'+
  '<div class="ep-grid"><label>NF-e<input id="epNf" inputmode="numeric" placeholder="Ex.: 158284"></label>'+
  '<label>Chave NF-e (44 dígitos)<input id="epChave" maxlength="55"></label>'+
  '<label>Número/chave CT-e<input id="epCte"></label>'+
  '<label>Fornecedor<input id="epFornecedor"></label>'+
  '<label>Transportadora principal<input id="epTransportadora"></label>'+
  '<label>Redespacho (se existir)<input id="epRedespacho"></label></div>'+
  '<div class="ep-actions"><button class="btn azul" type="button" id="epPesquisar">Pesquisar SSW + Gmail</button>'+
  '<button class="btn azul" type="button" id="epRod">Consultar Rodonaves</button>'+
  '<button class="btn azul" type="button" id="epGmailTeste">Testar leitura do Gmail</button>'+
  '<button class="btn" type="button" id="epXml">Importar XML da NF-e</button>'+
  '<input type="file" id="epArquivo" accept=".xml,text/xml,application/xml" hidden>'+
  '<button class="btn" type="button" id="epExemplo">Carregar NF 158284 (DANFE enviado)</button>'+
  '<button class="btn verde" type="button" id="epConferir">Conferir e cadastrar entrada</button></div>'+
  '<p id="epStatus" role="status" aria-live="polite"></p><div id="epResultados"></div>';
 get('epPesquisar').addEventListener('click',pesquisar);
 get('epGmailTeste').addEventListener('click',async()=>{
  const btn=get('epGmailTeste');btn.disabled=true;msg('Testando autorização de leitura do Gmail...');
  try{const d=await consultar('descobrir-entradas-gmail',{testeConexao:true});
   msg('Leitura autorizada: '+d.conta+'. Nenhuma mensagem ou anexo foi consultado.');
  }catch(e){msg(e.message)}finally{btn.disabled=false}
 });
 get('epRod').addEventListener('click',()=>{if(typeof descobrirEntradasRodonavesV441==='function')descobrirEntradasRodonavesV441()});
 get('epXml').addEventListener('click',()=>get('epArquivo').click());
 get('epArquivo').addEventListener('change',importar);
 get('epConferir').addEventListener('click',()=>cadastrar());
 get('epExemplo').addEventListener('click',()=>{
  for(const [field,v] of [['epNf',sample.nf],['epChave',sample.key],['epFornecedor',sample.supplier],['epTransportadora',sample.carrier],['epRedespacho',sample.transfer]])get(field).value=v;
  msg('DANFE: Maroco consta como transportadora principal, Trans-Araguaia como redespacho. Rastreamento ainda não confirmado.');
 });
}
function abrir(){
 montar();const el=get(panelId);if(!el)return;
 el.hidden=!el.hidden;if(!el.hidden)get('epNf')?.focus();
}
async function consultar(action,body){
 if(typeof chaveAdminColeta!=='function')throw Error('Autorização administrativa indisponível');
 const chave=await chaveAdminColeta();
 if(!chave)throw Error('Chave administrativa não informada');
 const r=await fetch('/api/integracoes?action='+encodeURIComponent(action),{
  method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':chave},
  body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw Error(d.erro||'Consulta indisponível');
 return d;
}
function render(item){
 const box=get('epResultados'),card=document.createElement('div');card.className='ep-result';
 card.append(text('strong',item.source+' — '+(item.confirmed?'Ocorrências encontradas':'Conferir antes de salvar')));
 for(const [label,value] of [['NF-e',item.nf],['Chave',item.key],['CT-e',item.cte],
  ['Fornecedor',item.supplier],['Transportadora',item.carrier],['Redespacho',item.transfer],
  ['Resultado',item.message]]){
  if(value)card.append(text('p',label+': '+value));
 }
 if(item.events?.length){
  const details=document.createElement('details');details.append(text('summary','Linha do tempo ('+item.events.length+')'));
  const list=document.createElement('ol');
  for(const e of item.events.slice(0,50))list.append(text('li',[e.data,e.titulo,e.local,e.descricao].filter(Boolean).join(' — ')));
  details.append(list);card.append(details);
 }
 const button=text('button','Conferir e cadastrar esta entrada');button.className='btn azul';button.type='button';
 button.addEventListener('click',()=>cadastrar(item));card.append(button);box.append(card);
}
async function pesquisar(){
 const button=get('epPesquisar'),box=get('epResultados');
 box.replaceChildren();const nf=val('epNf'),key=dig(val('epChave')),cte=dig(val('epCte'));
 if(!nf&&!key&&!cte&&!val('epFornecedor'))return msg('Informe NF, chave, CT-e ou fornecedor.');
 if(key&&key.length!==44)return msg('A chave NF-e precisa ter 44 dígitos.');
 button.disabled=true;msg('Pesquisando fontes disponíveis…');
 const base={nf,key,cte,supplier:val('epFornecedor'),carrier:val('epTransportadora'),transfer:val('epRedespacho')};
 const found=[],warnings=[];
 try{
  if(key){
   try{
    const d=await consultar('descobrir-xml-ssw',{notas:[{chave:key}]});
    for(const v of d.resultados||[])found.push({...base,source:'SSW por DANFE',confirmed:!!v.localizado,
     carrier:v.transportadora||base.carrier,events:v.ocorrencias||[],
     message:v.localizado?'Ocorrências obtidas; verificar transportadora e entrega':v.motivo||'Não localizada'});
   }catch(e){warnings.push('SSW: '+e.message)}
  }else warnings.push('SSW exige chave NF-e de 44 dígitos.');
  try{
   const d=await consultar('descobrir-entradas-gmail',{dias:15});let matches=0;
   for(const v of d.resultados||[]){
    const corresponde=(nf&&String(v.numeroNfe||'').replace(/^0+/,'')===nf.replace(/^0+/,''))||
     (key&&(v.chavesNfe||[]).some(c=>dig(c)===key))||
     (cte&&(dig(v.numeroCte)===cte||dig(v.chaveCte)===cte));
    if(!corresponde||v.destinatarioInformado&&!v.destinatarioConfirmado)continue;
    matches++;
    found.push({...base,source:'Gmail — XML CT-e',confirmed:false,
     nf:v.numeroNfe||nf,key:(v.chavesNfe||[])[0]||key,cte:v.numeroCte||cte,
     supplier:v.remetente||base.supplier,carrier:v.transportadora||base.carrier,
     message:v.destinatarioConfirmado?'Destinatário confirmado no CT-e; sem ocorrência de entrega':'Destino não confirmado, conferir'});
   }
   if(!matches)warnings.push('Gmail: nenhum CT-e correspondente entre os anexos examinados.');
  }catch(e){warnings.push('Gmail: '+e.message)}
  const existentes=(typeof rastreamentosLogistica!=='undefined'&&Array.isArray(rastreamentosLogistica))?rastreamentosLogistica:[];
  for(const x of existentes.filter(v=>v.sentido==='entrada'&&(
    (key&&dig(v.chave_nfe)===key)||(nf&&String(v.numero_nfe||'').replace(/^0+/,'')===nf.replace(/^0+/,''))||
    (cte&&dig(v.numero_cte)===cte))).slice(0,6)){
    found.push({...base,source:'Entrada já cadastrada',confirmed:false,nf:x.numero_nfe||nf,key:x.chave_nfe||key,
     cte:x.numero_cte||cte,supplier:x.parceiro_nome||base.supplier,
     message:'Registro existente (ID '+x.id+'); evite duplicar.'});
  }
  if(!found.length)found.push({...base,source:'Dados informados / DANFE',confirmed:false,
    message:'Sem ocorrência confirmada. Cadastre como pendente somente após conferir.'});
  found.forEach(render);msg(found.length+' resultado(s) ou possibilidade(s). '+warnings.join(' | '));
 }finally{button.disabled=false}
}
async function cadastrar(item={}){
 if(typeof abrirFormularioRastreamento!=='function')return msg('Cadastro de entradas indisponível.');
 if(typeof carregarTransportadorasLogistica==='function')await carregarTransportadorasLogistica();
 abrirFormularioRastreamento('entrada');
 const put=(id,v)=>{if(get(id)&&v)get(id).value=v};
 put('rastParceiro_entrada',item.supplier||val('epFornecedor'));
 put('rastNfe_entrada',item.nf||val('epNf'));
 put('rastChave_entrada',item.key||dig(val('epChave')));
 put('rastCte_entrada',item.cte||dig(val('epCte')));
 const carrier=item.carrier||val('epTransportadora');
 const select=get('rastTransportadora_entrada');
 if(select&&carrier){
  const option=Array.from(select.options).find(o=>norm(o.textContent)===norm(carrier));
  if(option)select.value=option.value;
 }
 put('rastObs_entrada',[
  'Transportadora declarada: '+(carrier||'não identificada'),
  (item.transfer||val('epRedespacho'))?'Redespacho: '+(item.transfer||val('epRedespacho')):'',
  'Fonte: '+(item.source||'informação manual')+'. Rastreamento não confirmado.'
 ].filter(Boolean).join(' | '));
 if(get('rastStatus_entrada'))get('rastStatus_entrada').value='aguardando_coleta';
 msg('Cadastro aberto para conferência. Somente o botão Salvar grava a entrada.');
}
async function importar(e){
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>2_000_000)throw Error('XML maior que 2 MB');
  const data=await file.text();if(/<!DOCTYPE|<!ENTITY/i.test(data))throw Error('DTD/entidades não permitidos');
  const xml=new DOMParser().parseFromString(data,'application/xml');
  if(xml.querySelector('parsererror'))throw Error('XML inválido');
  const inf=xml.getElementsByTagName('infNFe')[0];if(!inf)throw Error('NF-e não localizada');
  const child=(el,k)=>el?.getElementsByTagName(k)?.[0]?.textContent?.trim()||'';
  const emit=inf.getElementsByTagName('emit')[0],dest=inf.getElementsByTagName('dest')[0],
   ide=inf.getElementsByTagName('ide')[0],trans=inf.getElementsByTagName('transporta')[0];
  if(dig(child(dest,'CNPJ'))!=='05451985000195')throw Error('XML não tem Sofisticatto como destinatário');
  const key=dig(inf.getAttribute('Id'));
  if(key.length!==44)throw Error('Chave inválida');
  get('epNf').value=child(ide,'nNF');get('epChave').value=key;
  get('epFornecedor').value=child(emit,'xNome');get('epTransportadora').value=child(trans,'xNome');
  const additional=child(inf.getElementsByTagName('infAdic')[0],'infCpl');
  const m=additional.match(/TRANSPORTADORA\s+REDESPACHO\s*:\s*[^-]{0,35}-\s*(.{4,95}?)\s+CNPJ\b/i);
  if(m)get('epRedespacho').value=m[1].trim();
  msg('XML importado: verifique transportadora, redespacho e destino. Nenhum rastreio foi salvo.');
 }catch(err){msg('Falha ao importar: '+err.message)}
 finally{e.target.value=''}
}
window.abrirPesquisaTransportadoraEntradas=abrir;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);
else montar();
})();
