/* Sofisticatto V460 - diálogo reutilizável de confirmação e progresso em lote.
   Nenhuma chamada bancária ou envio ocorre dentro deste componente. */
(function(){
 'use strict';
 function node(tag,css,text){const el=document.createElement(tag);if(css)el.style.cssText=css;if(text!=null)el.textContent=String(text);return el;}
 const fmt=(n)=>String(Math.max(0,Number(n)||0)).padStart(2,'0');
 function montar(titulo){
  const fundo=node('div','position:fixed;inset:0;z-index:2147483001;background:rgba(23,12,42,.64);display:flex;align-items:center;justify-content:center;padding:16px');
  const painel=node('section','background:#fff;color:#29213b;border:1px solid #e4d8f5;border-radius:20px;box-shadow:0 18px 64px #1d103a44;padding:24px;width:min(460px,95vw);font:14px Segoe UI,Arial,sans-serif;max-height:90vh;overflow:auto');
  painel.setAttribute('role','dialog');painel.setAttribute('aria-modal','true');painel.setAttribute('aria-label',titulo);
  // Identidade visual oficial usada também nas etiquetas. Não depende de dados de usuário.
  const marca=node('div','display:flex;align-items:center;justify-content:center;padding:2px 0 12px;margin-bottom:14px;border-bottom:1px solid #f0e9f9');
  const logo=node('img','display:block;width:min(215px,65%);height:66px;object-fit:contain');
  logo.src='/assets/sofisticatto-logo.jpeg';
  logo.alt='Sofisticatto Cosméticos';
  logo.onerror=()=>{logo.remove();marca.textContent='Sofisticatto Cosméticos';marca.style.font='italic 600 21px Georgia,serif';marca.style.color='#5a4fa3';};
  marca.append(logo);
  const heading=node('h2','font-size:19px;font-weight:750;color:#5a319b;margin:0 0 8px',titulo);
  const descricao=node('div','font-size:13px;color:#615877;line-height:1.5;margin-bottom:14px');
  const barra=node('progress','width:100%;height:17px;accent-color:#6a1b9a;display:block;margin:10px 0 5px');
  barra.max=100;barra.value=0;
  const porcentagem=node('div','text-align:right;font-size:13px;color:#55439e;font-weight:700;margin-bottom:10px','0%');
  const numeros=node('div','display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:13px 0');
  const detalhe=node('div','font-size:12px;color:#645b70;overflow-wrap:anywhere;margin-top:10px;min-height:18px');
  detalhe.setAttribute('role','status');detalhe.setAttribute('aria-live','polite');
  const aviso=node('div','font-size:12px;color:#6b6280;margin-top:8px','Não feche esta página enquanto o processamento estiver em andamento.');
  const rodape=node('div','display:flex;gap:9px;justify-content:flex-end;margin-top:18px');
  painel.append(marca,heading,descricao,barra,porcentagem,numeros,detalhe,aviso,rodape);fundo.append(painel);document.body.append(fundo);
  const cards=new Map();
  function indicador(rotulo,valor){
    let item=cards.get(rotulo);
    if(!item){
     const wrap=node('div','background:#f7f3fd;border:1px solid #ebe0f8;border-radius:11px;padding:10px');
     const label=node('div','font-size:12px;color:#665d78;margin-bottom:4px',rotulo);
     const num=node('strong','font-size:18px;color:#39266f;font-variant-numeric:tabular-nums',valor);
     wrap.append(label,num);numeros.append(wrap);cards.set(rotulo,num);item=num;
    }item.textContent=String(valor);
  }
  return {fundo,descricao,barra,porcentagem,numeros,detalhe,aviso,rodape,indicador,fechar:()=>fundo.remove()};
 }
 window.sofConfirmarLoteV460=function({titulo='Confirmar operação',mensagem='',confirmar='Continuar'}={}){
  return new Promise(resolve=>{
   const ui=montar(titulo);ui.barra.remove();ui.porcentagem.remove();ui.numeros.remove();ui.aviso.remove();
   ui.descricao.textContent=mensagem;
   const cancelar=node('button','padding:10px 16px;background:#ede9f5;border:0;border-radius:10px;color:#473d66;cursor:pointer','Cancelar');
   const ok=node('button','padding:10px 16px;background:#5c49aa;border:0;border-radius:10px;color:white;font-weight:700;cursor:pointer',confirmar);
   const terminar=v=>{ui.fechar();resolve(v)};
   cancelar.onclick=()=>terminar(false);ok.onclick=()=>terminar(true);
   ui.rodape.append(cancelar,ok);ok.focus();
  });
 };
 window.sofProgressoLoteV460=function({titulo='Processando',total=0,nota=''}={}){
  const ui=montar(titulo);ui.aviso.textContent=nota||ui.aviso.textContent;
  const t=Math.max(0,Number(total)||0);
  let fechado=false;
  const concluir=node('button','padding:10px 20px;background:#5c49aa;color:white;border:0;border-radius:10px;font-weight:700;cursor:pointer','Fechar');
  concluir.hidden=true;concluir.onclick=()=>{fechado=true;ui.fechar()};
  ui.rodape.append(concluir);
  function atualizar({concluidos=0,erros=0,sucessos=0,etapa='',extras={},finalizado=false}={}){
   if(fechado)return;
   const done=Math.max(0,Math.min(t,Number(concluidos)||0)),percent=t?Math.round(100*done/t):0;
   ui.barra.max=100;ui.barra.value=percent;ui.porcentagem.textContent=percent+'%';
   ui.indicador('Processados',fmt(done)+'/'+fmt(t));
   ui.indicador('Concluídos com sucesso',fmt(sucessos)+'/'+fmt(t));
   ui.indicador('Erros',fmt(erros));
   for(const [k,v] of Object.entries(extras))ui.indicador(k,v);
   ui.detalhe.textContent=etapa;
   if(finalizado){ui.aviso.textContent='Processamento finalizado. Confira o resultado antes de fechar.';concluir.hidden=false;concluir.focus();}
  }
  atualizar();
  return {atualizar,fechar:()=>{fechado=true;ui.fechar()},finalizar:(info)=>atualizar({...info,finalizado:true})};
 };
})();
