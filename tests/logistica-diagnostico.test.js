const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const c=fs.readFileSync('coletas.js','utf8'),s=fs.readFileSync('lib/integracoes/consultar-rastreio-ssw.js','utf8');
test('botão disponível em todos registros',()=>assert.match(c,/function rastreioPodeAtualizarV440\(r\)\{[\s\S]*?return !!r\?\.id;/));
test('erro mostra etapa e código',()=>{assert.match(c,/Etapa: /);assert.match(c,/Código: /)});
test('diagnóstico não revela chave completa',()=>assert.match(s,/chaveNfeFinal:chave\.slice\(-8\)/));
test('SSW retorna diagnóstico de documento não encontrado',()=>assert.match(s,/documentoLocalizado:false/));
test('SSW mantém proteção de status finalizado',()=>assert.match(s,/const finalizado=/));
