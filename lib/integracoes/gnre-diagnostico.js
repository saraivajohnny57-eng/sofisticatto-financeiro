// GNRE v417: diagnóstico seguro, somente leitura, sem emissão de guias.
const https=require('https');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 try{
  if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')return json(res,400,{ok:false,erro:'Configure GNRE_AMBIENTE=homologacao para o diagnóstico.'});
  const {pfx,passphrase:pass,origem}=await credenciais();
  if(!pfx?.length||!pass)return json(res,503,{ok:false,erro:'Certificado A1 não cadastrado. Use Configurar certificado GNRE ou confira as variáveis da Vercel.'});
  if(pfx.length<100)return json(res,400,{ok:false,erro:'Certificado PFX vazio ou inválido. Cadastre o arquivo A1 no portal.'});
  const base=String(process.env.GNRE_BASE_URL||'https://www.testegnre.pe.gov.br/gnreWS/services').replace(/\/$/,'');
  const parsed=new URL(base);
  if(parsed.protocol!=='https:'||parsed.hostname!=='www.testegnre.pe.gov.br'||parsed.pathname!=='/gnreWS/services')return json(res,400,{ok:false,erro:'GNRE_BASE_URL deve apontar para o serviço oficial de homologação.'});
  const url=new URL(base+'/GnreConfigUF?wsdl');
  const inicio=Date.now();
  const result=await new Promise((resolve,reject)=>{
   const request=https.get(url,{pfx,passphrase:pass,rejectUnauthorized:true,timeout:12000,headers:{'Accept':'application/xml,text/xml'}},response=>{
    let tamanho=0;let trecho='';
    response.on('data',chunk=>{tamanho+=chunk.length;if(tamanho>512000){request.destroy(new Error('Resposta GNRE acima do limite de diagnóstico'));return;}if(trecho.length<1200)trecho+=chunk.toString('utf8').slice(0,1200-trecho.length)});
    response.on('end',()=>resolve({status:response.statusCode,xml:/<(?:\w+:)?definitions\b|<(?:\w+:)?description\b|<\?xml/i.test(trecho),tipo:response.headers['content-type']||''}));
   });
   request.on('timeout',()=>request.destroy(new Error('Tempo limite na conexão GNRE')));
   request.on('error',reject);
  });
  return json(res,result.status===200&&result.xml?200:502,{ok:result.status===200&&result.xml,ambiente:'homologacao',certificado:'A1 carregado ('+origem+')',autenticacao:'Conexão TLS estabelecida',servico:'GnreConfigUF (WSDL)',http_status:result.status,wsdl_reconhecido:result.xml,tempo_ms:Date.now()-inicio,observacao:'Diagnóstico de conectividade: não consulta regras da UF nem emite GNRE.'});
 }catch(e){const code=String(e.code||'');const tipo=/mac verify|password|pkcs12|pfx/i.test(String(e.message||''))?'Falha ao abrir certificado A1. Verifique arquivo e senha.':/CERT|SSL|TLS|HANDSHAKE|ALERT/i.test(code+' '+String(e.message||''))?'Falha na autenticação TLS/certificado.':'Falha de comunicação com a GNRE.';return json(res,502,{ok:false,erro:tipo,codigo:code||undefined});}
};
