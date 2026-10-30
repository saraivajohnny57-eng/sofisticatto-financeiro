const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('lib/integracoes/consultar-rastreio-ssw.js','utf8');
const start=source.indexOf('async function buscarIntegracao(nome){');
const end=source.indexOf('async function chamar(',start);
assert.ok(start>=0&&end>start);
async function buscar(nome,rows){
 const ctx={supabaseRest:async()=>rows,nomeNorm:v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()};
 vm.createContext(ctx);
 return vm.runInContext(source.slice(start,end)+';buscarIntegracao',ctx)(nome);
}
test('SSW: transportadoras com TRANSPORTES em comum nao se confundem',async()=>{
 const r=await buscar('SIGMALOG TRANSPORTES',[{transportadora_nome:'TG TRANSPORTES'},{transportadora_nome:'UNIAO TRANSPORTES'}]);assert.equal(r,null);
});
test('SSW: corresponde nome exato sem acentos',async()=>{
 const r=await buscar('UNIÃO TRANSPORTES',[{transportadora_nome:'UNIAO TRANSPORTES'}]);assert.equal(r.transportadora_nome,'UNIAO TRANSPORTES');
});
test('SSW: aceita razao social longa de transportadora unica',async()=>{
 const r=await buscar('ACCERT',[{transportadora_nome:'ACCERT TRANSPORTES E LOGISTICA LTDA'}]);assert.equal(r.transportadora_nome,'ACCERT TRANSPORTES E LOGISTICA LTDA');
});
test('SSW: recusa resultados ambiguos',async()=>{
 const r=await buscar('ALFA',[{transportadora_nome:'ALFA TRANSPORTES'},{transportadora_nome:'ALFA CARGAS'}]);assert.equal(r,null);
});
test('SSW: nao usa senha de outra transportadora',()=>{
 const p=source.slice(source.indexOf('const senha=String('),source.indexOf('const cnpj=String('));
 assert.doesNotMatch(p,/process\\.env\\.(ACCERT|TG|TGT)_SSW_/);
});
test('SSW: sem ocorrencias nao inventa em transito',()=>{
 const p=source.slice(source.indexOf('if(!ev){'),source.indexOf('const desc=String(ev.desc'));
 assert.match(p,/status:rast.status\\|\\|'sem_informacao'/);
 assert.match(p,/semAtualizacao:true/);
});
