'use strict';
// GnreConfigUF: consulta fiscal SOMENTE LEITURA e somente em homologacao.
// Nenhum lote, pagamento, GNRE ou boleto e enviado. SOAPAction e WSDL validados.
const https=require('node:https');
const {exigirAdmin,json}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {SOAP_ACTION,UF_TESTE,RECEITA_TESTE,montarEnvelopeConfigUf,analisarConfigUf,validarWsdlConfigUf,deveConsultarUfSemReceita,classificarConfigUf,ENDPOINT_ALTERNATIVO_443}=require('./gnre-configuf-xml');
const WSDL='https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF?wsdl';
const MAX_RESPOSTA=1800*1024;

function opcoesA1(cred) {
  if(cred.key&&cred.cert)return {key:cred.key,cert:cred.cert};
  if(cred.pfx&&cred.passphrase)return {pfx:cred.pfx,passphrase:cred.passphrase};
  throw Object.assign(new Error('Certificado A1 indisponivel'),{code:'GNRE_A1_AUSENTE'});
}
function codigoSeguro(err) {
  const c=String(err?.code||'');
  return /^[A-Z][A-Z0-9_]{1,80}$/.test(c)?c:'ERRO_DE_CONEXAO';
}
function obterWsdl(opcoes,enderecoWsdl=WSDL) {
  if(![WSDL,ENDPOINT_ALTERNATIVO_443+'?wsdl'].includes(enderecoWsdl))throw new TypeError('Consulta WSDL nao autorizada');
  return new Promise((resolve,reject)=>{
    const partes=[];let bytes=0;let concluiu=false;
    const finalizar=(err,value)=>{if(concluiu)return;concluiu=true;err?reject(err):resolve(value)};
    const request=https.get(enderecoWsdl,{...opcoes,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:12000,
      headers:{Accept:'application/wsdl+xml,application/xml,text/xml'}},response=>{
      response.on('data',parte=>{bytes+=parte.length;
        if(bytes>512000){request.destroy(Object.assign(new Error('WSDL muito grande'),{code:'GNRE_WSDL_GRANDE'}));return;}
        partes.push(Buffer.from(parte));
      });
      response.on('end',()=>finalizar(null,{status:response.statusCode,xml:Buffer.concat(partes).toString('utf8')}));
      response.on('error',finalizar);
    });
    request.on('timeout',()=>request.destroy(Object.assign(new Error('Tempo limite WSDL'),{code:'ETIMEDOUT'})));
    request.on('error',finalizar);
  });
}
function consultarSoap(destino,opcoes,receita) {
  const envelope=montarEnvelopeConfigUf({uf:UF_TESTE,receita});
  return new Promise((resolve,reject)=>{
    const partes=[];let bytes=0;let concluiu=false;
    const finalizar=(err,value)=>{if(concluiu)return;concluiu=true;err?reject(err):resolve(value)};
    const request=https.request(destino,{...opcoes,method:'POST',rejectUnauthorized:true,
      minVersion:'TLSv1.2',timeout:16000,
      headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+SOAP_ACTION+'"',
        'Content-Length':Buffer.byteLength(envelope,'utf8'),
        'Accept':'application/soap+xml,text/xml'}},response=>{
      response.on('data',parte=>{bytes+=parte.length;
        if(bytes>MAX_RESPOSTA){request.destroy(Object.assign(new Error('Resposta GNRE acima do limite'),{code:'GNRE_RESPOSTA_GRANDE'}));return;}
        partes.push(Buffer.from(parte));
      });
      response.on('end',()=>finalizar(null,{http_status:response.statusCode,xml:Buffer.concat(partes).toString('utf8')}));
      response.on('error',finalizar);
    });
    request.on('timeout',()=>request.destroy(Object.assign(new Error('Tempo limite SOAP'),{code:'ETIMEDOUT'})));
    request.on('error',finalizar);
    request.end(envelope);
  });
}

