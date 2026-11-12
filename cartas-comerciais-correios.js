/* Carta Comercial — usa os dados da aba Correios sem interferir em PAC/SEDEX. */
(function(){
'use strict';
const el=id=>document.getElementById(id),val=id=>String(el(id)?.value||'').trim();
const dig=x=>String(x||'').replace(/\D/g,'');
const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let servicos=[];
function aviso(msg,ok){const e=el('cartaStatus');if(e){e.textContent=msg;e.style.color=ok?'#186c42':'#9a361c';}}
function chave(){return (typeof chaveIntegracoesCotacao==='function'&&chaveIntegracoesCotacao())||sessionStorage.getItem('integrations_admin_key')||localStorage.getItem('integrations_admin_key')||'';}
async function request(modo,body){
 const key=chave();if(!key)throw Error('Configure a chave na Central de Integrações.');
 const r=await fetch('/api/integracoes?action=carta-comercial-correios&modo='+modo,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.erro||'Correios HTTP '+r.status);return j;
}
function destinatario(){return {nome:val('corCliente'),cpfCnpj:val('corDocumento'),endereco:{cep:val('corCep'),logradouro:val('corEndereco'),numero:val('corNumero'),complemento:val('corComplemento'),bairro:val('corBairro'),cidade:val('corCidade'),uf:val('corUf')}};}
function corpo(){return {cepDestino:val('corCep'),pesoGramas:Number(val('cartaPesoGramas')),codigoServico:val('cartaServico'),tipoConteudo:'DOCUMENTOS',destinatario:destinatario()};}
window.cartaDiagnosticar=async()=>{
 try{aviso('Consultando contrato...',true);const d=await request('diagnostico');servicos=d.servicos||[];
 const s=el('cartaServico');s.replaceChildren();const p=document.createElement('option');p.value='';p.textContent='Selecione o serviço';s.append(p);
 for(const item of servicos){const o=document.createElement('option');o.value=item.codigo;o.textContent=item.descricao+' ('+item.codigo+')';s.append(o);}
 el('cartaCotacoes').textContent='';aviso(d.observacao,servicos.length>0);
 }catch(e){aviso(e.message,false);}
};
window.cartaCotar=async()=>{
 try{aviso('Cotando carta em gramas...',true);const r=await request('cotar',corpo());const box=el('cartaCotacoes');box.replaceChildren();
 for(const x of r.resultados||[]){const p=document.createElement('p');p.textContent=x.descricao+': '+(x.ok?Number(x.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Indisponível — '+x.erro);box.appendChild(p);}
 aviso(r.validos?'Cotação concluída pelo contrato.':'Sem cotação válida: confira serviço autorizado e peso.',r.validos>0);
 }catch(e){aviso(e.message,false);}
};
window.cartaPreparar=async()=>{
 try{aviso('Validando carta registrada sem transmitir...',true);const r=await request('preparar',corpo());aviso(r.observacao,true);}
 catch(e){aviso(e.message,false);}
};
window.cartaEmitir=async()=>{
 try{
 const d=corpo(),s=servicos.find(x=>x.codigo===d.codigoServico);
 if(s?.categoria!=='registrada')throw Error('Carta Simples utiliza lote e não pode ser enviada pelo fluxo de Carta Registrada.');
 if(!confirm('Confirmar PRÉ-POSTAGEM REAL de Carta Registrada nos Correios? Poderá gerar cobrança no contrato.'))return;
 aviso('Enviando pré-postagem...',true);
 const r=await request('emitir',{...d,confirmarEmissaoReal:true});
 el('cartaId').value=r.idPrePostagem||'';
 if(el('corIdPrePostagem'))el('corIdPrePostagem').value=r.idPrePostagem||'';
 aviso('Carta registrada criada. ID: '+r.idPrePostagem,true);
 }catch(e){aviso(e.message,false);}
};
window.cartaRotulo=()=>{
 const id=val('cartaId');if(!/^PR[A-Za-z0-9]{10,40}$/.test(id))return aviso('Informe o ID oficial da pré-postagem.',false);
 if(el('corIdPrePostagem'))el('corIdPrePostagem').value=id;
 if(typeof abrirDocumentoCorreiosOficial==='function')abrirDocumentoCorreiosOficial('rotulo');
 else aviso('O visualizador oficial não está disponível.',false);
};
window.cartaImprimirEnderecamento=()=>{
 try{
 const d=destinatario(),e=d.endereco;if(!d.nome||dig(e.cep).length!==8||!e.logradouro||!e.cidade||!e.uf)throw Error('Preencha nome e endereço acima.');
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>@page{size:A4;margin:20mm}body{font:16px Arial}.box{border:1px dashed #aaa;max-width:155mm;padding:20px;min-height:70mm}small{color:#555}h2{font-size:20px}</style></head><body><div class="box"><small>DESTINATÁRIO — ENDEREÇAMENTO</small><h2>'+escape(d.nome)+'</h2><p>'+escape(e.logradouro)+', '+escape(e.numero||'S/N')+' '+escape(e.complemento)+'<br>'+escape(e.bairro)+'<br>'+escape(e.cidade)+' / '+escape(e.uf)+'<br><b>CEP '+escape(e.cep)+'</b></p></div><p><small>Impressão interna de endereço; NÃO é rótulo oficial, franquia nem comprovante de postagem.</small></p></body></html>';
 const f=document.createElement('iframe');f.style.cssText='position:absolute;left:-20000px;width:1px;height:1px;border:0';document.body.appendChild(f);
 f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print();}finally{setTimeout(()=>f.remove(),3000);}};f.srcdoc=html;
 aviso('Endereçamento pronto para imprimir. Não substitui a etiqueta oficial.',true);
 }catch(e){aviso(e.message,false);}
};
window.cartaBuscarCliente=()=>{
 const q=val('cartaBuscaCliente');if(q.length<2)return;
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const clientes=(typeof emailClientes!=='undefined'&&Array.isArray(emailClientes))?emailClientes:[];
 const selecionado=clientes.find(c=>norm(c.nome)===norm(q)||dig(q).length>=11&&dig(c.cpf_cnpj)===dig(q));
 if(selecionado){
  const m={corCliente:selecionado.nome,corDocumento:selecionado.cpf_cnpj,corEndereco:selecionado.endereco||selecionado.logradouro,corNumero:selecionado.numero,corComplemento:selecionado.complemento,corBairro:selecionado.bairro,corCidade:selecionado.cidade,corUf:selecionado.uf,corCep:selecionado.cep};
  for(const [id,v] of Object.entries(m))if(el(id)&&v)el(id).value=String(v);
  if(typeof atualizarCorreiosTudo==='function')atualizarCorreiosTudo();aviso('Cliente selecionado: '+selecionado.nome,true);
 }
 const dl=el('cartaClientesLista');dl.replaceChildren();
 for(const c of clientes.filter(c=>norm(c.nome).includes(norm(q))||(dig(q).length>=3&&dig(c.cpf_cnpj).includes(dig(q)))).slice(0,20)){
  const o=document.createElement('option');o.value=c.nome;o.label=(c.cpf_cnpj||'')+' — '+(c.cidade||'');dl.append(o);
 }
};
})();