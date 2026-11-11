'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validarPreAlteracao}=require('../../lib/bradesco-validar-alteracao-encargos');
const base={
  cpfCnpj:{cpfCnpj:99999999,filial:1,controle:11},
  produto:9,negociacao:12345678901,nossoNumero:62710000024,
  dadosPagador:{cpfCnpjSacado:{cpfCnpj:123456789,filial:0,controle:0}},
  dadosTitulo:{seuNumero:'55994-01',dataEmissao:10102026,vencimento:{dataVencimento:18102026,tipoVencimento:0}}
};
const copia=x=>JSON.parse(JSON.stringify(x));
function entrada(){
  const proposto=copia(base);
  Object.assign(proposto.dadosTitulo,{
    comissaoPermanencia:{codigoComissaoPermanencia:2,valorComissaoPermanencia:5,diasComissaoPermanencia:1},
    codigoMulta:2,valorMulta:2,diasMulta:1
  });
  return {
    original:copia(base),proposto,
    consulta:{http_status:200,codStatus:1,pago:false,baixado:false,descontado:false,valorNominalBancoCentavos:44191,valorNominalLocalCentavos:44191},
    confirmacaoEscala:'CONTRATO_PUT_VALIDADO'
  };
}
test('sem confirmação da escala e dos dias do PUT rejeita',()=>{
  const x=entrada();delete x.confirmacaoEscala;
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('payload aninhado coerente passa somente no validador local, com confirmação simulada',()=>{
  assert.deepEqual(validarPreAlteracao(entrada()),{apto:true,erros:[]});
});
test('nunca envia dadosTitulo.valorTitulo que inexiste no layout PUT',()=>{
  const x=entrada();x.proposto.dadosTitulo.valorTitulo=441.91;
  assert.match(validarPreAlteracao(x).erros.join('|'),/valorTitulo não pertence/);
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('rejeita divergência do nominal entre banco e portal',()=>{
  const x=entrada();x.consulta.valorNominalBancoCentavos=46401;
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('rejeita ausência da prova do nominal em centavos',()=>{
  const x=entrada();delete x.consulta.valorNominalBancoCentavos;
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('rejeita alteração de vencimento e emissão',()=>{
  const x=entrada();x.proposto.dadosTitulo.vencimento.dataVencimento=19102026;
  x.proposto.dadosTitulo.dataEmissao=12102026;
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('rejeita alteração de pagador, beneficiário ou nosso número',()=>{
  for(const path of ['dadosPagador.cpfCnpjSacado.controle','cpfCnpj.controle','nossoNumero']){
    const x=entrada(),partes=path.split('.');let o=x.proposto;
    for(const p of partes.slice(0,-1))o=o[p];
    o[partes.at(-1)]=44;
    assert.equal(validarPreAlteracao(x).apto,false,path);
  }
});
test('rejeita títulos pagos, baixados ou descontados',()=>{
  for(const k of ['pago','baixado','descontado']){
    const x=entrada();x.consulta[k]=true;
    assert.equal(validarPreAlteracao(x).apto,false,k);
  }
});
test('rejeita situação bancária diferente de aberta',()=>{
  for(const status of [2,57,61]){
    const x=entrada();x.consulta.codStatus=status;
    assert.equal(validarPreAlteracao(x).apto,false,String(status));
  }
});
test('rejeita ausência ou dias inválidos de encargos',()=>{
  for(const valor of [undefined,-1,1.5,1000]){
    const x=entrada();
    x.proposto.dadosTitulo.diasMulta=valor;
    assert.equal(validarPreAlteracao(x).apto,false,String(valor));
  }
  const x=entrada();delete x.proposto.dadosTitulo.comissaoPermanencia.diasComissaoPermanencia;
  assert.equal(validarPreAlteracao(x).apto,false);
});
test('rejeita campos originais incompletos',()=>{
  const x=entrada();delete x.original.dadosTitulo.dataEmissao;
  assert.equal(validarPreAlteracao(x).apto,false);
});
