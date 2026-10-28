'use strict';
// Inspecao local e somente leitura: nao acessa rede, certificados ou banco.
const fs=require('node:fs');
const path=require('node:path');
function verificarDependenciasXsd(diretorio=path.resolve(__dirname,'../../docs/gnre-xsd')){
 const arquivos=fs.readdirSync(diretorio).filter(nome=>nome.endsWith('.xsd')).sort();
 const faltantes=[];
 for(const arquivo of arquivos){
  const xml=fs.readFileSync(path.join(diretorio,arquivo),'utf8');
  for(const match of xml.matchAll(/<xs:(?:include|import|redefine)\b[^>]*\bschemaLocation="([^"]+)"/g)){
   const dependencia=match[1];
   if(!/^[\w.-]+\.xsd$/.test(dependencia))throw new Error('Referencia XSD nao local ou insegura: '+arquivo);
   if(!fs.existsSync(path.join(diretorio,dependencia)))faltantes.push({arquivo,dependencia});
  }
 }
 return {completo:faltantes.length===0,arquivos:arquivos.length,faltantes};
}
module.exports={verificarDependenciasXsd};
