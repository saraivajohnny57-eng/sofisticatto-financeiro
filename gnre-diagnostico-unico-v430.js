/* GNRE V430 — diagnóstico consolidado SOMENTE LEITURA.
   Nunca transmite lotes, não reemite nem oferece guias de homologação para pagamento. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let ocupado=false;
async function pedirChave(){
 if(typeof obterChaveIntegracoesCotacao!=='function')
  throw Error('A autenticação administrativa da GNRE não está disponível nesta versão.');
 const chave=await obterChaveIntegracoesCotacao();
 if(!chave)throw Error('Autorização administrativa não concluída.');
 return chave;
}
async function requisitar(action,key,method='POST',body={}){
 const r=await fetch('/api/integracoes?action='+encodeURIComponent(action),{
  method,headers:{'x-integrations-admin-key':key,...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify(body)}:{})
 });
 let data;
 try{data=await r.json()}catch(_){throw Error(action+': resposta não JSON, HTTP '+r.status);}
 return {http:r.status,...data};
}
function addStep(container,label,status,detail){
 const row=document.createElement('div');
 row.style.cssText='padding:9px 10px;border:1px solid #ddd5eb;border-radius:9px;margin:7px 0';
 const title=document.createElement('strong');
 title.textContent=(status===true?'✓ ':status===false?'⚠ ':'• ')+label;
 title.style.color=status===true?'#17713e':status===false?'#9b263a':'#5445a4';
 const p=document.createElement('div');p.textContent=String(detail||'');
 p.style.cssText='font-size:13px;margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere';
 row.append(title,p);container.appendChild(row);
}
function init(){
 const alvo=$('gnrePilotoResultado');
 if(!alvo||$('gnreDiagnosticoUnicoV430'))return;
 const panel=document.createElement('div');panel.id='gnreDiagnosticoUnicoV430';
 panel.style.cssText='border:1px solid #d6c9ee;border-radius:12px;padding:14px;margin:14px 0;background:#fbfaff';
 const heading=document.createElement('strong');
 heading.textContent='GNRE — Diagnóstico consolidado de homologação (sem emissão)';
 const desc=document.createElement('p');
 desc.style.cssText='font-size:13px;margin:6px 0';
 desc.textContent='Em uma única execução: certificado/TLS, consulta do lote 51109 já recebido e conferência do arquivo de guias. Não transmite uma nova GNRE.';
 const btn=document.createElement('button');btn.type='button';btn.className='buscar';
 btn.textContent='🔎 Verificar conexão + lote + documentos (sem emitir)';
 const result=document.createElement('div');result.id='gnreDiagnosticoUnicoV430Resultado';
 result.setAttribute('role','status');result.style.marginTop='10px';
 panel.append(heading,desc,btn,result);alvo.insertAdjacentElement('afterend',panel);
 btn.onclick=async()=>{
  if(ocupado)return;
  ocupado=true;btn.disabled=true;result.replaceChildren();
  try{
   const key=await pedirChave();
   addStep(result,'Autorização','ok'==='ok','Acesso administrativo solicitado; credenciais não exibidas.');
   // Diagnóstico técnico é um POST de SOMENTE LEITURA (WSDL).
   const diag=await requisitar('gnre-diagnostico',key);
   const connected=diag.ok===true&&diag.http_status===200;
   addStep(result,'Conexão A1 / DNS / TLS / WSDL',connected,
     connected?'WSDL oficial respondeu HTTP 200 ('+(diag.tempo_ms??'-')+' ms).':
     (diag.erro||'Etapa: '+(diag.etapa||'-')+'; HTTP '+diag.http));
   if(!connected){
     addStep(result,'Consulta do lote',null,'Não realizada porque o diagnóstico de conexão falhou. Nenhuma nova GNRE transmitida.');
     return;
   }
   // Este método recebe o recibo cifrado previamente armazenado e NÃO faz recepção.
   const lote=await requisitar('gnre-consulta-lote',key,'POST',{piloto_mg_51109:true});
   const guia=lote.guia_confirmada===true&&lote.conciliacao?.confirmado===true;
   addStep(result,'Resultado do lote antigo — NF-e 51109',lote.consulta_realizada===true,
     'Estado: '+String(lote.estado||'não confirmado')+
     ' | código: '+String(lote.codigo??'-')+
     ' | guias retornadas: '+(Array.isArray(lote.guias)?lote.guias.length:0)+
     ' | situação: '+String(lote.aviso||lote.erro||'sem descrição')+
     (lote.diagnostico?' | diagnóstico: '+String(lote.diagnostico):''));
   if(lote.consulta_realizada!==true){
     addStep(result,'Recibo e idempotência',false,
       'O recibo do lote antigo não foi recuperado ou a API não confirmou o retorno. Não reenviar. Verifique GNRE_PILOTO_51109_LOTE_SHA256 na Preview.');
     return;
   }
   addStep(result,'Conciliação fiscal da guia',guia,
     guia?'Referência individual reconciliada com a NF-e arquivada. Homologação não é documento pagável.':
     'Ainda não há comprovação suficiente de guia individual autorizada. '+(lote.conciliacao?.pendencias||[]).join('; '));
   const archive=await requisitar('gnre-arquivo-guias',key,'GET');
   const registros=Array.isArray(archive.guias)?archive.guias:[];
   const subset=registros.filter(x=>String(x.numero_nfe)==='51109'&&x.ambiente==='homologacao');
   const ready=subset.some(x=>x.situacao==='emitida'&&x.numero_guia&&x.linha_digitavel);
   addStep(result,'Documento oficial arquivado',ready,
     'Registros de homologação da NF-e 51109: '+subset.length+
     '. Guia com número e linha digitável: '+(ready?'SIM (apenas homologação)':'NÃO')+
     '. Nenhum documento de homologação deve ser usado para pagamento.');
   addStep(result,'Próxima ação',null,
     ready?'Conferir documento recuperado; para emissão pagável é necessária nova operação validada em PRODUÇÃO.':
     'Usar o retorno do lote para corrigir a validação de dados individuais e recuperação do documento; não retransmitir a NF-e 51109.');
  }catch(e){
   addStep(result,'Diagnóstico interrompido',false,String(e.message||e)+' Nenhuma GNRE foi transmitida.');
  }finally{ocupado=false;btn.disabled=false;}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();