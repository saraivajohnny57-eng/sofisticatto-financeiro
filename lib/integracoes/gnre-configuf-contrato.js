'use strict';
// Consulta somente leitura do contrato WSDL GNRE em homologacao. Nao transmite guias.
const https=require('https');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(process.env.GNRE_AMBIENTE!=='homologacao')return json(res,400,{ok:false,erro:'Apenas homologacao'});
 try{
  const {pfx,passphrase,key,cert}=await credenciais();
  if(!(key&&cert)&&!(pfx&&passphrase))return json(res,503,{ok:false,erro:'Certificado A1 indisponivel'});
  const options=key&&cert?{key,cert}:{pfx,passphrase};
  const url='https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF?wsdl';
  const result=await new Promise((resolve,reject)=>{
   let chunks=[],bytes=0;
   const request=https.get(url,{...options,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:12000},response=>{
    response.on('data',part=>{bytes+=part.length;if(bytes>512000){request.destroy(new Error('WSDL acima do limite'));return;}chunks.push(part)});
    response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
    response.on('error',reject);
   });
   request.on('timeout',()=>request.destroy(new Error('Tempo limite')));
   request.on('error',reject);
  });
  const xml=result.body;
  const operacoes=[...xml.matchAll(/<(?:[\\w.-]+:)?operation\\b[^>]*\\bname=["']([^"']+)["']/g)].map(m=>m[1]);
  const mensagens=[...xml.matchAll(/<(?:[\\w.-]+:)?message\\b[^>]*\\bname=["']([^"']+)["']/g)].map(m=>m[1]);
  return json(res,result.status===200?200:502,{ok:result.status===200&&/<(?:[\\w.-]+:)?definitions\\b/i.test(xml),http_status:result.status,servico:'GnreConfigUF',ambiente:'homologacao',operacoes:[...new Set(operacoes)].slice(0,30),mensagens:[...new Set(mensagens)].slice(0,30),wsdl_reconhecido:/<(?:[\\w.-]+:)?definitions\\b/i.test(xml),content_type:'nao_disponivel',tamanho_resposta:Buffer.byteLength(xml),elemento_raiz:(xml.replace(/<\\?xml[^>]*\\?>/i,'').match(/<([A-Za-z_][\\w.:-]*)[\\s>]/)||[])[1]||null,observacao:'Somente leitura de WSDL; nenhuma consulta de receita ou transmissao fiscal executada.'});
 }catch(e){return json(res,502,{ok:false,erro:'Falha ao consultar WSDL GNRE em homologacao.',codigo:String(e.code||'SEM_CODIGO').slice(0,80)});}
};
