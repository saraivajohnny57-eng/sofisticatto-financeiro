/** V445 — diagnóstico seguro e somente leitura para futura distribuição DF-e.
 * Não faz consultas fiscais sem implementação homologada e controle NSU.
 */
const {json,exigirAdmin}=require('./_utils');
const gnre=require('./gnre-certificado');
module.exports=async function(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=String(process.env.SOFISTICATTO_CNPJ||'').replace(/\D/g,'');
 let certificado={disponivel:false,origem:null,detalhe:'Não foi possível verificar o certificado GNRE.'};
 try{
  const cred=await gnre.credenciais();
  certificado={disponivel:Boolean((cred.pfx?.length&&cred.passphrase)||(cred.cert&&cred.key)),origem:cred.origem||null,
   detalhe:'Verificação local de material TLS; não valida titularidade, vencimento ou acesso à SEFAZ.'};
 }catch(_){certificado.detalhe='Falha na leitura segura do certificado GNRE; verifique configuração e armazenamento.';}
 return json(res,200,{ok:true,versao:'V445',cnpjConfigurado:cnpj.length===14,
  cnpjMascarado:cnpj.length===14?'**.***.***/****-'+cnpj.slice(-2):null,
  certificado,
  fontes:[{id:'nfe',nome:'NF-e Distribuição DF-e',situacao:'pendente_integracao'},
          {id:'cte',nome:'CT-e Distribuição DF-e',situacao:'pendente_integracao'},
          {id:'transportadoras',nome:'Rastreamento transportadoras',situacao:'existente_parcial'}],
  consultasFiscaisExecutadas:0,registrosCriados:0,
  aviso:'Diagnóstico apenas. A consulta DF-e depende de implementação dos serviços oficiais, validação de titularidade e controle persistente de NSU. Não foram consultadas notas na SEFAZ.'});
};
