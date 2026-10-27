/** V446 — inspeção de elegibilidade fiscal, sem chamada externa à SEFAZ. */
const crypto=require('crypto');
const forge=require('node-forge');
const {json,exigirAdmin}=require('./_utils');
const gnre=require('./gnre-certificado');
function lerCertificado(cred){
 let cert;
 if(cred.cert){cert=new crypto.X509Certificate(cred.cert)}
 else if(cred.pfx?.length){
   const der=forge.asn1.fromDer(forge.util.createBuffer(cred.pfx.toString('binary')));
   const p12=forge.pkcs12.pkcs12FromAsn1(der,false,cred.passphrase);
   const bags=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[];
   if(!bags.length)throw Error('Nenhum certificado X.509 no arquivo A1.');
   cert=new crypto.X509Certificate(forge.pki.certificateToPem(bags[0].cert));
 }else throw Error('Material TLS ausente.');
 return {validadeInicio:cert.validFrom,validadeFim:cert.validTo,
   validoAgora:Date.now()>=Date.parse(cert.validFrom)&&Date.now()<=Date.parse(cert.validTo),
   titular:cert.subject.split('\n').find(x=>x.startsWith('CN='))?.slice(3,110)||'Não identificado',
   cnpjTitularConfirmado:false};
}
module.exports=async function(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=String(process.env.SOFISTICATTO_CNPJ||'').replace(/\D/g,'');
 let certificado={disponivel:false,detalhe:'Não foi possível ler o certificado GNRE.'};
 try{const cred=await gnre.credenciais();
  certificado={disponivel:Boolean((cred.pfx?.length&&cred.passphrase)||(cred.cert&&cred.key)),origem:cred.origem||null,...lerCertificado(cred),detalhe:'Inspeção local; titularidade por CNPJ e autorização na SEFAZ ainda exigem validação.'};
 }catch(e){certificado.detalhe='Não foi possível inspecionar a validade do certificado. Confira o cadastro GNRE.';}
 return json(res,200,{ok:true,versao:'V446',cnpjConfigurado:cnpj.length===14,
 cnpjMascarado:cnpj.length===14?'**.***.***/****-'+cnpj.slice(-2):null,certificado,
 fontes:[{id:'nfe',situacao:'pendente_integracao'},{id:'cte',situacao:'pendente_integracao'}],
 consultasFiscaisExecutadas:0,registrosCriados:0,
 aviso:'V446: verificação local da validade do A1. Nenhuma consulta fiscal foi executada. Para ativar a distribuição DF-e é necessário implementar SOAP/mTLS, validar CNPJ do certificado, persistir NSU e respeitar o consumo indevido.'});
};
