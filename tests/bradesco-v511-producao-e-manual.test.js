'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'api/banco-bradesco.js'),'utf8');
test('V511: carteira bancária vem de cadastro protegido e não é exposta',()=>{
 assert.match(src,/configBanco\?\.carteira\|\|configBanco\?\.produto/);
 assert.match(src,/descriptografar\(cfg\)/);
 assert.match(src,/CÓDIGO DO PRODUTO LOCALIZADO NO CONTRATO \(VALOR OCULTO\)/);
 assert.match(src,/produtoValido\?'PRESERVAR':'PENDENTE'/);
});
test('V511: indicador aviso do sacado segue layout como proposta sem transmitir',()=>{
 assert.match(src,/dadosTitulo\.indicadorAvisoSacado','PROPOSTO'/);
 assert.match(src,/não homologada por PUT/);
});
test('V511: seis pendências anteriores continuam bloqueadas quando config incompleta',()=>{
 for(const k of ['dadosTitulo.abatimento.tipoAbatimento','dadosTitulo.comissaoPermanencia.valorComissaoPermanencia','dadosTitulo.valorMulta','dadosTitulo.codigoNegativacao'])
  assert.match(src,new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(src,/transmissao_put_realizada:false/);
 assert.match(src,/alteracoes_put:0/);
});