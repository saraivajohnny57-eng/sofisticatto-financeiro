// V527: cobrança: emissão individual mais consultas, segunda via e sincronização de status (não alteração bancária).
// Sessão assinada e HttpOnly emitida pelo login Financeiro02; não confia no perfil enviado pelo navegador.
const auth=require('./secure');
const ACTIONS=Object.freeze({
 bb:new Set(['emitir-boleto','verificar-titulo','consultar-boleto','sincronizar-status','listar-pendencias-carteira','diagnosticar-titulo-externo']),
 bradesco:new Set(['preparar-emissao-producao-v248','emitir-cobranca-producao-v248','verificar-preparacao-sem-envio-v495','consultar-status-titulo','listar-pendencias-carteira','consultar-segunda-via-v389','sincronizar-status'])
});
// Liberar apenas os dois modos de atualização iniciados pelo botão "Atualizar todos",
// ou consulta individual. Lotes limitados e sempre restritos à carteira do banco
// pelo próprio endpoint, sem POST/PUT de emissão, alteração ou baixa bancária.
function escopoAtualizacaoStatusCobranca(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const modo=String(body.modo||'');
 if(modo==='planejar')return true;
 if(modo==='lote')return Array.isArray(body.ids)&&body.ids.length>0&&body.ids.length<=20
  &&body.ids.every(x=>typeof x==='string'&&uuid.test(x))
  &&new Set(body.ids.map(x=>x.toLowerCase())).size===body.ids.length;
 return !modo&&typeof body.id==='string'&&uuid.test(body.id);
}
function podeOperarEmissaoCobranca(req,banco,action,ambiente){
 if(!req || req.method!=='POST' || ambiente!=='producao')return false;
 if(!auth.sameOrigin(req))return false;
 const sessao=auth.session(req);
 if(sessao?.tipo!=='cobranca' || !sessao?.id)return false;
 if(!ACTIONS[banco]?.has(String(action||'')))return false;
 if(action==='sincronizar-status'&&!escopoAtualizacaoStatusCobranca(req.body))return false;
 const queryAmb=String(req.query?.ambiente||'');
 const bodyAmb=String(req.body?.ambiente||'');
 if((queryAmb&&queryAmb!=='producao')||(bodyAmb&&bodyAmb!=='producao'))return false;
 return true;
}
module.exports={podeOperarEmissaoCobranca};
