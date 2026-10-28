'use strict';
// Execute localmente com Node 22: node scripts/gnre-baixar-contratos.js
// Somente GET ao portal publico SVRS. Nao acessa certificado, Supabase ou GNRE WS.
const https=require('node:https');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const ORIGEM='https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/';
const NOMES=Object.freeze([
 'dados_gnre_v1.00.xsd','tiposBasicoGNRE_v1.00.xsd',
 'GnreLoteRecepcao.wsdl','GnreResultadoLote.wsdl'
]);
const PASTA=path.resolve(__dirname,'../docs/gnre-oficial');
function baixar(nome){
 if(!NOMES.includes(nome))throw new TypeError('Arquivo nao autorizado');
 const url=new URL(nome,ORIGEM);
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{timeout:15000,rejectUnauthorized:true,headers:{'User-Agent':'Sofisticatto-GNRE-Contract-Verification/1.0'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode+' para '+nome));}
   const partes=[];let tamanho=0;
   res.on('data',chunk=>{tamanho+=chunk.length;if(tamanho>512000){req.destroy(Error('Arquivo excede 500 KB'));return;}partes.push(chunk);});
   res.on('end',()=>{
    const buffer=Buffer.concat(partes);
    if(!/^\s*<\?xml|^\s*<(?:xs:|xsd:|wsdl:|definitions|schema)/i.test(buffer.toString('utf8',0,200)))return reject(Error('Resposta nao parece XML: '+nome));
    resolve(buffer);
   });
   res.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(Error('Timeout HTTPS')));
  req.on('error',reject);
 });
}
async function main(){
 await fs.mkdir(PASTA,{recursive:true});
 const manifest=[];
 for(const nome of NOMES){
  const bytes=await baixar(nome);
  const destino=path.join(PASTA,nome);
  await fs.writeFile(destino,bytes,{flag:'wx'}); // Nunca substitui um contrato previamente auditado.
  manifest.push({nome,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,origem:ORIGEM+nome});
  process.stdout.write('Obtido: '+nome+' ('+bytes.length+' bytes)\n');
 }
 await fs.writeFile(path.join(PASTA,'manifest.sha256.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 process.stdout.write('Contratos baixados. Conferir WSDL e validar XML antes de habilitar qualquer envio.\n');
}
if(require.main===module)main().catch(e=>{console.error('Falha segura: '+e.message);process.exitCode=1;});
module.exports={NOMES,ORIGEM,baixar};
