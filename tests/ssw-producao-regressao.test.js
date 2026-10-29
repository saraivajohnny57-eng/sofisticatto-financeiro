const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('coletas.js','utf8');
const begin=source.indexOf('async function consultarRastreioSSWRegistro(id){');
const end=source.indexOf('\nasync function sincronizarRastreiosSSWLocais()',begin);
assert.ok(begin>=0 && end>begin,'Função de rastreio SSW deve existir');
const code=source.slice(begin,end);
function executar({rastro,ocorrencias}){
 const gravacoes=[];
 const banco={from(tabela){
  if(tabela==='ssw_ocorrencias_recebidas'){
   const q={select(){return q},order(){return q},limit(){return q},eq(){return q},then(resolve){return Promise.resolve({data:ocorrencias,error:null}).then(resolve)}};
   return q;
  }
  return {update(patch){gravacoes.push(patch);return {eq(){return Promise.resolve({error:null})}}}};
 }};
 const contexto={banco,obterRastreamentoPorId:async()=>rastro,transportadoraEhSSW:()=>true,
  nomeNormalizadoTransportadora:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
  normalizarStatusOcorrenciaSSWCliente:()=> 'em_transito',Date,console};
 vm.createContext(contexto);vm.runInContext(code,contexto);
 return contexto.consultarRastreioSSWRegistro('r1').then(resultado=>({resultado,gravacoes}));
}
const base={frete_transportadoras:{nome:'SIGMALOG TRANSPORTES'},numero_nfe:'51075',chave_nfe:'1'.repeat(44),status:'em_transito',ultima_ocorrencia_em:'2026-10-29T10:00:00Z'};
const evento=(nome,data,chave='1'.repeat(44))=>({transportadora_nome:nome,data_hora_evento:data,chave_nfe:chave,descricao:'Em trânsito'});
test('não aplica evento de transportadora diferente',async()=>{const r=await executar({rastro:base,ocorrencias:[evento('RODONAVES','2026-10-29T12:00:00Z')]});assert.equal(r.gravacoes.length,0)});
test('não aplica evento de outra chave NF-e',async()=>{const r=await executar({rastro:base,ocorrencias:[evento('SIGMALOG TRANSPORTES','2026-10-29T12:00:00Z','2'.repeat(44))]});assert.equal(r.gravacoes.length,0)});
test('não retrocede evento anterior',async()=>{const r=await executar({rastro:base,ocorrencias:[evento('SIGMALOG TRANSPORTES','2026-10-29T09:00:00Z')]});assert.equal(r.gravacoes.length,0)});
test('não reabre entrega finalizada',async()=>{const r=await executar({rastro:{...base,status:'entregue'},ocorrencias:[evento('SIGMALOG TRANSPORTES','2026-10-29T12:00:00Z')]});assert.equal(r.gravacoes.length,0)});
test('atualiza ocorrência confirmada e mais recente',async()=>{const r=await executar({rastro:base,ocorrencias:[evento('SIGMALOG TRANSPORTES','2026-10-29T12:00:00Z')]});assert.equal(r.gravacoes.length,1)});
test('não contabiliza evento sem atualização',async()=>{const r=await executar({rastro:base,ocorrencias:[evento('SIGMALOG TRANSPORTES','2026-10-29T09:00:00Z')]});assert.equal(r.resultado.ocorrencia,null)});
