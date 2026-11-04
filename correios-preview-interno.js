/* Correios: prévia interna dos documentos oficiais (v1) */
(function(){
"use strict";
let busy=false,active=null;
function preview(blob,name,opcoes={}){
  if(active)active.close();
  const url=URL.createObjectURL(blob),modal=document.createElement("div");
  const urlsExtras=[];
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
  const close=()=>{if(closed)return;closed=true;modal.remove();document.removeEventListener("keydown",esc);setTimeout(()=>{URL.revokeObjectURL(url);urlsExtras.forEach(u=>URL.revokeObjectURL(u));},3000);if(active?.modal===modal)active=null;};
  const esc=e=>{if(e.key==="Escape")close();};
  document.addEventListener("keydown",esc);
  const print=btn("Imprimir",()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){console.warn(e);}});
  const download=btn("Baixar arquivo",()=>{const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();});
  // PDF original preservado: não converter em imagem, JPEG ou canvas,
  // pois isso suaviza os códigos de barras e as letras pequenas.
  if(opcoes.rotulo){
    const alta=btn("Imprimir 100×150 (nítido)",async()=>{
      try{
        alta.disabled=true;alta.textContent="Preparando PDF...";
        const qs=new URLSearchParams({action:"documentos-correios",modo:"rotulo-l42",idPrePostagem:opcoes.id,tipoRotulo:"P"});
        const chave=typeof chaveIntegracoesCotacao==="function"?chaveIntegracoesCotacao():"";
        const resp=await fetch("/api/integracoes?"+qs,{headers:chave?{"x-integrations-admin-key":chave}:{}});
        if(!resp.ok)throw Error((await resp.json().catch(()=>({}))).erro||"Erro HTTP "+resp.status);
        const arquivo=await resp.blob();
        if(!arquivo.type.includes("pdf"))throw Error("Resposta não é PDF.");
        const u=URL.createObjectURL(arquivo);
        urlsExtras.push(u);
        // Exibe o PDF vetorial de 100x150 no próprio visualizador Sofisticatto.
        // Nenhuma nova guia, extensão Adobe ou conversão para imagem.
        frame.onload=()=>{alta.disabled=false;alta.textContent="Imprimir 100×150 (nítido)";};
        frame.src=u;
        title.textContent="Rótulo oficial Correios — 100×150 mm (alta definição)";
        alta.textContent="Imprimir 100×150 (nítido)";
        print.textContent="Imprimir PDF 100×150";
        print.onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){alert("Use o ícone Imprimir no visualizador da etiqueta.");}};
        download.onclick=()=>{const a=document.createElement("a");a.href=u;a.download="Rotulo-Correios-100x150.pdf";document.body.appendChild(a);a.click();a.remove();};
      }catch(e){alert("Não foi possível preparar o PDF 100×150: "+e.message)}
      finally{alta.disabled=false;alta.textContent="Imprimir 100×150 (nítido)"}
    });
    alta.style.background="#17653c";
    bar.append(alta);
    const dica=document.createElement("small");
    dica.textContent="Na impressão: tamanho real (100%), papel 100×150 mm e modo alta qualidade; desative economia de toner.";
    dica.style.cssText="display:block;width:100%;font:12px Arial;color:#444";
    bar.append(dica);
  }
  bar.append(title,print,download,btn("Fechar",close));panel.append(bar,frame);modal.appendChild(panel);document.body.appendChild(modal);
  active={modal,close};
}
window.abrirDocumentoCorreiosOficial=async function(tipo){
  if(busy)return;
  busy=true;
  try{
    if(typeof confirmarColetaAntesDocumentoCorreios==="function"&&!(await confirmarColetaAntesDocumentoCorreios()))return;
    const p=parametrosCorreiosOficiais();
    // O retorno do POST oficial ja fornece o ID. Nao bloquear a emissao
    // por uma busca de listagem que pode retornar 404/405 indevidamente.
    // O endpoint de emissao dos Correios valida o status real do ID.
    const idSalvo=String(valorCampoCorreios("corIdPrePostagem")||"").trim();
    let id=idSalvo;
    if(!id){
      const pre=await localizarPrePostagemCorreiosOficial(true);
      id=String(pre?.idPrePostagem||pre?.id||"").trim();
    }
    if(!id)throw Error("Informe ou localize primeiro o ID da pré-postagem.");
    if(!/^PR[A-Za-z0-9]{10,40}$/.test(id))throw Error("ID de pré-postagem inválido. Confira o vínculo da coleta.");
    statusCorreiosOficial("Consultando o documento oficial pelo ID da pré-postagem...",true);
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
    if(ct.includes("json")){
      const texto=new TextDecoder("utf-8").decode(bytes);
      let j={};try{j=JSON.parse(texto);}catch(e){}
      const detalhe=j?.resposta?.resposta?.mensagem||j?.resposta?.mensagem||j?.erro||j?.message||texto.slice(0,500);
      if(/PPN-288|status igual a Cancelado/i.test(detalhe)){
        throw Error("Esta pré-postagem está CANCELADA nos Correios. Não é permitido emitir o rótulo oficial. Localize ou crie uma pré-postagem válida e tente novamente. Detalhe: "+detalhe);
      }
      throw Error(detalhe||"A API retornou JSON em vez do documento.");
    }
    const header=new TextDecoder().decode(bytes.slice(0,20)).trimStart();
    const pdf=header.startsWith("%PDF");
    const html=ct.includes("html")||/^<!doctype html|^<html/i.test(header);
    if(!pdf&&!html)throw Error("Os Correios retornaram um formato inesperado ("+(ct||"sem tipo")+").");
    const blob=new Blob([bytes],{type:pdf?"application/pdf":"text/html;charset=utf-8"});
    const nome=rotulo?"Rotulo-oficial-Correios-100x150.pdf":dace?"DACE-Correios.pdf":pdf?"Declaracao-Correios.pdf":"Declaracao-Correios.html";
    preview(blob,nome,{rotulo,id});
    statusCorreiosOficial("✅ Documento oficial aberto para impressão dentro do sistema.",true);
  }catch(e){
    console.error("Correios documento oficial:",e);
    statusCorreiosOficial("⚠️ "+(e.message||e),false);
    alert("Não foi possível abrir o documento oficial dos Correios.\n\n"+(e.message||e));
  }finally{busy=false;}
};
})();