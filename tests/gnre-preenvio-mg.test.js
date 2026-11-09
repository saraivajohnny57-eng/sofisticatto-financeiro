'use strict';
// Testes sem rede, sem certificado real e sem qualquer transmissao GNRE.
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {prepararPreEnvio}=require('../lib/integracoes/gnre-preenvio-mg');
const cnpj='12345678000195';
const chave='52'+'2611'+cnpj+'55'+'001'+'000005109'+'1'+'00062672'+'8';
const nfe={
 chave,numero:'5109',cnpjEmitente:cnpj,chaveProtocolo:chave,
 statusAutorizacao:'100',ambienteNfe:'1',consumidorFinal:'1',indIeDest:'9',
 ufDestino:'MG',ufOrigem:'GO',municipioEmitente:'5208707',cepEmitente:'74550470',
 enderecoEmitente:'Rua do Exemplo, 100',razaoSocialEmitente:'Empresa Ficticia',
 valorDifal:'19.01',valorFcp:'0.00'
};
const fiscal={
 vencimento:'2026-11-09',pagamento:'2026-11-09',convenio:'CONVENIO SINTETICO',
 vencimentoConfirmado:true,convenioConfirmado:true,obrigacaoConfirmada:true
};
test('pre-envio exige conferencia fiscal, sem criar lote ou transmitir se incompleto',()=>{
 const r=prepararPreEnvio({nfe,fiscal:{}});
 assert.equal(r.apto_para_revisao,false);
 assert.equal(r.transmissao,false);
 assert.ok(r.pendencias.length>=5);
 assert.equal(r.plano,undefined);
});
test('pre-envio MG 100102 correto cria hash e idempotencia, sem XML nem emissao',()=>{
 const r=prepararPreEnvio({nfe,fiscal});
 assert.equal(r.apto_para_revisao,true);
 assert.equal(r.resumo.valor_difal,'19.01');
 assert.equal(r.resumo.valor_fcp_nfe,'0.00');
 assert.match(r.plano.lote_sha256,/^[a-f0-9]{64}$/);
 assert.match(r.plano.idempotency_key,/^gnre:recepcao:[a-f0-9]{32}$/);
 assert.equal(r.plano.guia_quantidade,1);
 assert.equal(r.transmissao,false);
 assert.ok(!JSON.stringify(r).includes('<TLote_GNRE'));
 assert.ok(!JSON.stringify(r).includes(cnpj));
});
test('pre-envio rejeita protocolos, UF, contribuinte e valores incompatíveis',()=>{
 for(const p of [
  {chaveProtocolo:'0'.repeat(44)},{statusAutorizacao:'101'},
  {ambienteNfe:'2'},{ufDestino:'GO'},{consumidorFinal:'0'},
  {indIeDest:'1'},{valorDifal:'0.00'},{valorDifal:'texto'},
  {valorFcp:'abc'}, {municipioEmitente:'08707'},
  {cnpjEmitente:'00000000000000'}, {numero:'9999'}
 ]){
  assert.throws(()=>prepararPreEnvio({nfe:{...nfe,...p},fiscal}));
 }
});
test('não permite substituir datas ou convênio por confirmação automática',()=>{
 for(const p of [{vencimentoConfirmado:false},{convenioConfirmado:false},
 {obrigacaoConfirmada:false},{convenio:''},{vencimento:'2026-02-30'}]){
  const r=prepararPreEnvio({nfe,fiscal:{...fiscal,...p}});
  assert.equal(r.apto_para_revisao,false);
  assert.ok(r.pendencias.length>0);
 }
});
test('API e painel usam somente a rota de pre-envio administrativo',()=>{
 const root=path.join(__dirname,'..');
 const api=fs.readFileSync(path.join(root,'api/integracoes.js'),'utf8');
 const mod=fs.readFileSync(path.join(root,'lib/integracoes/gnre-preenvio-mg.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'cotacoes.js'),'utf8');
 assert.match(api,/"gnre-preenvio-mg": gnrePreenvioMg/);
 assert.match(html,/id="gnrePreenvioNfeArquivo"/);
 assert.match(html,/type="checkbox" id="gnrePreenvioConfirmaObrigacao"/);
 assert.match(js,/async function carregarNfePreenvioGnreMg/);
 assert.match(js,/action=gnre-preenvio-mg/);
 assert.doesNotMatch(mod,/enviarSoap|executarRecepcao|TRANSMITIR_HOMOLOGACAO/);
 assert.match(mod,/exigirAdmin/);
 assert.match(mod,/GNRE_AMBIENTE/);
});
