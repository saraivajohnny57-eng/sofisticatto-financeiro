/* Correios: prévia interna dos documentos oficiais (v1) */
(function(){
"use strict";
let busy=false,active=null;
function preview(blob,name){
  if(active)active.close();
  const url=URL.createObjectURL(blob),modal=document.createElement("div");
  modal.style.cssText="position:fixed;inset:0;z-index:2147483000;background:#161126bb;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box";
  const panel=document.createElement("section");
  panel.style.cssText="width:min(1120px,100%);height:94vh;background:white;border-radius:14px;overflow:hidden;display:flex;flex-direction:column";
  const bar=document.createElement("header");
  bar.style.cssText="padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:600 14px Arial";
  const title=document.createElement("span");title.textContent=name;title.style.flex="1";
  const frame=document.createElement("iframe");frame.title="Prévia de impressão Correios";frame.style.cssText="flex:1;width:100%;border:0;background:#eee";
  frame.src=url;
  const btn=(t,fn)=>{const b=document.createElement("button");b.type="button";b.textContent=t;b.style.cssText="background:#6446a5;color:white;border:0;border-radius:8px;padding:10px 14px;cursor:pointer";b.onclick=fn;return b;};
  let closed=false;
  const close=()=>{if(closed)return;closed=true;modal.remove();document.removeEventListener("keydown",esc);setTimeout(()=>URL.revokeObjectURL(url),3000);if(active?.modal===modal)active=null;};
  const esc=e=>{if(e.key==="Escape")close();};
  document.addEventListener("keydown",esc);
  const print=btn("Imprimir",()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){console.warn(e);}});
  const download=btn("Baixar arquivo",()=>{const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();});
  bar.append(title,print,download,btn("Fechar",close));panel.append(bar,frame);modal.appendChild(panel);document.body.appendChild(modal);
  active={modal,close};
}
window.abrirDocumentoCorreiosOficial=async function(tipo){
  if(busy)return;
  busy=true;
  try{
    if(typeof confirmarColetaAntesDocumentoCorreios==="function"&&!(await confirmarColetaAntesDocumentoCorreios()))return;
    const pre=await localizarPrePostagemCorreiosOficial(true);
    const id=String(pre?.idPrePostagem||pre?.id||valorCampoCorreios("corIdPrePostagem")||"").trim();
    if(!id)throw Error(pre?.erro||"Informe ou localize primeiro o ID da pré-postagem.");
    const rotulo=tipo==="rotulo"||tipo==="rotulo-l42";
    const dace=tipo==="dace";
    statusCorreiosOficial("Gerando documento oficial dos Correios...",true);
    const qs=new URLSearchParams({action:"documentos-correios",modo:tipo,idPrePostagem:id});
    if(rotulo)qs.set("tipoRotulo","P");
    const chave=typeof chaveIntegracoesCotacao==="function"?chaveIntegracoesCotacao():"";
    const resp=await fetch("/api/integracoes?"+qs.toString(),{headers:chave?{"x-integrations-admin-key":chave}:{}});
    if(!resp.ok){
      const ct=resp.headers.get("content-type")||"";
      let detalhe="";
      if(ct.includes("json")){const j=await resp.json().catch(()=>({}));detalhe=j.erro||j.message||j.mensagem||JSON.stringify(j);}
      else detalhe=await resp.text().catch(()=>"");
      throw Error(detalhe||"Correios HTTP "+resp.status);
    }
    const bytes=await resp.arrayBuffer();
    if(!bytes.byteLength)throw Error("Os Correios retornaram um documento vazio.");
    const ct=(resp.headers.get("content-type")||"").toLowerCase();
    const header=new TextDecoder().decode(bytes.slice(0,20)).trimStart();
    const pdf=header.startsWith("%PDF");
    const html=ct.includes("html")||/^<!doctype html|^<html/i.test(header);
    if(!pdf&&!html)throw Error("Os Correios retornaram um formato inesperado ("+(ct||"sem tipo")+").");
    const blob=new Blob([bytes],{type:pdf?"application/pdf":"text/html;charset=utf-8"});
    const nome=rotulo?"Rotulo-oficial-Correios-100x150.pdf":dace?"DACE-Correios.pdf":pdf?"Declaracao-Correios.pdf":"Declaracao-Correios.html";
    preview(blob,nome);
    statusCorreiosOficial("✅ Documento oficial aberto para impressão dentro do sistema.",true);
  }catch(e){
    console.error("Correios documento oficial:",e);
    statusCorreiosOficial("⚠️ "+(e.message||e),false);
    alert("Não foi possível abrir o documento oficial dos Correios.\n\n"+(e.message||e));
  }finally{busy=false;}
};
})();