/* Correcoes pontuais da aba Etiquetas: documento e endereco (v1). */
(function(){
"use strict";
const digits=v=>String(v||"").replace(/\D/g,"");
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
let documentoXml="";
function buscarCliente(nome,documento){
  const lista=typeof emailClientes!=="undefined"&&Array.isArray(emailClientes)?emailClientes:[];
  const doc=digits(documento);
  if(doc.length===11||doc.length===14){
    const encontrado=lista.find(c=>digits(c.cpf_cnpj||c.cnpj||c.cpf)===doc);
    if(encontrado)return encontrado;
  }
  const termo=norm(nome);
  if(!termo)return null;
  const dTermo=digits(nome);
  if((dTermo.length===11||dTermo.length===14)&&dTermo===String(nome).replace(/\D/g,"")){
    return lista.find(c=>digits(c.cpf_cnpj||c.cnpj||c.cpf)===dTermo)||null;
  }
  return lista.find(c=>norm(c.nome)===termo)||null;
}
function limparEndereco(logradouro,numero,complemento){
  let rua=String(logradouro||"").trim().replace(/\s+/g," ");
  const num=String(numero||"").trim();
  const match=rua.match(/(?:[, ]+\s*(?:N[º°.]?|NRO|NUMERO|NÚMERO|NR)\.?\s*[:\-]?\s*|,\s*|,\s*N[º°]?\s*)(\d+[A-Z]?)\s*$/i);
  const jaTem=match?match[1]:"";
  if(num&&(!jaTem||jaTem.toUpperCase()!==num.toUpperCase())){
    // Um numero diferente ja escrito no endereco nao deve ser substituido automaticamente.
    if(!jaTem)rua+=", Nr. "+num;
  }
  return [rua,String(complemento||"").trim()].filter(Boolean).join(" - ");
}
function preencherEndereco(d){
  const campo=document.getElementById("etqEndereco");
  if(campo)campo.value=limparEndereco(d.endereco,d.numero,d.complemento);
  const valores={etqBairro:d.bairro||"",etqCep:typeof formatarCepEtiqueta==="function"?formatarCepEtiqueta(d.cep||""):d.cep||"",etqCidade:d.cidade||"",etqUf:d.uf||""};
  for(const [id,valor] of Object.entries(valores)){const el=document.getElementById(id);if(el)el.value=valor;}
}
window.clienteEtiquetaJaCadastrado=function(nome){return buscarCliente(nome,documentoXml);};
window.verificarCadastroClienteEtiqueta=function(){
  const nome=document.getElementById("etqCliente")?.value.trim()||"";
  if(!nome)return;
  const cliente=buscarCliente(nome,documentoXml);
  if(cliente){
    document.getElementById("etqCliente").value=cliente.nome||nome;
    if(typeof atualizarPreviewEtiqueta==="function")atualizarPreviewEtiqueta();
    if(typeof mostrarAvisoEmail==="function")mostrarAvisoEmail("Cliente já cadastrado: "+cliente.nome,true);
    return;
  }
  if(typeof abrirModalClienteEtiqueta==="function")abrirModalClienteEtiqueta(nome);
};
window.mostrarSugestoesEtiqueta=function(){
  const input=document.getElementById("etqCliente"),lista=document.getElementById("etqSugestoesClientes");
  if(!input||!lista)return;
  const termo=norm(input.value),doc=digits(input.value);
  const encontrados=(typeof emailClientes!=="undefined"?emailClientes:[]).filter(c=>!termo||norm(c.nome).includes(termo)||(doc.length>=3&&digits(c.cpf_cnpj||c.cnpj||c.cpf).includes(doc))).slice(0,15);
  if(!encontrados.length){lista.innerHTML="";lista.classList.remove("ativa");return;}
  lista.innerHTML=encontrados.map(c=>'<div class="etiqueta-sugestao" onmousedown="selecionarClienteEtiqueta('+JSON.stringify(String(c.id)).replace(/"/g,"&quot;")+')"><b>'+escaparHtmlEmail(c.nome||"")+'</b><small>'+escaparHtmlEmail(c.cpf_cnpj||"")+' — '+escaparHtmlEmail([c.cidade,c.uf].filter(Boolean).join("/")||"")+'</small></div>').join("");
  lista.classList.add("ativa");
};
window.preencherEnderecoEtiquetaComCadastro=preencherEndereco;
window.preencherEnderecoEtiquetaComXml=preencherEndereco;
window.selecionarClienteEtiqueta=function(id){
  const c=(typeof emailClientes!=="undefined"?emailClientes:[]).find(x=>String(x.id)===String(id));
  if(!c)return;
  const nome=document.getElementById("etqCliente");if(nome)nome.value=c.nome||"";
  preencherEndereco(c);
  const transp=document.getElementById("etqTransportadora");if(transp)transp.value=c.transportadora_preferencial||"";
  document.getElementById("etqSugestoesClientes")?.classList.remove("ativa");
  if(typeof atualizarPreviewEtiqueta==="function")atualizarPreviewEtiqueta();
};
const originalXml=window.lerXmlEtiqueta;
if(typeof originalXml==="function"){
  window.lerXmlEtiqueta=async function(evento){
    const file=evento?.target?.files?.[0];
    documentoXml="";
    if(file){
      try{
        const xml=new DOMParser().parseFromString(await file.text(),"application/xml");
        documentoXml=digits(xml.querySelector("dest > CNPJ, dest > CPF")?.textContent||"");
      }catch(e){console.warn("Documento XML não identificado",e);}
    }
    return originalXml.call(this,evento);
  };
}
})();