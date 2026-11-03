'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../api/banco-bradesco.js'),'utf8');
const begin=source.indexOf("if(action==='emitir-cobranca-producao-v248')");
const end=source.indexOf("const d=retorno.data||{}",begin);
const flow=source.slice(begin,end);
test('token mTLS é obtido antes de registrar INICIADA',()=>{
  assert.ok(begin>=0&&end>begin);
  const token=flow.indexOf('auth=await solicitarTokenMtls(');
  const lock=flow.indexOf("await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:'INICIADA'");
  const post=flow.indexOf('retorno=await enviarRegistroCobrancaProducao(');
  assert.ok(token>=0&&lock>token&&post>lock);
});
test('falha OAuth não registra trava e informa que não houve POST',()=>{
  const token=flow.indexOf('auth=await solicitarTokenMtls(');
  const lock=flow.indexOf("await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:'INICIADA'");
  const between=flow.slice(token,lock);
  assert.match(between,/BRADESCO_AUTH_SEM_POST/);
  assert.match(between,/post_cobranca_executado=false/);
  assert.doesNotMatch(between,/await salvar\(travaId/);
});
test('falha após POST permanece bloqueada e tentativa anterior incerta não é reenviada',()=>{
  assert.match(flow,/tentativaAnterior\.estado==='RESPOSTA_RECEBIDA' && statusAnterior===400/);
  assert.match(flow,/estado:'ERRO_TRANSPORTE_SEM_RETRY'/);
  assert.match(flow,/Resultado incerto após iniciar envio da cobrança/);
});
