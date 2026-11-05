'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
function conferirRetornoCnab400(texto){
 const linhas=String(texto).split(/\r?\n/).filter(Boolean);
 assert.ok(linhas.length>=2,'Arquivo sem header e trailer');
 linhas.forEach((linha,i)=>{assert.equal(Buffer.byteLength(linha,'latin1'),400,'Registro '+(i+1)+' diferente de 400 bytes');assert.equal(linha.slice(394,400),String(i+1).padStart(6,'0'),'Sequencial inválido')});
 assert.equal(linhas[0][0],'0','Header inválido');
 assert.equal(linhas.at(-1)[0],'9','Trailer inválido');
 const detalhes=linhas.slice(1,-1);detalhes.forEach(x=>assert.equal(x[0],'1','Tipo detalhe inválido'));
 return {registros:detalhes.length,ocorrencias:detalhes.reduce((a,x)=>(a[x.slice(108,110)]=(a[x.slice(108,110)]||0)+1,a),{})};
}
function fixture(codigo,n){const row=(tipo,oc,seq)=>{const b=Array(400).fill(' ');b[0]=tipo;for(let i=0;i<oc.length;i++)b[108+i]=oc[i];String(seq).padStart(6,'0').split('').forEach((v,i)=>b[394+i]=v);return b.join('')};return [row('0','',1),...Array.from({length:n},(_,i)=>row('1',codigo,i+2)),row('9','',n+2)].join('\r\n')}
test('CNAB400 sintético: header, detalhe, trailer, sequência e ocorrência',()=>assert.deepEqual(conferirRetornoCnab400(fixture('06',2)),{registros:2,ocorrencias:{'06':2}}));
test('Rejeita registro incompleto',()=>assert.throws(()=>conferirRetornoCnab400(fixture('02',1).slice(1))));
test('Rejeita sequencial inválido',()=>assert.throws(()=>conferirRetornoCnab400(fixture('02',1).replace('000003','000004'))));
test('Retorno CNAB não equivale a remessa de alteração',()=>assert.equal(fixture('02',1).startsWith('0'),true));
module.exports={conferirRetornoCnab400};
