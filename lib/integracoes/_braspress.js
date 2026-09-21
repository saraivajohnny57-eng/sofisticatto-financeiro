const {obterCredenciaisIntegracao}=require('./carregar-credenciais');
const BASE='https://api.braspress.com';
function soDigitos(v){return String(v??'').replace(/\D/g,'');}
async function credenciais(conviteId,ambiente){
  const c=await obterCredenciaisIntegracao(conviteId,ambiente||'homologacao');
  if(!c.username||!c.password)throw new Error('Cadastre usuário e senha da API Braspress nas credenciais protegidas.');
  return c;
}
function headers(c){return {'Authorization':'Basic '+Buffer.from(`${c.username}:${c.password}`,'utf8').toString('base64'),'Accept':'application/json','Content-Type':'application/json'};}
async function ler(res){const t=await res.text();try{return t?JSON.parse(t):{}}catch{return {raw:t}}}
module.exports={BASE,soDigitos,credenciais,headers,ler};
