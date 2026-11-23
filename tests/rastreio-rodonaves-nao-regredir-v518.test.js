'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','lib/integracoes/consultar-rastreio-rodonaves.js'),'utf8');
test('V518: finalizado não volta a filial nem usa data antiga',()=>{
 assert.match(source,/Entrega\/encerramento já confirmado/);
 assert.match(source,/proxima<anterior/);
 assert.match(source,/Number\.isFinite\(anterior\)/);
 assert.match(source,/finalizado_em=consulta\.ultimaOcorrenciaEm\|\|agora/);
});
