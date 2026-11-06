'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarPreAlteracao}=require('../../lib/bradesco-validar-alteracao-encargos');
const original={cpfCnpj:{cpfCnpj:5451985,filial:1,controle:95},produto:9,negociacao:12345678901,nossoNumero:62710000024,dadosPagador:{cpfCnpjSacado:{cpfCnpj:123456789,filial:0,controle:0}},dadosTitulo:{seuNumero:'55994-01',dataEmissao:10102026,valorTitulo:441.91,vencimento:{dataVencimento:18102026,tipoVencimento:0}}};
const copia=x=>JSON.parse(JSON.stringify(x));
function entrada(){const proposto=copia(original);Object.assign(proposto.dadosTitulo,{comissaoPermanencia:{codigoComissaoPermanencia:2,valorComissaoPermanencia:5,diasComissaoPermanencia:1},codigoMulta:2,valorMulta:2,diasMulta:1});return {original:copia(original),proposto,consulta:{http_status:200,codStatus:1,pago:false,baixado:false,descontado:false},confirmacaoEscala:'CONTRATO_PUT_VALIDADO'}}
test('sem confirmação da escala do PUT rejeita',()=>{const x=entrada();delete x.confirmacaoEscala;assert.equal(validarPreAlteracao(x).apto,false)});
test('payload aninhado consistente passa apenas na validação local',()=>assert.equal(validarPreAlteracao(entrada()).apto,true));
test('rejeita alteração de nominal ou vencimento',()=>{const x=entrada();x.proposto.dadosTitulo.valorTitulo=464.01;x.proposto.dadosTitulo.vencimento.dataVencimento=6112026;assert.equal(validarPreAlteracao(x).apto,false)});
test('rejeita alteração de CPF/CNPJ pagador',()=>{const x=entrada();x.proposto.dadosPagador.cpfCnpjSacado.controle=11;assert.equal(validarPreAlteracao(x).apto,false)});
test('rejeita título pago, baixado ou descontado',()=>{for(const k of ['pago','baixado','descontado']){const x=entrada();x.consulta[k]=true;assert.equal(validarPreAlteracao(x).apto,false)}});
test('rejeita ausência de dias de encargos',()=>{const x=entrada();delete x.proposto.dadosTitulo.diasMulta;delete x.proposto.dadosTitulo.comissaoPermanencia.diasComissaoPermanencia;assert.equal(validarPreAlteracao(x).apto,false)});
test('rejeita campos originais incompletos',()=>{const x=entrada();delete x.original.dadosTitulo.dataEmissao;assert.equal(validarPreAlteracao(x).apto,false)});
