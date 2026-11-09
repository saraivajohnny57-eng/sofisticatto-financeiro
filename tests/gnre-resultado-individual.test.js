'use strict';
// Respostas GNRE de teste: sem chamada externa, sem dados de contribuintes reais.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {interpretarRetorno}=require('../lib/integracoes/gnre-interpretar-resultado');
const recibo='1234567890';
function resposta({codigo='402',resultado='',ambiente='2',reciboOut=recibo}={}){
 return '<soap12:Envelope><soap12:Body><ns:TResultLote_GNRE xmlns:ns="http://www.gnre.pe.gov.br">'
  +'<ns:ambiente>'+ambiente+'</ns:ambiente>'
  +'<ns:numeroRecibo>'+reciboOut+'</ns:numeroRecibo>'
  +'<ns:situacaoProcess><ns:codigo>'+codigo+'</ns:codigo>'
  +'<ns:descricao>Lote Processado com sucesso</ns:descricao></ns:situacaoProcess>'
  +resultado
  +'</ns:TResultLote_GNRE></soap12:Body></soap12:Envelope>';
}
test('lote 402 com resultado ausente nao e guia autorizada',()=>{
 const r=interpretarRetorno(resposta(),recibo);
 assert.equal(r.ok,true);
 assert.equal(r.codigo,'402');
 assert.equal(r.guias.length,0);
 assert.equal(r.guia_confirmada,false);
 assert.equal(r.estado,'lote_processado_sem_guias_identificadas');
 assert.equal(r.diagnostico.formato_resultado,'ausente');
 assert.match(r.aviso,/NAO retransmitir/);
});
test('lote 402 com texto de layout legado e reconhecido sem afirmar guia',()=>{
 const txt='0'.repeat(30)+'ABCD'.repeat(300);
 const r=interpretarRetorno(resposta({resultado:'<ns:resultado>'+txt+'</ns:resultado>'}),recibo);
 assert.equal(r.guias.length,0);
 assert.equal(r.diagnostico.formato_resultado,'texto_ou_formato_legado');
 assert.equal(r.diagnostico.resultado_bytes,txt.length);
 assert.equal(r.guia_confirmada,false);
});
test('lote 402 com XML escapado avisa para diagnostico sem liberar guia',()=>{
 const r=interpretarRetorno(resposta({resultado:'<ns:resultado>&lt;guia&gt;...&lt;/guia&gt;</ns:resultado>'}),recibo);
 assert.equal(r.diagnostico.formato_resultado,'xml_escapado');
 assert.equal(r.guia_confirmada,false);
});
test('retorno XML 2.00 com guia situacao 0 mostra dados individuais mas nao arquiva',()=>{
 const guia='<ns:resultado><ns:guia><ns:situacaoGuia>0</ns:situacaoGuia>'
   +'<ns:TDadosGNRE versao="2.00"><ns:ufFavorecida>MG</ns:ufFavorecida>'
   +'<ns:itensGNRE><ns:item><ns:receita>100102</ns:receita>'
   +'<ns:valor tipo="11">19.01</ns:valor></ns:item></ns:itensGNRE>'
   +'</ns:TDadosGNRE></ns:guia></ns:resultado>';
 const r=interpretarRetorno(resposta({resultado:guia}),recibo);
 assert.equal(r.ok,true);
 assert.equal(r.diagnostico.formato_resultado,'xml_guias');
 assert.equal(r.guias.length,1);
 assert.equal(r.guias[0].situacao,'0');
 assert.equal(r.guias[0].receita,'100102');
 assert.equal(r.guias[0].uf,'MG');
 assert.equal(r.guias[0].valor,'19.01');
 assert.equal(r.guia_confirmada,true);
 assert.equal(Object.hasOwn(r,'recibo'),false);
});
test('retorno com guia rejeitada nunca confirma guia individual',()=>{
 const guia='<resultado><guia><situacaoGuia>2</situacaoGuia><motivosRejeicao>'
  +'<motivo><codigo>999</codigo><descricao>Exemplo sintético</descricao><campo>receita</campo></motivo>'
  +'</motivosRejeicao></guia></resultado>';
 const r=interpretarRetorno(resposta({resultado:guia}),recibo);
 assert.equal(r.guia_confirmada,false);
 assert.equal(r.guias[0].rejeicoes[0].codigo,'999');
 assert.equal(r.estado,'guias_com_situacoes_a_conferir');
});
test('lote em processamento (401) e recibo divergente nao autorizam guia',()=>{
 const pending=interpretarRetorno(resposta({codigo:'401'}),recibo);
 assert.equal(pending.estado,'lote_aguardando_processamento');
 assert.equal(pending.guia_confirmada,false);
 const errado=interpretarRetorno(resposta({reciboOut:'1234567891'}),recibo);
 assert.equal(errado.ok,false);
 assert.equal(errado.estado,'recibo_divergente');
 const fora=interpretarRetorno(resposta({ambiente:'1'}),recibo);
 assert.equal(fora.ok,false);
});
test('a consulta e leitura: nao arquiva guia e retorna diagnostico sem XML',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-consulta-lote.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(api,/arquivarGuiaOficial|pdf_base64:g\.pdf_base64/);
 assert.match(api,/diagnostico:fiscal.diagnostico/);
 assert.match(api,/piloto_mg_51109===true/);
 assert.match(ui,/Formato do resultado GNRE/);
 assert.match(page,/Transmissão 51109 encerrada/);
});
