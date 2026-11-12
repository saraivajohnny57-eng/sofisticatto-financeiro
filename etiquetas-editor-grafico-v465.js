/* V465 — Arte gráfica editável da etiqueta 150 x 100 mm.
 * Um mesmo layout local é aplicado à prévia, à impressão e ao PDF.
 * Não modifica dados bancários, Correios, código de barras ou NF-e.
 */
(function(){
  'use strict';
  const STORAGE='sofisticatto_etiqueta_arte_v465';
  const NS='http://www.w3.org/2000/svg';
  const MAX_ELEMENTS=40;
  const MAX_STORAGE=1300000;
  const max=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const round=v=>Math.round(v*100)/100;
  const genId=()=>String(Date.now())+'_'+Math.random().toString(36).slice(2,8);
  const urlValida=s=>/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(String(s||''))&&s.length<900000;
  let itens=[],modo='desligado',selecao=null,interacao=null,previa=null,painel=null,status=null,escala=null;
  function carregar(){
    try{
      const r=JSON.parse(localStorage.getItem(STORAGE)||'[]');
      if(!Array.isArray(r))return;
      itens=r.slice(0,MAX_ELEMENTS).filter(o=>o&&['linha','traco','imagem'].includes(o.tipo)&&typeof o.id==='string')
        .filter(o=>o.tipo!=='imagem'||urlValida(o.src))
        .filter(o=>o.tipo==='imagem'||(Array.isArray(o.pontos)&&o.pontos.length>=2&&o.pontos.length<=1100))
        .map(o=>o.tipo==='imagem'?{id:o.id,tipo:o.tipo,src:o.src,x:max(o.x,0,148),y:max(o.y,0,98),
          w:max(o.w,5,75),h:max(o.h,3,75)}:
          {id:o.id,tipo:o.tipo,pontos:o.pontos.map(p=>[max(p[0],0,150),max(p[1],0,100)])});
    }catch(_){}
  }
  function salvar(){
    try{
      const txt=JSON.stringify(itens);
      if(txt.length>MAX_STORAGE)throw Error('Limite de espaço para figuras atingido.');
      localStorage.setItem(STORAGE,txt);
    }catch(err){aviso('Não foi possível salvar: '+(err.message||err));}
  }
  function aviso(texto){if(status)status.textContent=texto;}
  function svgEl(nome){return document.createElementNS(NS,nome);}
  function construirCamada(etiqueta){
    if(!etiqueta)return null;
    let layer=etiqueta.querySelector('.etq-arte-camada');
    if(!layer){layer=document.createElement('div');layer.className='etq-arte-camada';etiqueta.appendChild(layer);}
    return layer;
  }
  function renderizar(etiqueta){
    const layer=construirCamada(etiqueta);if(!layer)return;
    layer.replaceChildren();
    const svg=svgEl('svg');svg.classList.add('etq-arte-vetor');
    svg.setAttribute('viewBox','0 0 150 100');
    svg.setAttribute('preserveAspectRatio','none');
    svg.setAttribute('aria-hidden','true');
    for(const item of itens){
      if(item.tipo==='imagem')continue;
      const path=svgEl('path');
      const pts=item.pontos||[];
      if(!pts.length)continue;
      const d=pts.map((p,i)=>(i?'L':'M')+round(p[0])+' '+round(p[1])).join(' ');
      path.setAttribute('d',d);
      path.setAttribute('fill','none');
      path.setAttribute('stroke','#111');
      path.setAttribute('stroke-linecap','round');
      path.setAttribute('stroke-linejoin','round');
      path.setAttribute('stroke-width',item.id===selecao&&etiqueta===previa?'0.72':'0.42');
      path.setAttribute('pointer-events','stroke');
      path.setAttribute('data-arte-id',item.id);
      svg.appendChild(path);
    }
    layer.appendChild(svg);
    for(const item of itens){
      if(item.tipo!=='imagem')continue;
      const img=document.createElement('img');
      img.className='etq-arte-imagem';
      img.setAttribute('data-arte-id',item.id);
      img.alt='Imagem inserida na etiqueta';
      img.src=item.src;
      img.style.left=item.x+'mm';
      img.style.top=item.y+'mm';
      img.style.width=item.w+'mm';
      img.style.height=item.h+'mm';
      if(item.id===selecao&&etiqueta===previa)img.classList.add('etq-arte-selecionada');
      layer.appendChild(img);
    }
    if(etiqueta===previa && !layer.dataset.arteEventos){
      layer.dataset.arteEventos='1';
      layer.addEventListener('pointerdown',pointerDown);
      layer.addEventListener('pointermove',pointerMove);
      layer.addEventListener('pointerup',pointerFim);
      layer.addEventListener('pointercancel',pointerFim);
      layer.addEventListener('lostpointercapture',pointerFim);
    }
  }
  window.sofAplicarArteEtiquetaV465=renderizar;
  function ponto(e){
    const r=previa.getBoundingClientRect();
    return [round(max((e.clientX-r.left)/Math.max(1,r.width)*150,0,150)),
      round(max((e.clientY-r.top)/Math.max(1,r.height)*100,0,100))];
  }
  function mostrarSelecao(){
    const o=itens.find(x=>x.id===selecao);
    if(escala){
      escala.disabled=!(o&&o.tipo==='imagem');
      escala.value=o&&o.tipo==='imagem'?String(o.w):'25';
    }
    renderizar(previa);
  }
  function pointerDown(e){
    if(modo==='desligado'||e.button>0)return;
    e.preventDefault();
    const p=ponto(e);
    if(modo==='selecionar'){
      const id=e.target.closest?.('[data-arte-id]')?.getAttribute('data-arte-id')||null;
      selecao=id;
      const item=itens.find(x=>x.id===id);
      if(item){
        interacao={id,pointer:e.pointerId,inicio:p,
          copia:item.tipo==='imagem'?{x:item.x,y:item.y}:item.pontos.map(t=>t.slice())};
      }
      mostrarSelecao();
      aviso(item?'Elemento selecionado. Arraste para mover ou use Apagar selecionado.':'Selecione um desenho ou imagem.');
    }else if(modo==='linha'||modo==='desenhar'){
      if(itens.length>=MAX_ELEMENTS){aviso('Máximo de '+MAX_ELEMENTS+' elementos. Apague algum para continuar.');return;}
      const item={id:genId(),tipo:modo==='linha'?'linha':'traco',pontos:[p.slice(),p.slice()]};
      itens.push(item);selecao=item.id;
      interacao={id:item.id,pointer:e.pointerId,inicio:p};
      renderizar(previa);
    }
    if(interacao)try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
  }
  function pointerMove(e){
    if(!interacao||e.pointerId!==interacao.pointer)return;
    e.preventDefault();
    const p=ponto(e);
    const item=itens.find(x=>x.id===interacao.id);
    if(!item)return;
    if(modo==='linha')item.pontos[1]=p;
    else if(modo==='desenhar'){
      const last=item.pontos[item.pontos.length-1];
      if(item.pontos.length<1100&&Math.hypot(p[0]-last[0],p[1]-last[1])>0.27)item.pontos.push(p);
    }else if(modo==='selecionar'){
      const dx=p[0]-interacao.inicio[0],dy=p[1]-interacao.inicio[1];
      if(item.tipo==='imagem'){
        item.x=round(max(interacao.copia.x+dx,0,150-item.w));
        item.y=round(max(interacao.copia.y+dy,0,100-item.h));
      }else{
        item.pontos=interacao.copia.map(q=>[round(max(q[0]+dx,0,150)),round(max(q[1]+dy,0,100))]);
      }
    }
    renderizar(previa);
  }
  function pointerFim(e){
    if(!interacao||e.pointerId!==interacao.pointer)return;
    const item=itens.find(x=>x.id===interacao.id);
    // Um clique sem deslocamento não gera linha ou traço invisível.
    if(item && (item.tipo==='linha'||item.tipo==='traco')
      && Math.hypot(item.pontos.at(-1)[0]-item.pontos[0][0],item.pontos.at(-1)[1]-item.pontos[0][1])<0.25){
      itens=itens.filter(x=>x.id!==item.id);
      selecao=null;
    }
    interacao=null;salvar();mostrarSelecao();
    aviso('Arte salva neste navegador. A impressão e o PDF usam esses elementos.');
  }
  function setModo(novo){
    modo=modo===novo?'desligado':novo;
    previa.classList.toggle('etq-arte-editando',modo!=='desligado');
    if(modo!=='desligado'&&previa.classList.contains('etq-movel-ativa')){
      painel?.ownerDocument?.querySelector('#etqEditorPosicaoV464 button[aria-pressed="true"]')?.click();
    }
    painel.querySelectorAll('button[data-arte-modo]').forEach(b=>{
      b.classList.toggle('ativo',b.dataset.arteModo===modo);
      b.setAttribute('aria-pressed',String(b.dataset.arteModo===modo));
    });
    interacao=null;
    aviso(modo==='desligado'?'Edição desativada. Arte pronta para imprimir ou salvar em PDF.':
      modo==='selecionar'?'Clique na figura para selecionar e arraste para mover.':
      modo==='linha'?'Arraste na etiqueta para traçar uma linha reta.':'Arraste na etiqueta para desenhar.');
    renderizar(previa);
  }
  async function carregarImagem(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){
      aviso('Escolha uma imagem PNG, JPG ou WebP (SVG não permitido).');return;
    }
    if(file.size>8*1024*1024){aviso('Imagem maior que 8 MB. Escolha um arquivo menor.');return;}
    if(itens.length>=MAX_ELEMENTS){aviso('Limite de '+MAX_ELEMENTS+' figuras atingido.');return;}
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Arquivo de imagem inválido.'));img.src=url;});
      const s=Math.min(1,850/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const src=canvas.toDataURL('image/webp',0.8);
      if(!urlValida(src))throw Error('Imagem muito grande para salvar. Reduza a resolução.');
      const width=25,height=round(max(width*h/w,3,50));
      const item={id:genId(),tipo:'imagem',src,x:round(max(112,0,150-width)),
        y:round(max(60,0,100-height)),w:width,h:height};
      itens.push(item);selecao=item.id;salvar();setModo('selecionar');mostrarSelecao();
      aviso('Imagem adicionada. Arraste para mover e use o controle de tamanho.');
    }catch(err){aviso(err.message||String(err));}
    finally{URL.revokeObjectURL(url);}
  }
  function button(label,action,props){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;
    if(props)for(const [key,val] of Object.entries(props))b.setAttribute(key,val);
    return b;
  }
  function iniciar(){
    previa=document.getElementById('etqPreview');
    const area=document.querySelector('.etiqueta-preview-area');
    if(!previa||!area||document.getElementById('etqEditorGraficoV465'))return;
    carregar();
    painel=document.createElement('section');painel.id='etqEditorGraficoV465';painel.className='etq-arte-editor';
    const title=document.createElement('h3');title.textContent='Elementos gráficos da etiqueta';
    const help=document.createElement('p');
    help.textContent='Desenhe, trace linhas ou importe PNG/JPG/WebP. As figuras serão exibidas na prévia, impressão e PDF. Evite cobrir QR Code e código de barras.';
    const row=document.createElement('div');row.className='etq-arte-ferramentas';
    for(const [key,label] of [['desenhar','✏ Desenhar'],['linha','╱ Linha reta'],['selecionar','↔ Selecionar e mover']]){
      row.appendChild(button(label,()=>setModo(key),{'data-arte-modo':key,'aria-pressed':'false'}));
    }
    const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='image/png,image/jpeg,image/webp';
    fileInput.style.display='none';
    fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];fileInput.value='';carregarImagem(file);});
    row.append(
      button('＋ Importar imagem',()=>fileInput.click()),
      button('⨯ Apagar selecionado',()=>{
        if(!selecao){aviso('Selecione um elemento para excluir.');return;}
        itens=itens.filter(x=>x.id!==selecao);selecao=null;salvar();mostrarSelecao();
        aviso('Elemento removido.');
      }),
      button('↶ Desfazer último',()=>{
        if(!itens.length)return;
        itens.pop();selecao=null;salvar();mostrarSelecao();aviso('Último elemento removido.');
      }),
      button('✓ Finalizar edição',()=>{modo='ativo';setModo('desligado');}),
      fileInput
    );
    const label=document.createElement('label');label.className='etq-arte-tamanho';
    label.textContent='Tamanho da imagem selecionada';
    escala=document.createElement('input');escala.type='range';escala.min='5';escala.max='70';escala.step='1';
    escala.value='25';escala.disabled=true;
    escala.addEventListener('input',()=>{
      const item=itens.find(x=>x.id===selecao);
      if(!item||item.tipo!=='imagem')return;
      const ratio=item.h/item.w;item.w=Number(escala.value);item.h=round(item.w*ratio);
      item.x=round(max(item.x,0,150-item.w));item.y=round(max(item.y,0,100-item.h));renderizar(previa);
    });
    escala.addEventListener('change',salvar);
    label.appendChild(escala);
    status=document.createElement('p');status.className='etq-arte-status';status.setAttribute('role','status');
    painel.append(title,help,row,label,status);
    area.parentNode.insertBefore(painel,area);
    area.addEventListener('click',e=>{
      if(e.target.closest?.('#etqEditorPosicaoV464'))return;
    });
    const pos=document.getElementById('etqEditorPosicaoV464');
    pos?.addEventListener('click',()=>{
      if(previa.classList.contains('etq-movel-ativa')&&modo!=='desligado')setModo('desligado');
    });
    renderizar(previa);
    aviso('Ative uma ferramenta para editar. As alterações são salvas apenas neste navegador.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  else iniciar();
})();