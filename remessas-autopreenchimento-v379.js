/* V379 - parâmetros da remessa via backend criptografado e sequência local. Sem transmissão. */
(()=>{'use strict';
const $=id=>document.getElementById(id),dig=v=>String(v||'').replace(/\D/g,'');
const info=s=>{const el=$('remV379AutoStatus');if(el)el.textContent=s};
const key=(company,account)=>'sofisticatto_cnab400_ultimo_sequencial_v379_'+dig(company)+'_'+dig(account);
const call=async(action,body)=>{
  if(typeof bbAdminKey!=='function'||!bbAdminKey())throw Error('Valide a chave administrativa em Credenciais e diagnóstico.');
  const r=await fetch('/api/banco-bradesco?action='+encodeURIComponent(action)+'&ambiente=producao',{
    method:body?'POST':'GET',headers:{'x-integrations-admin-key':bbAdminKey(),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify({...body,ambiente:'producao'}):undefined,cache:'no-store'});
  const j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw Error(j.erro||'HTTP '+r.status);return j;
};
const suggest=()=>{
  const account=dig($('remV378Conta')?.value),company=dig($('remV378Empresa')?.value),field=$('remV378Sequencia');
  if(!field||!account||!company)return;
  let last='';try{last=localStorage.getItem(key(company,account))||''}catch{}
  if(/^\d+$/.test(last)&&Number(last)>0&&Number(last)<9999999){field.value=String(Number(last)+1);info('Próximo sequencial sugerido: '+field.value+'. Numeração local, não confirmada pelo banco.');}
  else info('Conta carregada. Informe e confirme o PRIMEIRO sequencial da remessa; os seguintes serão sugeridos automaticamente neste navegador.');
};
window.remV379CarregarParametros=async()=>{
  try{
    info('Consultando configuração bancária de produção...');
    const d=await call('obter-parametros-remessa-v379');
    if(d.carteira&&dig(d.carteira).padStart(2,'0')!=='09')throw Error('Carteira configurada não é 09. Confira o contrato.');
    if(!/^\d{1,4}$/.test(d.agencia)||!/^\d{1,7}$/.test(d.conta))throw Error('Agência/conta não cadastradas corretamente no backend.');
    $('remV378Agencia').value=dig(d.agencia).padStart(4,'0');
    $('remV378Conta').value=dig(d.conta);
    $('remV378DV').value=d.dv_conta||'';
    suggest();
    if(!d.dv_conta)info('Agência e conta preenchidas. DV ainda não está cadastrado: confirme-o uma vez e clique em Salvar DV. '+$('remV379AutoStatus').textContent);
  }catch(e){info('Não foi possível preencher: '+e.message)}
};
window.remV379SalvarDV=async()=>{
  try{
    const dv=String($('remV378DV')?.value||'').trim().toUpperCase();
    if(!/^[0-9P]$/.test(dv))throw Error('Informe o DV correto da conta (0–9 ou P).');
    if(!confirm('Confirmar o DV '+dv+' da conta bancária Bradesco? Será salvo criptografado para preencher automaticamente nas próximas remessas.'))return;
    const j=await call('salvar-dv-remessa-v379',{dv_conta:dv});info(j.mensagem||'DV salvo.');
  }catch(e){info('Não foi possível salvar o DV: '+e.message)}
};
window.remV379RegistrarSequencia=(sequence,company,account)=>{
  const n=Number(sequence),k=key(company,account);if(!Number.isSafeInteger(n)||n<1||n>9999999)throw Error('Sequencial inválido.');
  let last=0;try{last=Number(localStorage.getItem(k)||0)}catch{}
  if(last&&n<=last)throw Error('Sequencial já utilizado neste navegador ('+last+'). Use um número maior e confirme no banco.');
  try{localStorage.setItem(k,String(n))}catch{throw Error('Não foi possível salvar o sequencial neste navegador. Geração bloqueada para evitar repetição.');}
};
// Não consulta o backend automaticamente sem a chave administrativa; clique explícito evita tráfego desnecessário.
})();
