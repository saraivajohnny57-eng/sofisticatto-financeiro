const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('lib/integracoes/consultar-rastreio-ssw.js','utf8');
test('DANFE é consultado antes da exigência de integração',()=>{
 assert.ok(src.indexOf("chamar('https://ssw.inf.br/api/trackingdanfe'")<src.indexOf("SSW_INTEGRACAO_NAO_CONFIGURADA"));
});
test('fallback requer integração configurada',()=>assert.match(src,/if\(!integ\?\.convite_id.*SSW_INTEGRACAO_NAO_CONFIGURADA/s));
test('preserva entregas finalizadas',()=>assert.match(src,/const finalizado=.*entregue.*recebido.*cancelado/));
test('impede evento antigo sobrescrever novo',()=>assert.match(src,/t<=anterior/));
test('consulta inclui status e timestamp anterior',()=>assert.match(src,/select=id,numero_nfe,chave_nfe,status,ultima_ocorrencia_em/));
