/* GNRE: conferência de receitas de NF-e nova na cotação (somente leitura).
 * Nenhuma transmissão nem guia de pagamento é gerada nesta tela. */
(function(){
'use strict';
const R=[{codigo:'100102',nome:'DIFAL',campo:'difalXml'},{codigo:'100129',nome:'FCP',campo:'fcpXml'}];
function el(id){return document.getElementById(id)}
function msg(texto){const x=el('freteGnreNovaSituacao');if(x)x.textContent=texto}
function valor(x){return Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function chaveAdm(){
 // O token gravado pode expirar ou pertencer a outro deploy/segredo.
 // Reutiliza a validacao administrativa com renovacao de dispositivo.
 if(typeof obterChaveIntegracoesCotacao!=='function')
  throw new Error('Autorizacao de integracoes indisponivel nesta versao.');
 const chave=await obterChaveIntegracoesCotacao();
 if(!chave)throw new Error('Autorizacao cancelada ou nao validada.');
 return chave;
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
  const key=await chaveAdm();
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
async function prepararDuasGuiasGnreNova(){
 const btn=el('freteGnrePrepararDuas'),check=el('freteGnreNovaConfirmada');
 if(!btn)return;
 btn.disabled=true;
 try{
  const nfe=typeof freteGnreNfeLida!=='undefined'?freteGnreNfeLida:null;
  if(!check?.checked)throw new Error('Confirme que esta NF-e corresponde a uma operacao nova, sem GNRE emitida.');
  if(!nfe?.nfeNova)throw new Error('Importe o XML autorizado da NF-e nova.');
  if(nfe.divergencias?.length)throw new Error('Corrija divergencias entre NF-e e cotacao antes do preflight.');
  const key=await chaveAdm();
  if(!key)throw new Error('Autorize o acesso administrativo as integracoes.');
  const vencimento=el('freteGnreVencimento')?.value||'';
  const pagamento=el('freteGnreDataPagamento')?.value||'';
  if(!vencimento||!pagamento)throw new Error('Informe vencimento legal e data prevista de pagamento.');
  if(nfe.nfeNova.statusAutorizacao!=='100'||nfe.nfeNova.chaveProtocolo!==nfe.chave)
   throw new Error('O XML nao comprova NF-e autorizada (cStat 100 e protocolo).');
  msg('Validando as duas receitas na ConfigUF e verificando duplicidades...');
  const resposta=await fetch('/api/integracoes?action=gnre-duas-guias-nova',{
   method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},
   body:JSON.stringify({novaOperacao:true,nfe:nfe.nfeNova,fiscal:{vencimento,pagamento}})
  });
  const dados=await resposta.json().catch(()=>({ok:false,erro:'Resposta do servidor invalida'}));
  if(!resposta.ok||dados.ok!==true)throw new Error(dados.erro||dados.diagnostico||'Falha no preflight');
  const detal=el('freteGnreNovaDetalhes');
  if(detal){
   const card=document.createElement('p');
   card.textContent='PREPARACAO EM HOMOLOGACAO: '+dados.tributos.map(t=>t.tributo+' '+t.receita+' R$ '+t.valor+' / documento '+t.tipo_documento).join(' | ')+
    ' | Soma para cotacao R$ '+dados.total_cotacao+
    '. Chave de verificacao do lote: '+dados.lote_sha256.slice(0,16)+'…';
   detal.appendChild(card);
  }
  msg('Preflight concluido: dois XMLs preparados no servidor. Nenhuma guia transmitida ou pagavel; aguardam validacao XSD, conciliacao fiscal e retorno oficial.');
 }catch(e){msg('Nao foi possivel preparar as duas guias: '+String(e.message||e)+' Nenhuma guia transmitida.')}
 finally{btn.disabled=false}
}
window.prepararDuasGuiasGnreNova=prepararDuasGuiasGnreNova;

})();
