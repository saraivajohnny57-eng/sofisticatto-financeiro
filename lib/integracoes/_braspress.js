const {obterCredenciaisIntegracao}=require('./carregar-credenciais');
const {supabaseRest,descriptografar}=require('./_utils');
const BASE='https://api.braspress.com';
function soDigitos(v){return String(v??'').replace(/\D/g,'');}
async function credenciais(conviteId,ambiente){
  const c=await obterCredenciaisIntegracao(conviteId,ambiente||'homologacao');
  if(!c.username||!c.password)throw new Error('Cadastre usuário e senha da API Braspress nas credenciais protegidas.');
  return c;
}
function headers(c){return {'Authorization':'Basic '+Buffer.from(`${c.username}:${c.password}`,'utf8').toString('base64'),'Accept':'application/json','Content-Type':'application/json'};}
async function ler(res){const t=await res.text();try{return t?JSON.parse(t):{}}catch{return {raw:t}}}
async function localizarConviteBraspress(){
  // V217: o cadastro rápido cria primeiro o convite em integracao_convites.
  // A ficha técnica em transportadora_integracoes pode ainda não existir.
  // Procuramos nas duas estruturas para manter compatibilidade com V213–V216.
  const candidatos=[];
  try{
    const rows=await supabaseRest('transportadora_integracoes',{
      query:'?select=convite_id,transportadora_nome&transportadora_nome=ilike.*Braspress*&limit=10'
    });
    for(const r of (Array.isArray(rows)?rows:[])) if(r?.convite_id)candidatos.push(r.convite_id);
  }catch(e){ console.warn('Braspress V217: transportadora_integracoes:',e.message); }
  try{
    const rows=await supabaseRest('integracao_convites',{
      query:'?select=id,transportadora_nome&transportadora_nome=ilike.*Braspress*&order=atualizado_em.desc&limit=10'
    });
    for(const r of (Array.isArray(rows)?rows:[])) if(r?.id)candidatos.push(r.id);
  }catch(e){ console.warn('Braspress V217: integracao_convites:',e.message); }
  // Confirma qual candidato realmente possui credencial de produção válida.
  for(const id of [...new Set(candidatos)]){
    try{
      const c=await obterCredenciaisIntegracao(id,'producao');
      if(c?.username&&c?.password)return {conviteId:id,credenciais:c};
    }catch(_e){}
  }
  return null;
}
async function localizarCredencialBraspressPorConteudo(){
  // V218: fallback independente da ficha/convite. A cotação já provou que a
  // credencial existe; portanto procuramos os cofres de produção e identificamos
  // o payload Braspress pelos próprios campos, sem expor nada ao navegador.
  const rows=await supabaseRest('integracao_credenciais',{
    query:'?select=id,convite_id,ambiente,payload_criptografado,iv,auth_tag,atualizado_em&ambiente=eq.producao&order=atualizado_em.desc&limit=100'
  });
  for(const row of (Array.isArray(rows)?rows:[])){
    try{
      const c=descriptografar(row)||{};
      if(c?.username&&c?.password&&(c?.braspress_cnpj||c?.braspress_cep_origem)){
        return {conviteId:row.convite_id,credenciais:c};
      }
    }catch(_e){}
  }
  return null;
}
async function credenciaisBraspressProducao(conviteId){
  // Caminho 1: usar exatamente o mesmo convite informado pelo frontend/cotação.
  if(conviteId){
    try{
      const c=await obterCredenciaisIntegracao(conviteId,'producao');
      if(c?.username&&c?.password)return {conviteId,credenciais:c};
    }catch(_e){}
  }
  // Caminho 2: compatibilidade com os cadastros V213–V217.
  const achado=await localizarConviteBraspress();
  if(achado)return achado;
  // Caminho 3: localizar diretamente o cofre que contém os campos Braspress.
  const porConteudo=await localizarCredencialBraspressPorConteudo();
  if(porConteudo)return porConteudo;
  throw new Error('Credenciais Braspress não encontradas no cofre de produção. A cotação e o rastreamento agora usam a mesma credencial; abra a Central de Integrações somente se o cadastro tiver sido realmente removido.');
}
module.exports={BASE,soDigitos,credenciais,headers,ler,localizarConviteBraspress,localizarCredencialBraspressPorConteudo,credenciaisBraspressProducao};
