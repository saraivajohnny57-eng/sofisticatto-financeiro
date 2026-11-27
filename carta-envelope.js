(function(){
'use strict';
const el=id=>document.getElementById(id),val=id=>String(el(id)?.value||'').trim();
const box=el('cartaEnvelopeRoot');if(!box)return;
box.innerHTML='<div class="card" style="margin:16px 0;border:1px solid #d7c9ed;padding:18px"><h2>📮 Carta Registrada — Correios</h2><p>Documentos em papel · 80799 · Dados do destinatário preenchidos no editor de envelope acima.</p><p><b>Homologação:</b> exporte o arquivo para o PPN e vincule a pré-postagem oficial. Não cria postagem pela API.</p><div style="display:flex;flex-wrap:wrap;gap:12px"><label>Peso (gramas)<input id="cartaEnvPeso" type="number" min="1" max="500" value="20"></label><label>Data prevista de postagem<input id="cartaEnvData" type="date"></label></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button type="button" class="btn verde" id="cartaEnvExportar">Gerar arquivo oficial de pré-postagem</button><a href="https://prepostagem.correios.com.br/" target="_blank" rel="noopener noreferrer">Abrir PPN dos Correios</a><button type="button" class="btn roxo" id="cartaEnvPdf">Importar / imprimir PDF oficial</button></div><h3>Vincular carta ao rastreio</h3><p>Após emissão no PPN, informe o ID ou código oficial. O portal verifica e cadastra sem duplicar. Não marca coleta antes da ocorrência dos Correios.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><label>ID da pré-postagem<input id="cartaEnvId"></label><label>Código de rastreio<input id="cartaEnvCodigo" maxlength="13"></label></div><button type="button" class="btn azul" id="cartaEnvSincronizar" style="margin-top:10px">Confirmar e incluir no rastreio</button><p id="cartaStatus" role="status" aria-live="polite"></p></div>';
const dt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const partes=Object.fromEntries(dt.map(x=>[x.type,x.value]));el('cartaEnvData').value=partes.year+'-'+partes.month+'-'+partes.day;
const msg=(v,ok)=>{el('cartaStatus').textContent=v;el('cartaStatus').style.color=ok?'#17603b':'#a83325';};
async function req(modo,p){
 if(typeof obterChaveIntegracoesCotacao!=='function')throw Error('Autorização indisponível.');
 const key=await obterChaveIntegracoesCotacao();if(!key)throw Error('Autorização cancelada.');
 const r=await fetch('/api/integracoes?action=carta-envelope&modo='+modo,{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},body:JSON.stringify(p)});
 const j=await r.json();if(!r.ok||!j.ok)throw Error(j.erro||'Falha HTTP '+r.status);return j;
}
async function executar(botao,fn){if(botao.disabled)return;botao.disabled=true;try{await fn()}catch(e){msg(e.message,false)}finally{botao.disabled=false}}
el('cartaEnvExportar').onclick=()=>executar(el('cartaEnvExportar'),async()=>{
 const p={codigoServico:'80799',tipoConteudo:'DOCUMENTOS',cepDestino:val('envCep'),pesoGramas:Number(val('cartaEnvPeso')),dataPrevistaPostagem:val('cartaEnvData'),destinatario:{nome:val('envNome'),cpfCnpj:val('envDoc'),endereco:{cep:val('envCep'),logradouro:val('envRua'),numero:val('envNumero'),complemento:val('envCompl'),bairro:val('envBairro'),cidade:val('envCidade'),uf:val('envUf')}}};
 msg('Preparando arquivo oficial, sem transmitir...',true);
 const j=await req('arquivo',p);if(!Array.isArray(j.arquivo)||j.arquivo.length!==1)throw Error('Arquivo não confirmado.');
 const url=URL.createObjectURL(new Blob([JSON.stringify(j.arquivo,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='CARTA_REGISTRADA_80799.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 msg('Arquivo pronto. Importe na área de objetos registrados do PPN; depois vincule o ID ou código.',true);
});
el('cartaEnvSincronizar').onclick=()=>executar(el('cartaEnvSincronizar'),async()=>{
 msg('Consultando a pré-postagem oficial...',true);
 const j=await req('sincronizar',{idPrePostagem:val('cartaEnvId'),codigoObjeto:val('cartaEnvCodigo')});
 el('cartaEnvId').value=j.idPrePostagem;el('cartaEnvCodigo').value=j.codigoObjeto;
 msg('Rastreio '+j.codigoObjeto+(j.existente?' já cadastrado.':' cadastrado em Saídas.')+' Atualize os rastreios para receber os eventos oficiais.',true);
});
el('cartaEnvPdf').onclick=()=>window.cartaImportarRotuloPDF();
})();