/* GNRE: conferência de receitas de NF-e nova na cotação (somente leitura).
 * Nenhuma transmissão nem guia de pagamento é gerada nesta tela. */
(function(){
'use strict';
const R=[{codigo:'100102',nome:'DIFAL',campo:'difalXml'},{codigo:'100129',nome:'FCP',campo:'fcpXml'}];
function el(id){return document.getElementById(id)}
function msg(texto){const x=el('freteGnreNovaSituacao');if(x)x.textContent=texto}
function valor(x){return Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function chaveAdm(){
 return sessionStorage.getItem('integrations_admin_key')||localStorage.getItem('integrations_admin_key')||'';
}
async function verificarReceitasGnreNova(){
 const btn=el('freteGnreConsultarConfigUf'),x=el('freteGnreNovaDetalhes');
 if(!btn||!x)return;
 btn.disabled=true;x.replaceChildren();
 try{
  const nfe=typeof freteGnreNfeLida!=='undefined'?freteGnreNfeLida:null;
  if(!nfe)throw new Error('Importe primeiro o XML autorizado de uma NF-e NOVA.');
  if(nfe.divergencias?.length)throw new Error('A NF-e difere da cotação: '+nfe.divergencias.join('; '));
  if(!/^[A-Z]{2}$/.test(nfe.ufDestino))throw new Error('UF de destino inválida.');
  if(!Number.isFinite(nfe.difalXml)||!Number.isFinite(nfe.fcpXml)||nfe.difalXml<0||nfe.fcpXml<0)
   throw new Error('Valores fiscais DIFAL/FCP inválidos.');
  const key=chaveAdm();
  if(!key)throw new Error('Autorize as integrações com a senha mestre antes de consultar a ConfigUF.');
  msg('Consultando a configuração GNRE de '+nfe.ufDestino+'...');
  const estados=[];
  for(const item of R){
   const resp=await fetch('/api/integracoes?action=gnre-configuf-multi',{
    method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},
    body:JSON.stringify({uf:nfe.ufDestino,receita:item.codigo})
   });
   const dados=await resp.json().catch(()=>({ok:false,erro:'Resposta não JSON'}));
   if(!resp.ok||dados.ok!==true||dados.receita_confirmada!==true||dados.perfil?.ok!==true)
    estados.push({item,ok:false,erro:dados.erro||dados.diagnostico||'ConfigUF não confirmou a receita'});
   else estados.push({item,ok:true,perfil:dados.perfil});
  }
  for(const resultado of estados){
   const card=document.createElement('div');
   card.style.cssText='border:1px solid #d8c8e8;border-radius:9px;padding:10px;margin:8px 0';
   const valorTributo=nfe[resultado.item.campo];
   const cab=document.createElement('strong');
   cab.textContent=resultado.item.nome+' — '+resultado.item.codigo+' — '+valor(valorTributo);
   const detalhe=document.createElement('p');
   if(!resultado.ok)detalhe.textContent='NÃO CONFIRMADA: '+resultado.erro;
   else{
    const p=resultado.perfil;
    const docs=(p.documentos||[]).map(d=>d.codigo+' '+d.descricao).join(', ')||'não informados';
    detalhe.textContent='Documento de origem admitido: '+docs+' | Exigências: '+
     JSON.stringify(p.exigencias||{})+' | Pendências: '+(p.pendencias||[]).join('; ');
   }
   card.append(cab,detalhe);x.append(card);
  }
  const ambos=estados.every(z=>z.ok);
  const temDois=Number(nfe.difalXml)>0&&Number(nfe.fcpXml)>0;
  const total=valor(Number(nfe.difalXml)+Number(nfe.fcpXml));
  msg('NF-e '+nfe.numero+' | '+nfe.ufDestino+' | DIFAL + FCP declarados: '+total+
   '. '+(ambos?'Duas receitas encontradas na ConfigUF.':'Pendente confirmação de receita na ConfigUF.')+
   (temDois?' Ambos os tributos têm valor positivo.':' Há tributo zerado; não gerar duas guias automaticamente.')+
   ' A configuração não substitui validação fiscal, duplicidades e autorização de emissão. Nenhuma guia foi transmitida.');
 }catch(e){msg('Verificação não concluída: '+String(e.message||e)+' Nenhuma guia transmitida.')}
 finally{btn.disabled=false}
}
window.verificarReceitasGnreNova=verificarReceitasGnreNova;
})();
