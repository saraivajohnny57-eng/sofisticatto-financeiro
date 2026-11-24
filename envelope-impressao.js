/* Envelope Sofisticatto: arte horizontal 229 x 114 mm no papel em paisagem, sem rotação. */
(function(){
 'use strict';
 const STORAGE='sofisticatto_envelope_paisagem_229x114_v8';
 const LEGACY='sofisticatto_envelope_retrato_114x229_v7';
 const LOGO='/assets/sofisticatto-logo.jpeg';
 const PAPEL={w:229,h:114};
 const IDS=['nome','doc','rua','numero','compl','bairro','cep','cidade','uf','nf'];
 const BLOCOS={
  logo:{w:48,h:20,m:8},rem:{w:91,m:8},
  dest:{w:96,m:10},linhas:{w:28,h:12,m:7}
 };
 const PADRAO={
  modo:'envelope',documento:false,nota:true,
  logoX:10,logoY:7,
  remX:10,remY:31,remAng:0,
  destX:123,destY:33,destAng:0,
  linhasX:15,linhasY:91,linhasAng:0
 };
 const PREFIXO={logo:'Logo',rem:'Rem',dest:'Dest',linhas:'Linhas'};
 const NOMES={logo:'logo',rem:'remetente',dest:'destinatário',linhas:'risquinhos'};
 const TIPOS=['logo','rem','dest','linhas'];
 let inicializado=false;
 const el=id=>document.getElementById('env'+id);
 const somenteNumero=s=>String(s||'').replace(/\D/g,'');
 const textoSeguro=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const valor=id=>el(id)?.value?.trim()||'';
 function textoNo(id,txt){const no=el(id);if(no)no.textContent=txt||'';}
 const limitar=(n,min,max)=>Math.max(min,Math.min(max,n));
 const arredondar=n=>Math.round(n*10)/10;
 function dadosRemetente(){
  const ler=(id,def)=>document.getElementById(id)?.value?.trim()||def;
  return {
   nome:ler('corRemNome','SOFISTICATTO COSMÉTICOS'),
   documento:ler('corRemDocumento','05.451.985/0001-95'),
   rua:ler('corRemEndereco','RUA 4, Nº 217'),
   bairro:ler('corRemBairro','VILA ABAJÁ'),
   cep:ler('corRemCep','74550-470'),
   cidade:ler('corRemCidade','GOIÂNIA'),
   uf:ler('corRemUf','GO')
  };
 }
 function guardarConfig(p){
  try{localStorage.setItem(STORAGE,JSON.stringify(p))}catch(_){}
 }
 function configuracao(){
  let salvo=null;
  try{salvo=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){}
  if(!salvo||typeof salvo!=='object'||Array.isArray(salvo)){
   // A orientação mudou: não é seguro reutilizar coordenadas do envelope em pé.
   // Preservamos opções e iniciamos posições próprias para a arte deitada.
   let legado=null;
   for(const chave of [LEGACY,'sofisticatto_envelope_correios_115x230_v1']){
    try{legado=JSON.parse(localStorage.getItem(chave)||'null')}catch(_){}
    if(legado&&typeof legado==='object'&&!Array.isArray(legado))break;
   }
   salvo={...PADRAO};
   if(legado&&typeof legado==='object'){
    if(['envelope','envelope115','a4'].includes(legado.modo))salvo.modo=legado.modo;
    if(typeof legado.nota==='boolean')salvo.nota=legado.nota;
    if(typeof legado.documento==='boolean')salvo.documento=legado.documento;
   }
   guardarConfig(salvo);
  }
  const p={...PADRAO,...salvo};
  for(const tipo of TIPOS){
   for(const eixo of ['X','Y']){
    const chave=tipo+eixo,num=Number(p[chave]);
    p[chave]=Number.isFinite(num)?num:PADRAO[chave];
   }
   if(tipo!=='logo'){
    const chave=tipo+'Ang',num=Number(p[chave]);
    p[chave]=limitar(Number.isFinite(num)?num:0,-5,5);
   }
  }
  if(!['envelope','envelope115','a4'].includes(p.modo))p.modo='envelope';
  return p;
 }
 function dados(){
  const dest={};
  for(const id of IDS)dest[id]=valor(id.charAt(0).toUpperCase()+id.slice(1));
  return {dest,rem:dadosRemetente(),config:configuracao()};
 }
 function enderecoSemNumeroRepetido(rua,numero){
  const logradouro=String(rua||'').trim().replace(/\s+/g,' ');
  const nro=String(numero||'').trim().replace(/^(?:N[º°.]?|NRO\.?|NR\.?|NUMERO|NÚMERO)\s*[:.°º-]*\s*/i,'');
  if(!nro)return logradouro;
  const escaped=nro.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  const padrao=new RegExp('(?:\\s*[,;–-]\\s*|\\s+)(?:(?:N[º°.]?|NRO\\.?|NR\\.?|NUMERO|NÚMERO)\\s*[:.°º-]*\\s*)?'+escaped+'\\s*$','i');
  return logradouro.replace(padrao,'').replace(/[\s,;–-]+$/,'').trim()||logradouro;
 }
 function endDest(d){
  const numero=String(d.numero||'').trim().replace(/^(?:N[º°.]?|NRO\.?|NR\.?|NUMERO|NÚMERO)\s*[:.°º-]*\s*/i,'');
  const rua=[enderecoSemNumeroRepetido(d.rua,numero),numero?'nº '+numero:''].filter(Boolean).join(', ');
  return [rua,d.compl,d.bairro,[d.cidade,d.uf].filter(Boolean).join(' / '),
   d.cep?('CEP '+d.cep):''].filter(Boolean);
 }
 function endRem(r){
  return [r.rua,r.bairro,[r.cidade,r.uf].filter(Boolean).join(' / '),
   r.cep?'CEP '+r.cep:''].filter(Boolean);
 }
 function validar(){
  const d=dados().dest;
  const faltam=['nome','rua','bairro','cidade','uf','cep'].filter(k=>!d[k]);
  if(d.cep&&somenteNumero(d.cep).length!==8)faltam.push('CEP com 8 dígitos');
  if(d.uf&&!/^[A-Za-z]{2}$/.test(d.uf))faltam.push('UF com 2 letras');
  return [...new Set(faltam)];
 }
 function tamanhoBloco(tipo){
  const b=BLOCOS[tipo],no=el('Arrastar'+PREFIXO[tipo]),papel=el('Papel');
  let h=b.h;
  if(!h){
   if(no&&papel?.clientWidth&&no.offsetHeight>0)
    h=no.offsetHeight*PAPEL.w/papel.clientWidth;
   else h=tipo==='rem'?43:58;
  }
  return {w:b.w,h:h+(!b.h?2:0)};
 }
 function cantosRotacionados(tipo,p){
  const {w,h}=tamanhoBloco(tipo),a=(p[tipo+'Ang']||0)*Math.PI/180;
  const c=Math.cos(a),s=Math.sin(a);
  const xs=[0,w*c,-h*s,w*c-h*s],ys=[0,w*s,h*c,w*s+h*c];
  return {minX:Math.min(...xs),maxX:Math.max(...xs),
    minY:Math.min(...ys),maxY:Math.max(...ys)};
 }
 function posicaoPermitida(tipo,p){
  const c=cantosRotacionados(tipo,p),m=BLOCOS[tipo].m;
  const minX=m-c.minX,maxX=PAPEL.w-m-c.maxX;
  const minY=m-c.minY,maxY=PAPEL.h-m-c.maxY;
  const cabe=minX<=maxX&&minY<=maxY;
  return {
   x:arredondar(limitar(p[tipo+'X'],minX,Math.max(minX,maxX))),
   y:arredondar(limitar(p[tipo+'Y'],minY,Math.max(minY,maxY))),
   cabe
  };
 }
 function atualizar(){
  if(!inicializado)return;
  const {dest,rem,config}=dados();
  textoNo('PrevRemNome',rem.nome);
  textoNo('PrevRemCnpj',rem.documento);
  textoNo('PrevRemEndereco',endRem(rem).join('\n'));
  textoNo('PrevDestNome',dest.nome||'NOME DO DESTINATÁRIO');
  textoNo('PrevDestDoc',config.documento&&dest.doc?dest.doc:'');
  textoNo('PrevDestEndereco',endDest(dest).join('\n'));
  textoNo('PrevNf',config.nota&&dest.nf?'Referência: NF-e '+dest.nf:'');
  const erros=aplicarLayout(),faltam=validar();
  textoNo('Status',faltam.length?'Confira: '+faltam.join(', ')+'.':
   erros.length?'O conteúdo de '+erros.join(' e ')+' não cabe na margem segura. Ajuste os dados ou a posição.':
   'Prévia e impressão em retrato, sem rotação global. Arraste cada item independentemente.');
  textoNo('Medida',config.modo==='a4'?'A4 para conferência: envelope DEITADO, 229 × 114 mm':
   config.modo==='envelope115'?'Envelope DEITADO 230 × 115 mm (arte 229 × 114 mm)':
   'Envelope DEITADO 229 × 114 mm — paisagem, tamanho real');
 }
 function aplicarLayout(){
  const papel=el('Papel');
  if(!papel)return[];
  const largura=papel.clientWidth;
  if(largura)papel.style.fontSize=(largura/PAPEL.w*3.52778)+'px';
  const p=configuracao(),erros=[];
  let mudou=false;
  // Todos os elementos usam exatamente os mesmos x/y do CSS para imprimir.
  for(const tipo of TIPOS){
   const no=el('Arrastar'+PREFIXO[tipo]);
   if(!no)continue;
   const t=tamanhoBloco(tipo);
   no.style.width=(BLOCOS[tipo].w/PAPEL.w*100)+'%';
   if(BLOCOS[tipo].h)no.style.height=(BLOCOS[tipo].h/PAPEL.h*100)+'%';
   const pos=posicaoPermitida(tipo,p);
   if(!pos.cabe)erros.push(NOMES[tipo]);
   if(pos.x!==p[tipo+'X']||pos.y!==p[tipo+'Y'])mudou=true;
   p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
   no.style.left=(pos.x/PAPEL.w*100)+'%';
   no.style.top=(pos.y/PAPEL.h*100)+'%';
   no.style.transform='rotate('+(p[tipo+'Ang']||0)+'deg)';
   const px=el(PREFIXO[tipo]+'X'),py=el(PREFIXO[tipo]+'Y');
   if(px&&document.activeElement!==px)px.value=String(pos.x);
   if(py&&document.activeElement!==py)py.value=String(pos.y);
   const ang=el(PREFIXO[tipo]+'Angulo');
   if(ang)ang.textContent=(p[tipo+'Ang']||0)+'°';
  }
  if(mudou)guardarConfig(p);
  return erros;
 }
 function mudarPosicao(tipo,eixo,valorNovo){
  const p=configuracao(),n=Number(valorNovo);
  if(!Number.isFinite(n))return;
  p[tipo+eixo]=n;
  const pos=posicaoPermitida(tipo,p);
  p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
  guardarConfig(p);atualizar();
  textoNo('Info',NOMES[tipo]+' reposicionado. Os outros elementos não foram alterados.');
 }
 function mudarAngulo(tipo,delta){
  if(tipo==='logo')return;
  const p=configuracao();
  p[tipo+'Ang']=limitar(p[tipo+'Ang']+delta,-5,5);
  const pos=posicaoPermitida(tipo,p);
  p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
  guardarConfig(p);atualizar();
 }
 function conectarArraste(tipo){
  const no=el('Arrastar'+PREFIXO[tipo]),papel=el('Papel');
  if(!no||!papel)return;
  let inicio=null;
  no.addEventListener('dragstart',e=>e.preventDefault());
  no.addEventListener('pointerdown',e=>{
   if(e.button!==0||!papel.clientWidth)return;
   const p=configuracao();
   inicio={id:e.pointerId,x:e.clientX,y:e.clientY,origX:p[tipo+'X'],origY:p[tipo+'Y']};
   no.setPointerCapture(e.pointerId);
   no.classList.add('env-arrastando');
   e.preventDefault();
  });
  no.addEventListener('pointermove',e=>{
   if(!inicio||e.pointerId!==inicio.id)return;
   const escala=PAPEL.w/papel.getBoundingClientRect().width;
   const p=configuracao();
   p[tipo+'X']=inicio.origX+(e.clientX-inicio.x)*escala;
   p[tipo+'Y']=inicio.origY+(e.clientY-inicio.y)*escala;
   const pos=posicaoPermitida(tipo,p);
   p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
   guardarConfig(p);aplicarLayout();
  });
  const fim=e=>{
   if(!inicio||e.pointerId!==inicio.id)return;
   inicio=null;no.classList.remove('env-arrastando');
   atualizar();textoNo('Info','Posição de '+NOMES[tipo]+' salva para impressão.');
  };
  no.addEventListener('pointerup',fim);
  no.addEventListener('pointercancel',fim);
 }
 function restaurarTipo(tipo){
  const p=configuracao();
  for(const e of ['X','Y'])p[tipo+e]=PADRAO[tipo+e];
  if(tipo!=='logo')p[tipo+'Ang']=0;
  guardarConfig(p);atualizar();
  textoNo('Info','Somente '+NOMES[tipo]+' restaurado.');
 }
 function guardarOpcoes(){
  const p=configuracao(),modo=valor('Modo');
  p.modo=['envelope','envelope115','a4'].includes(modo)?modo:'envelope';
  p.nota=!!el('Nota')?.checked;p.documento=!!el('Documento')?.checked;
  guardarConfig(p);atualizar();
 }
 function child(parent,name){
  if(!parent)return null;
  return Array.from(parent.children||[]).find(n=>n.localName===name)||null;
 }
 function tag(parent,name){return child(parent,name)?.textContent?.trim()||'';}
 function formatCep(v){const n=somenteNumero(v).slice(0,8);return n.length>5?n.slice(0,5)+'-'+n.slice(5):n;}
 function formatDoc(v){
  const n=somenteNumero(v);
  if(n.length===11)return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  if(n.length===14)return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
  return v||'';
 }
 async function importarXml(e){
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2_000_000||file.size<100){
   textoNo('Status','XML fora do limite de 100 bytes a 2 MB.');return;
  }
  try{
   const xml=await file.text();
   if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML com DTD/entidades não é permitido.');
   const doc=new DOMParser().parseFromString(xml,'application/xml');
   if(doc.getElementsByTagName('parsererror').length)throw Error('XML inválido.');
   const inf=doc.getElementsByTagNameNS('*','infNFe')[0]||doc.getElementsByTagName('infNFe')[0];
   if(!inf)throw Error('Arquivo não contém uma NF-e (infNFe).');
   const origem=valor('Origem')==='emit'?'emit':'dest';
   const parte=child(inf,origem),end=child(parte,origem==='emit'?'enderEmit':'enderDest');
   if(!parte||!end)throw Error('NF-e sem dados de endereço de '+(origem==='emit'?'emitente':'destinatário')+'.');
   const campos={
    Nome:tag(parte,'xNome'),Doc:formatDoc(tag(parte,'CNPJ')||tag(parte,'CPF')),
    Rua:tag(end,'xLgr'),Numero:tag(end,'nro'),Compl:tag(end,'xCpl'),Bairro:tag(end,'xBairro'),
    Cep:formatCep(tag(end,'CEP')),Cidade:tag(end,'xMun'),Uf:tag(end,'UF'),
    Nf:tag(child(inf,'ide'),'nNF')
   };
   for(const [id,v] of Object.entries(campos)){if(el(id))el(id).value=v||'';}
   atualizar();
   textoNo('Info','NF-e '+(campos.Nf||'sem número')+' importada. Confira endereço e número antes de imprimir.');
  }catch(err){
   textoNo('Info','Não foi possível importar: '+String(err.message||err));
  }
 }
 function criarImpressao(){
  const erros=aplicarLayout();
  if(erros.length){
   textoNo('Status','Não é seguro imprimir: conteúdo fora da margem de '+erros.join(', ')+'.');
   return;
  }
  const faltam=validar();
  if(faltam.length){textoNo('Status','Confira antes de imprimir: '+faltam.join(', '));return;}
  const {dest,rem,config}=dados();
  const modo=config.modo;
  const pagina=window.open('','_blank','width=1000,height=850');
  if(!pagina){textoNo('Status','Libere janelas pop-up no navegador para imprimir.');return;}
  const textoHtml=t=>textoSeguro(t).replace(/\n/g,'<br>');
  function estilo(tipo){
   const pos=posicaoPermitida(tipo,config),b=BLOCOS[tipo];
   return 'left:'+pos.x+'mm;top:'+pos.y+'mm;width:'+b.w+'mm;'+
     (b.h?'height:'+b.h+'mm;':'')+
     'transform:rotate('+(config[tipo+'Ang']||0)+'deg);';
  }
  const remHtml='<div class="rem" style="'+estilo('rem')+'"><strong>REMETENTE</strong>'+
    '<div class="rn">'+textoHtml(rem.nome)+'</div><div>'+textoHtml(rem.documento)+'</div>'+
    '<div>'+textoHtml(endRem(rem).join('\n'))+'</div></div>';
  const destHtml='<div class="dest" style="'+estilo('dest')+'"><strong>DESTINATÁRIO</strong>'+
    '<div class="dn">'+textoHtml(dest.nome)+'</div>'+
    (config.documento&&dest.doc?'<div>'+textoHtml(dest.doc)+'</div>':'')+
    '<div class="end">'+textoHtml(endDest(dest).join('\n'))+'</div>'+
    (config.nota&&dest.nf?'<div class="ref-nfe">Referência: NF-e '+textoSeguro(dest.nf)+'</div>':'')+
    '</div>';
  const logo='<img alt="Sofisticatto" src="'+textoSeguro(location.origin+LOGO)+
    '" style="'+estilo('logo')+'">';
  const lines='<div class="postal-lines" style="'+estilo('linhas')+
    '" aria-hidden="true"><i></i><i></i><i></i></div>';
  const papelW=modo==='envelope115'?230:229,papelH=modo==='envelope115'?115:114;
  const paginaCss=modo==='a4'?
    '@page{size:A4 landscape;margin:0}.sheet{width:297mm;height:210mm}.art{left:34mm;top:48mm;}':
    '@page{size:'+papelW+'mm '+papelH+'mm;margin:0}.sheet{width:'+papelW+'mm;height:'+papelH+'mm}.art{left:'+
      (modo==='envelope115'?'0.5':'0')+'mm;top:'+(modo==='envelope115'?'0.5':'0')+'mm;}';
  const css=[
   'html,body{margin:0;padding:0;color:#191919;background:#ececf0;font-family:Arial,Helvetica,sans-serif}',
   '.toolbar{position:sticky;top:0;z-index:10;background:white;padding:12px 20px;border-bottom:1px solid #ddd}',
   '.toolbar button{border:0;border-radius:8px;background:#5a4fa3;color:#fff;padding:11px 16px;font-weight:bold;cursor:pointer}',
   '.toolbar small{margin-left:14px;color:#51476c}',
   '.sheet{position:relative;background:white;margin:20px auto;box-shadow:0 2px 14px #0002;overflow:hidden}',
   '.art{position:absolute;width:229mm;height:114mm;background:white;overflow:hidden}',
   '.art img{position:absolute;object-fit:contain;object-position:left center;transform-origin:top left}',
   '.rem,.dest{position:absolute;box-sizing:border-box;overflow-wrap:anywhere;transform-origin:top left}',
   '.rem{font-size:9pt;line-height:1.32}.dest{font-size:10pt;line-height:1.32}',
   '.rem strong,.dest strong{display:block;letter-spacing:.25px;margin-bottom:.56em;font-size:.8em}',
   '.rn{font-size:1.111em;font-weight:bold;line-height:1.22;margin-bottom:.3em}',
   '.dn{font-size:1.3em;font-weight:bold;line-height:1.2;margin-bottom:.4em}',
   '.end{white-space:normal}.ref-nfe{display:block;margin-top:.9em;font-size:.8em;line-height:1.32;color:#444}',
   '.postal-lines{position:absolute;transform-origin:top left;opacity:.6;box-sizing:border-box}',
   '.postal-lines i{display:block;border-top:1px solid #6e6e6e;margin-top:3mm;width:100%}',
   '.postal-lines i:nth-child(2){width:88%}.postal-lines i:nth-child(3){width:76%}',
   paginaCss,
   '@media print{html,body{background:white!important;width:100%;height:100%}',
   '.toolbar{display:none!important}.sheet{box-shadow:none;margin:0!important;break-after:avoid;page-break-after:avoid}',
   'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
  ].join('');
  const aviso=modo==='a4'?'Conferência em A4: arte em tamanho real':
    'Brother: papel '+papelW+' × '+papelH+' mm, PAISAGEM (deitado), alimentação manual e escala 100% (não A4)';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Envelope Sofisticatto</title>'+
   '<style>'+css+'</style></head><body><div class="toolbar">'+
   '<button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button>'+
   '<small>'+aviso+'</small></div>'+
   '<div class="sheet"><div class="art">'+logo+remHtml+destHtml+lines+
   '</div></div></body></html>';
  pagina.document.open();pagina.document.write(html);pagina.document.close();
  textoNo('Info','Prévia horizontal aberta. Na Brother selecione envelope na orientação Paisagem e escala 100%.');
 }
 function montar(){
  const root=document.getElementById('envelopeRoot');
  if(!root||inicializado)return;
  root.innerHTML=[
   '<div class="env-grid"><div class="card">',
   '<h2>Impressão em envelope</h2><p>Envelope DEITADO, 229 × 114 mm, sem rotação. A prévia e a página impressa ficam na horizontal.</p>',
   '<label class="relatorio-label">Importar XML da NF-e</label><input id="envXml" type="file" accept=".xml,text/xml,application/xml">',
   '<label class="relatorio-label">Obter endereço de</label><select id="envOrigem"><option value="dest">Destinatário da NF-e (cliente)</option><option value="emit">Emitente da NF-e</option></select>',
   '<div class="env-fields"><label>Nome / Razão social<input id="envNome"></label><label>CPF/CNPJ<input id="envDoc"></label>',
   '<label>Logradouro<input id="envRua"></label><label>Número<input id="envNumero"></label>',
   '<label>Complemento<input id="envCompl"></label><label>Bairro<input id="envBairro"></label>',
   '<label>CEP<input id="envCep" maxlength="9" inputmode="numeric"></label><label>Cidade<input id="envCidade"></label>',
   '<label>UF<input id="envUf" maxlength="2"></label><label>NF-e (opcional)<input id="envNf"></label></div>',
   '<button type="button" id="envRemCorreios" class="btn azul">Atualizar remetente dos Correios</button>',
   '<p id="envRemResumo" class="env-sender"></p>',
   '<div class="env-editor"><strong>Ajustar separadamente na prévia</strong>',
   '<p>Envelope horizontal: arraste a logo, remetente, destinatário ou risquinhos separadamente. As mesmas posições em milímetros serão usadas ao imprimir.</p>',
   '<div class="env-edit-grid">',
   '<div class="env-edit-card"><b>Logo</b><label>Esquerda (mm)<input id="envLogoX" type="number" step="0.5"></label><label>Topo (mm)<input id="envLogoY" type="number" step="0.5"></label><button type="button" data-env-reset="logo">Restaurar logo</button></div>',
   '<div class="env-edit-card"><b>Remetente</b><label>Esquerda (mm)<input id="envRemX" type="number" step="0.5"></label><label>Topo (mm)<input id="envRemY" type="number" step="0.5"></label>',
   '<div class="env-rotacao"><button type="button" data-env-tipo="rem" data-env-giro="-1">↶ 1°</button><output id="envRemAngulo">0°</output><button type="button" data-env-tipo="rem" data-env-giro="1">↷ 1°</button></div>',
   '<button type="button" data-env-reset="rem">Restaurar remetente</button></div>',
   '<div class="env-edit-card"><b>Destinatário + NF-e</b><label>Esquerda (mm)<input id="envDestX" type="number" step="0.5"></label><label>Topo (mm)<input id="envDestY" type="number" step="0.5"></label>',
   '<div class="env-rotacao"><button type="button" data-env-tipo="dest" data-env-giro="-1">↶ 1°</button><output id="envDestAngulo">0°</output><button type="button" data-env-tipo="dest" data-env-giro="1">↷ 1°</button></div>',
   '<button type="button" data-env-reset="dest">Restaurar destinatário</button></div>',
   '<div class="env-edit-card"><b>Três risquinhos</b><label>Esquerda (mm)<input id="envLinhasX" type="number" step="0.5"></label><label>Topo (mm)<input id="envLinhasY" type="number" step="0.5"></label>',
   '<div class="env-rotacao"><button type="button" data-env-tipo="linhas" data-env-giro="-1">↶ 1°</button><output id="envLinhasAngulo">0°</output><button type="button" data-env-tipo="linhas" data-env-giro="1">↷ 1°</button></div>',
   '<button type="button" data-env-reset="linhas">Restaurar risquinhos</button></div></div></div>',
   '<div class="env-controls"><label>Modelo de impressão<select id="envModo"><option value="envelope">Envelope deitado 229 × 114 mm</option><option value="envelope115">Envelope deitado 230 × 115 mm</option><option value="a4">Conferência em folha A4 deitada</option></select></label></div>',
   '<label class="env-check"><input id="envDocumento" type="checkbox"> Mostrar CPF/CNPJ do destinatário</label>',
   '<label class="env-check"><input id="envNota" type="checkbox"> Mostrar referência da NF-e</label>',
   '<div class="env-actions"><button type="button" id="envImprimir" class="btn roxo">Imprimir envelope / salvar PDF</button>',
   '<button type="button" id="envLimpar" class="btn">Limpar destinatário</button></div>',
   '<p class="env-info" id="envInfo" role="status"></p></div>',
   '<div class="card"><h2>Prévia do envelope</h2><p id="envMedida"></p>',
   '<div class="env-frame"><div class="env-paper" id="envPapel"><div class="env-limite" aria-hidden="true"></div>',
   '<img class="env-logo env-draggable" id="envArrastarLogo" src="'+LOGO+'" alt="Arraste a logo Sofisticatto" draggable="false">',
   '<div id="envArrastarRem" class="env-rem env-draggable"><strong>REMETENTE</strong><b id="envPrevRemNome"></b><small id="envPrevRemCnpj"></small><span id="envPrevRemEndereco"></span></div>',
   '<div id="envArrastarDest" class="env-dest env-draggable"><strong>DESTINATÁRIO</strong><b id="envPrevDestNome">NOME DO DESTINATÁRIO</b><small id="envPrevDestDoc"></small><span id="envPrevDestEndereco"></span><small id="envPrevNf" class="env-nf"></small></div>',
   '<div class="env-postal-lines env-draggable" id="envArrastarLinhas" title="Arraste os três risquinhos"><i></i><i></i><i></i></div>',
   '</div></div><p id="envStatus" role="status" class="env-info"></p>',
   '<p class="env-info">Este é o endereçamento do envelope, não uma etiqueta oficial dos Correios com rastreio.</p>',
   '<p class="env-info"><b>Brother:</b> use a orientação Paisagem (envelope deitado), tipo Envelopes, alimentação manual, escala 100% e sem duplex. Confira o tamanho personalizado: 229 × 114 mm (ou 230 × 115 mm se selecionado). Não deixe A4 selecionado.</p>',
   '</div></div>'
  ].join('');
  if(!document.getElementById('envelopeEstilo')){
   const style=document.createElement('style');style.id='envelopeEstilo';
   style.textContent=[
    '#emailSubEnvelope{width:100%;min-width:0}',
    '.env-grid{display:grid;grid-template-columns:minmax(320px,470px) minmax(0,1fr);gap:18px}',
    '#emailSubEnvelope .card{min-width:0;padding:20px}',
    '#emailSubEnvelope .relatorio-label{display:block;margin-top:12px;font-size:13px;font-weight:600}',
    '#emailSubEnvelope input:not([type=checkbox]),#emailSubEnvelope select{max-width:100%;width:100%;box-sizing:border-box;border:1px solid #d7c9ed;border-radius:8px;padding:9px;background:#f7f5fc}',
    '.env-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}',
    '.env-fields label,.env-controls label{font-size:13px;font-weight:600;color:#514983}',
    '.env-fields input,.env-controls input{display:block;margin-top:4px}',
    '.env-controls{display:grid;grid-template-columns:1fr;margin:15px 0}',
    '.env-check{display:block;margin:8px 0;font-size:13px}',
    '.env-actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}',
    '.env-sender,.env-info{color:#64588f;font-size:12px;line-height:1.5}',
    '.env-editor{padding:12px;border:1px solid #dfd4ed;border-radius:12px;background:#faf9ff;margin-top:12px}',
    '.env-editor>strong{font-size:14px;color:#51427c}',
    '.env-editor p{font-size:12px;color:#62577e;line-height:1.4}',
    '.env-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
    '.env-edit-card{padding:10px;border:1px solid #ddd2ee;border-radius:9px;background:#fff}',
    '.env-edit-card>b{display:block;color:#554580;font-size:13px;margin-bottom:7px}',
    '.env-edit-card label{display:block;font-size:12px;color:#5c5183;margin:7px 0}',
    '.env-edit-card input{display:block;margin-top:3px}',
    '.env-edit-card button{border:1px solid #cfbfdf;border-radius:7px;background:#fff;color:#54448c;padding:7px;font-size:12px;cursor:pointer}',
    '.env-rotacao{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}',
    '.env-rotacao output{min-width:26px;text-align:center;color:#51427c;font-size:12px;font-weight:700}',
    '.env-frame{overflow-x:auto;border:1px solid #d5cbe7;border-radius:12px;background:#f9f7fc;padding:14px;display:flex;justify-content:center}',
    '.env-paper{position:relative;width:100%;max-width:860px;aspect-ratio:229 / 114;background:white;border:1px solid #b2a9c0;box-shadow:0 2px 8px #0001;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#191919;box-sizing:border-box}',
    '.env-limite{position:absolute;inset:7.02% 3.49%;border:1px dashed #c1b0d8;pointer-events:none;box-sizing:border-box}',
    '.env-paper .env-logo{position:absolute;object-fit:contain;object-position:left center;transform-origin:top left}',
    '.env-rem,.env-dest{position:absolute;box-sizing:border-box;overflow-wrap:anywhere;transform-origin:top left}',
    '.env-rem{font-size:.9em;line-height:1.32}.env-dest{font-size:1em;line-height:1.32}',
    '.env-rem strong,.env-dest strong{display:block;letter-spacing:.25px;margin-bottom:.56em;font-size:.8em}',
    '.env-rem b,.env-dest b,.env-rem small,.env-dest small,.env-rem span,.env-dest span{display:block}',
    '.env-rem small,.env-dest small{font-size:1em}',
    '.env-rem b{font-size:1.111em;font-weight:bold;line-height:1.22;margin-bottom:.3em}',
    '.env-dest b{font-size:1.3em;font-weight:bold;line-height:1.2;margin-bottom:.4em}',
    '#envPrevRemEndereco,#envPrevDestEndereco{white-space:pre-line}',
    '.env-dest .env-nf{margin-top:.9em;font-size:.8em;line-height:1.32;color:#444}',
    '.env-postal-lines{position:absolute;box-sizing:border-box;transform-origin:top left;opacity:.6}',
    '.env-postal-lines i{display:block;border-top:1px solid #6e6e6e;margin-top:3mm;width:100%}',
    '.env-postal-lines i:nth-child(2){width:88%}.env-postal-lines i:nth-child(3){width:76%}',
    '.env-draggable{cursor:grab;touch-action:none;user-select:none;outline:1px dashed transparent}',
    '.env-draggable:hover{outline-color:#7556a5;background-color:rgba(121,90,178,.04)}',
    '.env-draggable.env-arrastando{cursor:grabbing;outline-color:#6a1b9a;background-color:rgba(121,90,178,.1)}',
    '@media(max-width:900px){.env-grid{grid-template-columns:1fr}}',
    '@media(max-width:580px){.env-fields,.env-edit-grid{grid-template-columns:1fr}.env-paper{max-width:100%}}'
   ].join('\n');
   document.head.appendChild(style);
  }
  const cfg=configuracao();
  el('Modo').value=cfg.modo;
  el('Documento').checked=!!cfg.documento;
  el('Nota').checked=!!cfg.nota;
  el('Xml').addEventListener('change',importarXml);
  for(const id of IDS){
   const campo=el(id.charAt(0).toUpperCase()+id.slice(1));
   if(campo)campo.addEventListener('input',atualizar);
  }
  el('Cep').addEventListener('blur',()=>{el('Cep').value=formatCep(el('Cep').value);atualizar();});
  el('Uf').addEventListener('blur',()=>{el('Uf').value=valor('Uf').toUpperCase();atualizar();});
  for(const id of ['Modo','Documento','Nota'])el(id).addEventListener('change',guardarOpcoes);
  for(const tipo of TIPOS){
   conectarArraste(tipo);
   for(const eixo of ['X','Y']){
    const input=el(PREFIXO[tipo]+eixo);
    if(input)input.addEventListener('change',()=>mudarPosicao(tipo,eixo,input.value));
   }
  }
  root.querySelectorAll('[data-env-giro]').forEach(botao=>botao.addEventListener('click',()=>
   mudarAngulo(botao.getAttribute('data-env-tipo'),Number(botao.getAttribute('data-env-giro')))));
  root.querySelectorAll('[data-env-reset]').forEach(botao=>botao.addEventListener('click',()=>
   restaurarTipo(botao.getAttribute('data-env-reset'))));
  el('Imprimir').addEventListener('click',criarImpressao);
  el('RemCorreios').addEventListener('click',()=>{textoNo('RemResumo',dadoRemetenteResumo());atualizar();});
  el('Limpar').addEventListener('click',()=>{
   for(const id of IDS)el(id.charAt(0).toUpperCase()+id.slice(1)).value='';
   el('Xml').value='';atualizar();textoNo('Info','Destinatário limpo.');
  });
  inicializado=true;
  textoNo('RemResumo',dadoRemetenteResumo());
  atualizar();
  if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(()=>{if(inicializado)aplicarLayout();});
   observer.observe(el('Papel'));
  }
 }
 function dadoRemetenteResumo(){
  const rem=dadosRemetente();
  return 'Remetente: '+rem.nome+' · '+rem.documento+' · '+endRem(rem).join(' · ');
 }
 window.inicializarImpressaoEnvelopeSofisticatto=montar;
})();
