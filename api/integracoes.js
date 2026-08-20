/** Sofisticatto Financeiro — API unificada de integrações. */
const validarChave=require('../lib/integracoes/validar-chave');
const statusServidor=require('../lib/integracoes/status-servidor');
const salvarCredenciais=require('../lib/integracoes/salvar-credenciais');
const statusCredenciais=require('../lib/integracoes/status-credenciais');
const testarHomologacao=require('../lib/integracoes/testar-homologacao');
const testarRodonavesAuth=require('../lib/integracoes/testar-rodonaves-auth');
const cotarRodonaves=require('../lib/integracoes/cotar-rodonaves');
const agendarColetaRodonaves=require('../lib/integracoes/agendar-coleta-rodonaves');
const agendarColetaRodonavesEndereco=require('../lib/integracoes/agendar-coleta-rodonaves-endereco');
const consultarColetaRodonaves=require('../lib/integracoes/consultar-coleta-rodonaves');
const atualizarStatus=require('../lib/integracoes/atualizar-status');
const consultarRastreioRodonaves=require('../lib/integracoes/consultar-rastreio-rodonaves');
const cotarAlfa=require('../lib/integracoes/cotar-alfa');
const consultarRastreioAlfa=require('../lib/integracoes/consultar-rastreio-alfa');
const atualizarRastreiosAlfa=require('../lib/integracoes/atualizar-rastreios-alfa');
const agendarColetaAccert=require('../lib/integracoes/agendar-coleta-accert');
const agendarColetaSSW=require('../lib/integracoes/agendar-coleta-ssw');
const consultarRastreioSSW=require('../lib/integracoes/consultar-rastreio-ssw');
const ROTAS=Object.freeze({'validar-chave':validarChave,'status-servidor':statusServidor,'salvar-credenciais':salvarCredenciais,'status-credenciais':statusCredenciais,'testar-homologacao':testarHomologacao,'testar-rodonaves-auth':testarRodonavesAuth,'cotar-rodonaves':cotarRodonaves,'agendar-coleta-rodonaves':agendarColetaRodonaves,'agendar-coleta-rodonaves-endereco':agendarColetaRodonavesEndereco,'consultar-coleta-rodonaves':consultarColetaRodonaves,'atualizar-status':atualizarStatus,'consultar-rastreio-rodonaves':consultarRastreioRodonaves,'cotar-alfa':cotarAlfa,'consultar-rastreio-alfa':consultarRastreioAlfa,'atualizar-rastreios-alfa':atualizarRastreiosAlfa,'agendar-coleta-accert':agendarColetaAccert,'agendar-coleta-ssw':agendarColetaSSW,'consultar-rastreio-ssw':consultarRastreioSSW});
function responder(res,status,body){return res.status(status).json(body)}
module.exports=async function handler(req,res){const action=String(req.query?.action||req.body?.action||'').trim();if(action==='health')return responder(res,200,{ok:true,servico:'sofisticatto-financeiro',versao:'39-rastreamento-ssw',rotas_carregadas:Object.keys(ROTAS).length,data:new Date().toISOString()});const executar=ROTAS[action];if(!executar)return responder(res,404,{ok:false,erro:'Ação de integração não encontrada.',action,acoes_disponiveis:[...Object.keys(ROTAS),'health']});try{return await executar(req,res)}catch(erro){console.error('[API INTEGRACOES V39]',action,erro);if(res.headersSent)return;return responder(res,500,{ok:false,erro:'Falha interna ao executar a integração.',action,diagnostico:{mensagem:erro?.message||String(erro)}})}};