module.exports=async function(req,res) {
  if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
  if(!exigirAdmin(req,res))return;
  if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')
    return json(res,403,{ok:false,erro:'Consulta ConfigUF permitida somente em homologacao'});
  try {
    const cred=await credenciais();
    const tls=opcoesA1(cred);
    // Comparacao pontual e deliberada: HTTPS 443 (padrao) versus 444 (WSDL atual).
    // NUNCA altera a configuracao principal ou transmite guia.
    if(req.body?.tipo_teste==='comparar_443'){
      const wsdlAlternativo=await obterWsdl(tls,ENDPOINT_ALTERNATIVO_443+'?wsdl');
      if(wsdlAlternativo.status!==200)return json(res,200,{
        ok:false,tipo_teste:'comparar_443',ambiente:'homologacao',
        fase:'leitura_wsdl_443',http_status_wsdl:wsdlAlternativo.status,
        endereco_testado:ENDPOINT_ALTERNATIVO_443,
        orientacao:'O endereco alternativo nao retornou WSDL HTTP 200; mantenha a configuracao atual.',
        transmissao_fiscal:false
      });
      // O WSDL recuperado por 443 pode anunciar 443 ou 444. Registrar, sem segui-lo.
      const enderecoAnunciado=validarWsdlConfigUf(wsdlAlternativo.xml,{permitir443:true});
      const destinoAlternativo=new URL(ENDPOINT_ALTERNATIVO_443);
      const alternativa=await consultarSoap(destinoAlternativo,tls,null);
      const analiseAlternativa=analisarConfigUf({...alternativa,uf:UF_TESTE,receita:null});
      return json(res,200,{
        ...analiseAlternativa,tipo_teste:'comparar_443',ambiente:'homologacao',
        fase:'consulta_mg_sem_receita_443',
        endereco_testado:destinoAlternativo.href,
        endereco_anunciado_wsdl:enderecoAnunciado.href,
        http_status_wsdl:wsdlAlternativo.status,
        porta_443:analiseAlternativa.ok?'CONSULTA_450_CONFIRMADA':'SEM_CONFIRMACAO_450',
        conclusao:analiseAlternativa.ok
          ?'A consulta MG sem receita foi confirmada pelo servico em HTTPS 443. Nao alterar producao automaticamente.'
          :'A consulta HTTPS 443 tambem nao confirmou a configuracao MG. Avaliar codigo de retorno, certificado e autorizacao do CNPJ.',
        transmissao_fiscal:false
      });
    }
    const wsdl=await obterWsdl(tls);
    if(wsdl.status!==200)return json(res,502,{ok:false,erro:'WSDL da GNRE indisponivel',http_status_wsdl:wsdl.status});
    const destino=validarWsdlConfigUf(wsdl.xml);
    // 1) Consulta da receita solicitada: SOAP 1.2, XML estruturado (nao escapado).
    const resposta=await consultarSoap(destino,tls,RECEITA_TESTE);
    const analise=analisarConfigUf({...resposta,uf:UF_TESTE,receita:RECEITA_TESTE});
    let referenciaUf=null;
    // 2) Apenas se a consulta de receita falhar no servidor, testar a UF SEM filtro
    // de receita para separar falha geral de ConfigUF de falha especifica de 100129.
    // Somente leitura; nao repetir a mesma consulta automaticamente.
    if(deveConsultarUfSemReceita(analise)){
      // HTTP 200 + codigo fiscal 199 e rejeicao de aplicativo, mesmo sem Fault.
      try{
        const uf=await consultarSoap(destino,tls,null);
        referenciaUf=analisarConfigUf({...uf,uf:UF_TESTE,receita:null});
      }catch(e){
        referenciaUf={ok:false,erro:'Falha de transporte na consulta geral da UF',codigo:codigoSeguro(e)};
      }
    }
    const classificacao=classificarConfigUf(analise,referenciaUf);
    return json(res,200,{
      ...analise,
      endereco_wsdl:destino.origin+destino.pathname,
      endereco_efetivo_solicitacao:destino.href,
      acao_soap:SOAP_ACTION,
      ambiente:'homologacao',
      codigo_199_exige_conferencia_automacao:analise.codigo_situacao==='199',
      orientacao_199:analise.codigo_situacao==='199'
        ?'GNRE devolveu rejeicao de comunicacao 199. Compare o endereco efetivo com a pagina Automacao do Portal GNRE de homologacao; verifique liberacao do CNPJ do certificado. O mTLS por si so nao comprova habilitacao do WebService.'
        :null,
      elemento_raiz:(resposta.xml.replace(/<\?xml[^>]*\?>/i,'').match(/<([A-Za-z_][\w.:-]*)[\s>]/)||[])[1]||null,
      elementos_body:[...new Set([...String(resposta.xml).matchAll(/<(?:[\w.-]+:)?Body\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Body>/gi)]
        .flatMap(x=>[...x[1].matchAll(/<([A-Za-z_][\w.:-]*)[\s/>]/g)].map(y=>y[1])))].slice(0,30),
      diagnostico_sem_receita:referenciaUf,
      classificacao,
      xml_configuracao:analise.ok?resposta.xml.slice(0,100000):null,
      observacao:'Consulta somente leitura; nenhuma guia ou valor foi transmitido.'
    });
  }catch(e){
    return json(res,502,{ok:false,erro:'Nao foi possivel concluir o diagnostico SOAP ConfigUF',
      codigo:codigoSeguro(e),
      fase: e.code==='GNRE_WSDL_DIVERGENTE'||e.code==='GNRE_WSDL_SEM_ENDERECO'||e.code==='GNRE_WSDL_ENDERECO_INVALIDO'?'contrato_wsdl':'conexao_ou_certificado',
      transmissao_fiscal:false});
  }
};
