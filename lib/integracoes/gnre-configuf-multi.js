'use strict';
// Perfil GNRE dinamico (somente leitura). Os campos ConfigUF informam regras
// declaradas no Portal, NAO substituem validacoes fiscais da SEFAZ ou prova
// de habilitacao da empresa. Nao monta nem transmite GNRE.
const UFS=Object.freeze(['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']);
const {NS_SERVICO,NS_DADOS,SOAP_ACTION,analisarConfigUf}=require('./gnre-configuf-xml');
function validarEntrada(uf,receita){
 if(typeof uf!=='string'||!UFS.includes(uf))throw new TypeError('UF GNRE nao reconhecida.');
 if(typeof receita!=='string'||!/^\d{6}$/.test(receita))throw new TypeError('Receita GNRE invalida.');
 return {uf,receita};
}
function envelope(uf,receita){
 validarEntrada(uf,receita);
 return '<?xml version="1.0" encoding="UTF-8"?>'
 +'<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
 +'<soap12:Header><gnreCabecMsg xmlns="'+NS_SERVICO+'"><versaoDados>1.00</versaoDados></gnreCabecMsg></soap12:Header>'
 +'<soap12:Body><gnreDadosMsg xmlns="'+NS_SERVICO+'">'
 +'<TConsultaConfigUf xmlns="'+NS_DADOS+'"><ambiente>2</ambiente><uf>'+uf
 +'</uf><receita>'+receita+'</receita></TConsultaConfigUf>'
 +'</gnreDadosMsg></soap12:Body></soap12:Envelope>';
}
function blocos(xml,tag){
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+tag+'\\b([^>]*)>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?'+tag+'\\s*>','gi');
 return [...String(xml||'').matchAll(re)].slice(0,80).map(m=>({attrs:m[1],inner:m[2]}));
}
function campo(xml,tag){
 return blocos(xml,tag)[0]?.inner?.trim()||null;
}
function attr(s,name){
 const m=String(s||'').match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]','i'));
 return m?m[1].trim():null;
}
function limpo(s,n=80){
 return String(s||'').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|apos);/g,
 (x,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k]))
 .replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n);
}
function flag(s){
 const x=String(s||'').trim().toUpperCase();
 return ['N','S','O'].includes(x)?x:'nao_confirmado';
}
function lista(bloco,container,item,regexCodigo){
 const xml=campo(bloco,container);
 if(!xml)return [];
 return blocos(xml,item).map(entry=>{
  const codigo=campo(entry.inner,'codigo')||attr(entry.attrs,'codigo');
  const descricao=campo(entry.inner,'descricao')||attr(entry.attrs,'descricao');
  return {codigo:codigo&&regexCodigo.test(codigo)?codigo:null,descricao:limpo(descricao,120)};
 }).filter(x=>x.codigo).slice(0,40);
}
function perfilDaReceita(xml,uf,receita){
 validarEntrada(uf,receita);
 const parent=campo(xml,'TConfigUf');
 if(!parent)return {ok:false,diagnostico:'xml_configuf_ausente'};
 const ambiente=campo(parent,'ambiente');
 const ufRetorno=(campo(parent,'uf')||'').toUpperCase();
 if(ambiente&&ambiente!=='2')return {ok:false,diagnostico:'ambiente_nao_homologacao'};
 if(ufRetorno&&ufRetorno!==uf)return {ok:false,diagnostico:'uf_retorno_divergente'};
 const bloco=blocos(campo(parent,'receitas')||'', 'receita').find(x=>attr(x.attrs,'codigo')===receita);
 if(!bloco)return {ok:false,diagnostico:'receita_nao_encontrada'};
 const inner=bloco.inner;
 const tags={
  emitente:'exigeContribuinteEmitente',destinatario:'exigeContribuinteDestinatario',
  documento_origem:'exigeDocumentoOrigem',detalhamento:'exigeDetalhamentoReceita',
  produto:'exigeProduto',periodo_referencia:'exigePeriodoReferencia',
  vencimento:'exigeDataVencimento',pagamento:'exigeDataPagamento',
  convenio:'exigeConvenio',campos_adicionais:'exigeCamposAdicionais',
  valor_fcp:'exigeValorFecp'
 };
 const exigencias={};
 for(const [k,tag] of Object.entries(tags))exigencias[k]=flag(campo(inner,tag));
 const detalhamentos=lista(inner,'detalhamentosReceita','detalhamentoReceita',/^\d{6}$/);
 const documentos=lista(inner,'tiposDocumentosOrigem','tipoDocumentoOrigem',/^\d{2}$/);
 const produtos=lista(inner,'produtos','produto',/^\d{4}$/);
 const adicionais=(blocos(campo(inner,'camposAdicionais')||'','campoAdicional')).map(x=>({
  codigo:limpo(campo(x.inner,'codigo')||attr(x.attrs,'codigo'),12),
  titulo:limpo(campo(x.inner,'titulo'),70),
  tipo:limpo(campo(x.inner,'tipo'),1),
  obrigatorio:flag(campo(x.inner,'obrigatorio')),
  tamanho:limpo(campo(x.inner,'tamanho'),5),
  casas_decimais:limpo(campo(x.inner,'casasDecimais'),3)
 })).filter(x=>/^\d{1,12}$/.test(x.codigo)).slice(0,40);
 const tiposGnreReceita=blocos(campo(inner,'tiposGnre')||'','tipoGnre').map(x=>x.inner.trim()).filter(x=>/^[0-9]$/.test(x));
 const tiposGnreUf=blocos(campo(parent,'tiposGnreDaUF')||'','tipoGnre').map(x=>x.inner.trim()).filter(x=>/^[0-9]$/.test(x));
 const flagsAusentes=Object.entries(exigencias).filter(([,v])=>v==='nao_confirmado').map(([k])=>k);
 const pendencias=[];
 if(exigencias.detalhamento==='O'&&!detalhamentos.length)
  pendencias.push('Detalhamento exigido, mas nenhum codigo de detalhamento foi identificado.');
 if(exigencias.campos_adicionais==='O'&&!adicionais.length)
  pendencias.push('Campos adicionais exigidos sem lista identificada.');
 if(exigencias.documento_origem==='O'&&!documentos.length)
  pendencias.push('Documento de origem exigido sem lista de tipos confirmada.');
 if(flagsAusentes.length)
  pendencias.push('Algumas exigencias nao foram confirmadas no retorno: '+flagsAusentes.join(', ')+'.');
 const referencias0303=[
  ...detalhamentos.filter(x=>x.codigo==='000303').map(x=>'detalhamentoReceita'),
  ...adicionais.filter(x=>x.codigo==='0303').map(x=>'campoAdicional')
 ];
 return {ok:true,uf,receita,exigencias,detalhamentos,documentos,produtos,
  tipos_gnre_receita:[...new Set(tiposGnreReceita)],tipos_gnre_uf:[...new Set(tiposGnreUf)],
  campos_adicionais:adicionais,pendencias,
  codigo_0303:referencias0303.length?{identificado:true,campos:referencias0303}
   :{identificado:false,campos:[],observacao:'Codigo nao identificado; nao preencher automaticamente.'},
  emissao_liberada:false};
}
function analisarRetorno({xml,http_status,uf,receita}){
 validarEntrada(uf,receita);
 const analise=analisarConfigUf({xml,http_status,uf,receita});
 if(!analise.ok)return {ok:false,uf,receita,ambiente:'homologacao',
  codigo_gnre:analise.codigo_situacao,diagnostico:analise.falha_soap?'soap_fault':
   analise.codigo_situacao==='199'?'falha_comunicacao_199':'configuracao_nao_confirmada',
  receita_confirmada:false,transmissao:false};
 const perfil=perfilDaReceita(xml,uf,receita);
 return {ok:perfil.ok,uf,receita,ambiente:'homologacao',codigo_gnre:analise.codigo_situacao,
  receita_confirmada:perfil.ok,perfil:perfil.ok?perfil:null,
  diagnostico:perfil.ok?'perfil_consultado':perfil.diagnostico,
  transmissao:false};
}
module.exports={UFS,SOAP_ACTION,validarEntrada,envelope,perfilDaReceita,analisarRetorno};
