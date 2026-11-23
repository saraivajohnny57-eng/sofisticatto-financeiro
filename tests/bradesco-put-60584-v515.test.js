'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),api=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8'),front=fs.readFileSync(path.join(root,'bradesco-piloto-v438.js'),'utf8');
const scope=api.slice(api.indexOf("function prepararAlteracaoBradesco60584V515"),api.indexOf("// V514 — Exporta"));
test('V515 confirma identificação da parcela 02 e não da 04',()=>{assert.match(scope,/60584-02/);assert.match(scope,/62860000010/);assert.match(scope,/605\.85/);assert.match(scope,/2026-11-08/);assert.match(scope,/13(?:102026|102026)/);});
test('V515 permite juros/multa zerados existentes com proteção',()=>{assert.match(scope,/originalCodJuros===0&&originalValPerm===0/);assert.match(scope,/originalCodMulta===0&&originalValMulta===0/);assert.match(scope,/retorno_encargos_completo/);});
test('V515 reserva antes de transmitir, e confere identidade do histórico',()=>{assert.ok(scope.indexOf("method:'POST',body:reserva")<scope.indexOf("method:'PUT',body:plan.payload"));assert.match(scope,/bradesco_put_controlado_v515/);assert.match(scope,/BRADESCO-60584-02/);assert.match(scope,/8c1da3be-70b4-4d06-a811-b35a3de4bdb4/);});
test('V515 desativa envio real no 55937 e preserva exportação',()=>{assert.match(api,/ALVO_ANTERIOR_DESATIVADO/);assert.match(front,/confirmar-put-60584-v515/);assert.match(front,/exportar-evidencia-put-60584-v515/);});
