/* V372: leitura local e conferência de retorno Bradesco CNAB 400. Sem alterações financeiras automáticas. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const slice=(s,a,b)=>s.slice(a-1,b).trim();
const money=s=>{const n=Number(s);return /^\d+$/.test(s)?(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'};
const codes={'02':'Entrada confirmada','06':'Liquidação','10':'Baixa confirmada'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parse(raw){const lines=raw.replace(/\x1a/g,'').split(/\r\n|\n|\r/).filter(Boolean),issues=[],items=[];
if(!lines.length)throw Error('Arquivo vazio.');
lines.forEach((line,i)=>{if(line.length!==400)issues.push(`Linha ${i+1}: ${line.length} posições, esperado 400.`)});
if(issues.length)throw Error(issues.slice(0,5).join(' '));
if(lines[0][0]!=='0'||lines[0][1]!=='2'||slice(lines[0],3,9).toUpperCase()!=='RETORNO'||slice(lines[0],77,79)!=='237')throw Error('Cabeçalho não corresponde ao retorno Bradesco CNAB 400.');
if(lines.at(-1)[0]!=='9')throw Error('Trailer tipo 9 ausente.');
lines.forEach((line,i)=>{if(!/^\d{6}$/.test(slice(line,395,400))||Number(slice(line,395,400))!==i+1)issues.push(`Sequência divergente na linha ${i+1}.`);
if(line[0]==='1')items.push({controle:slice(line,38,62),nossoNumero:slice(line,71,82),carteira:slice(line,108,108),ocorrencia:slice(line,109,110),dataOcorrencia:slice(line,111,116),documento:slice(line,117,126),vencimento:slice(line,147,152),valor:money(slice(line,153,165)),valorCentavos:slice(line,153,165),descricao:codes[slice(line,109,110)]||'Consultar tabela de ocorrências do manual'});
else if(!['0','9','3','4'].includes(line[0]))issues.push(`Tipo de registro inesperado na linha ${i+1}.`)});
return {linhas:lines.length,items,issues,empresa:slice(lines[0],47,76),data:slice(lines[0],95,100)};
}
window.remessaV372LerRetorno=async()=>{const f=$('remV372Arquivo')?.files?.[0],out=$('remV372Resultado');if(!out)return;
if(!f){out.textContent='Selecione um arquivo .RET primeiro.';return}
try{if(f.size>5e6)throw Error('Arquivo maior que o limite de 5 MB.');const bytes=new Uint8Array(await f.arrayBuffer());let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=parse(str);out.innerHTML=`<strong>${esc(f.name)}</strong> — ${r.linhas} registros, ${r.items.length} transações, ${r.issues.length} alerta(s).<p>Empresa: ${esc(r.empresa)} | Data do arquivo: ${esc(r.data)}</p>`+(r.issues.length?`<p>${r.issues.map(esc).join('; ')}</p>`:'')+`<div style="overflow:auto;max-height:350px"><table style="width:100%;font-size:12px"><thead><tr><th>Documento</th><th>Nosso Número</th><th>Ocorrência</th><th>Valor do título</th></tr></thead><tbody>${r.items.map(x=>`<tr><td>${esc(x.documento)}</td><td>${esc(x.nossoNumero)}</td><td>${esc(x.ocorrencia)} — ${esc(x.descricao)}</td><td>${esc(x.valor)}</td></tr>`).join('')}</tbody></table></div><p><strong>Somente leitura:</strong> nenhum status ou valor foi alterado no Supabase.</p>`;
}catch(e){out.textContent='Não foi possível analisar: '+e.message}}
})();
