'use strict';
// Diagnóstico consolidado de alteração Bradesco — WF-99571.
// APENAS LEITURA: monta JSON candidato em memória, nunca envia PUT.
const crypto=require('crypto');
const {checar}=require('./wf99571-contrato-validacao');
const dig=x=>String(x??'').replace(/\D/g,'');
const texto=x=>String(x??'').trim();
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:null};
function cpfCnpjVO(raw,nome){
 const s=dig(raw);if(![11,14].includes(s.length))throw new Error('Documento '+nome+' inválido');
 // A API usa raiz/filial/controle numéricos, portanto preservar casas no split antes da conversão.
 if(s.length===14)return {cpfCnpj:Number(s.slice(0,8)),filial:Number(s.slice(8,12)),controle:Number(s.slice(12))};
 return {cpfCnpj:Number(s.slice(0,9)),filial:0,controle:Number(s.slice(9))};
}
function dataDDMMAAAA(s){
 s=texto(s);
 const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)||s.match(/^(\d{2})(\d{2})(\d{4})$/);
 if(!m)return null;
 const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===m[3]+'-'+m[2]+'-'+m[1]?Number(m[1]+m[2]+m[3]):null;
}
function validarCandidato(t,reg,banco,consultaPayload,situacao){
 const pendencias=[],alertas=[],verificacoes=[];
 const check=(nome,ok,erro)=>{verificacoes.push({nome,ok:!!ok});if(!ok)pendencias.push(erro||nome)};
 const st=x=>texto(x);
 const original=String(reg?.vencimento||'').slice(0,10);
 check('parcela',reg?.referencia==='BRADESCO-56078-02'&&Number(reg?.parcela_numero)===2,'A parcela no cadastro não corresponde ao piloto.');
 check('identificadores',st(t.snumero)==='56078-02'&&st(reg?.nosso_numero).replace(/\D/g,'')==='62710000058','Seu Número ou Nosso Número divergente.');
 check('emissão e espécie',dataDDMMAAAA(t.dataEmis)===28092026&&st(t.especDocto)==='DM','Emissão/espécie não confirmadas.');
 check('vencimento original',dataDDMMAAAA(t.dataVencto)===8112026&&original==='2026-11-08','Vencimento original divergente.');
 const valorBanco=num(t.valMoeda),valorLocal=num(reg?.valor);
 check('valor nominal',valorLocal===527.96&&valorBanco!==null&&(Math.abs(valorBanco-527.96)<.01||Math.abs(valorBanco/100-527.96)<.01),'Valor nominal divergente.');
 check('estado atual',Number(situacao?.codStatus)===1&&!situacao?.pago&&!situacao?.baixado&&!situacao?.descontado,'Título pago/baixado/descontado ou sem status compatível.');
 check('sem encargos anteriores',Number(t.codValMul||0)===0&&Number(t.codComisPerm||0)===0&&Number(t.valMulta||0)===0&&Number(t.qmoedaComisPerm||0)===0,'Encargos já existentes: reconciliar antes de alterar.');
 check('sem pagamento parcial',Number(t.vlrPagto||0)===0&&!t.dtPagto,'Pagamento/baixa parcial detectado.');
 let beneficiario=consultaPayload?.cpfCnpj,negociacao=num(consultaPayload?.negociacao),produto=num(consultaPayload?.produto),nosso=num(consultaPayload?.nossoNumero);
 check('contrato do beneficiário',beneficiario&&Number.isInteger(negociacao)&&Number.isInteger(produto)&&Number.isInteger(nosso)&&nosso===62710000058,'Identificadores do beneficiário insuficientes.');
 const sac=t.sacado||{},avalista=t.sacador||{};
 let pagadorVO=null,avalistaVO={cpfCnpj:0,filial:0,controle:0};
 try{pagadorVO=cpfCnpjVO(sac.cnpj||sac.cpf,'pagador')}catch(e){pendencias.push(e.message)}
 if(dig(avalista.cnpj||avalista.cpf)){try{avalistaVO=cpfCnpjVO(avalista.cnpj||avalista.cpf,'avalista')}catch(e){pendencias.push(e.message)}}
 check('pagador completo',!!st(sac.nome)&&!!st(sac.endereco)&&dig(sac.cep).length===5&&dig(sac.cepc).length===3&&!!pagadorVO,'Pagador incompleto na consulta.');
 const n=(campo,fallback)=>t[campo]===undefined||t[campo]===null||t[campo]===''?fallback:num(t[campo]);
 const data=(campo)=>!st(t[campo])?0:dataDDMMAAAA(t[campo]);
 const desc=idx=>({
  data:data('dataDesc'+idx),valor:n('valDesc'+idx,0),
  codigo:n('codValDe'+idx,0),tipo:0
 });
 const descontos=[1,2,3].map(desc);
 const descontosValidos=descontos.every(d=>d.valor===0&&d.data===0&&d.codigo===0);
 // Sem descontos registrados: defaults numéricos do manual para campos opcionais.
 check('sem descontos preexistentes',descontosValidos,'Descontos existentes ou data inválida: preservar seus dados antes do PUT.');
 const protesta=n('codInscrProt',0),diasProt=n('diasProt',0),diasDecurso=n('qtdDiasDecurPrz',0),abat=n('valAbat',0);
 check('protesto e abatimento sem instruções',protesta===0&&diasProt===0&&diasDecurso===0&&abat===0,
 'Protesto, decurso ou abatimento original existente: não reconstruir valores como zero.');
 check('pagamento parcial desabilitado',st(t.permitePgtoParcial)==='N'&&n('qtdePgtoParcial',0)===0,
 'Pagamento parcial configurado; verificar contrato antes de transmitir.');
 const proposta={
  cpfCnpj:beneficiario,produto,negociacao,nossoNumero:nosso,
  dadosPagador:{
   sacado:st(sac.nome).slice(0,40),cpfCnpjSacado:pagadorVO,
   endereco:st(sac.endereco).slice(0,40),cep:Number(dig(sac.cep)),sufixo:Number(dig(sac.cepc)),
   nomeSacador:st(avalista.nome).slice(0,40),aceite:st(t.aceite||'N').slice(0,1),
   cpfCnpjSacador:avalistaVO,emailSacado:''
  },
  dadosTitulo:{
   // Não enviar o vencimento original (08/11/2026) como nova instrução:
   // o manual permite zero em campos numéricos opcionais que não serão alterados.
   seuNumero:'',dataEmissao:0,especie:'',
   vencimento:{dataVencimento:0,tipoVencimento:0},
   protesto:{codInstrucaoProtesto:protesta,qtdeDiasProtesto:diasProt},
   decurso:{codDecursoPrazo:0,diasDecursoPrazo:diasDecurso},
   abatimento:{tipoAbatimento:1,valorAbatimento:abat},
   dataDesc1:descontos[0].data,valDesc1:descontos[0].valor,codValDe1:1,tipoDesc1:0,
   dataDesc2:descontos[1].data,valDesc2:descontos[1].valor,codValDe2:0,tipoDesc2:0,
   dataDesc3:descontos[2].data,valDesc3:descontos[2].valor,codValDe3:0,tipoDesc3:0,
   codigoControleParticipante:'',indicadorAvisoSacado:'',
   comissaoPermanencia:{diasComissaoPermanencia:1,valorComissaoPermanencia:50000,codigoComissaoPermanencia:2},
   codigoMulta:2,diasMulta:1,valorMulta:20000,codigoNegativacao:1,
   diasNegativacao:0,pagamentoParcial:'N',qtdePagamentoParcial:0
  }
 };
 const valorNum=(p,c)=>Number.isSafeInteger(p?.[c]);
 check('campos numéricos de desconto',descontos.every(d=>[d.valor,d.codigo,d.tipo,d.data].every(z=>Number.isInteger(z))),
  'Um ou mais campos de desconto não são numéricos.');
 check('campos de data exigidos',Number.isInteger(proposta.dadosTitulo.dataEmissao)&&Number.isInteger(proposta.dadosTitulo.vencimento.dataVencimento),
  'Datas originais não podem ser convertidas para DDMMAAAA.');
 check('nome e e-mail preservados',!st(sac.email)&&!st(t.enderecoEma),
  'E-mail ou instrução de aviso existente: conferir campo antes do PUT.');
 // Ainda falta provar que defaults em campos obrigatórios correspondem ao registro aceito pelo banco.
 // Regras documentadas: codValDe1 é obrigatório, tipoAbatimento=1,
 // codigoNegativacao=1, e campos opcionais numéricos=0, texto="".
 const defaultsValidos=proposta.dadosTitulo.codValDe1===1&&
   proposta.dadosTitulo.abatimento.tipoAbatimento===1&&
   proposta.dadosTitulo.codigoNegativacao===1&&
   [1,2,3].every(i=>proposta.dadosTitulo['tipoDesc'+i]===0)&&
   proposta.dadosTitulo.decurso.codDecursoPrazo===0;
 check('defaults e códigos do layout',defaultsValidos,'Códigos fixos/defaults não seguem o manual.');
 // O manual do PUT traz "0" em codInstrucaoProtesto no JSON de
 // referência. Não é evidência de processamento bancário; manter aviso.
 const avalistaDocumento=dig(avalista.cnpj||avalista.cpf);
 const avalistaSemNome=!!avalistaDocumento&&!st(avalista.nome);
 check('sacador avalista coerente',!avalistaSemNome,
  'Documento de avalista sem nome; não assumir substituição de dados originais.');
 check('sem nova instrução de vencimento',
  proposta.dadosTitulo.vencimento.dataVencimento===0&&proposta.dadosTitulo.dataEmissao===0,
  'Campos originais de data não devem ser reenviados como alteração.');
 check('sem instrução de protesto',
  proposta.dadosTitulo.protesto.codInstrucaoProtesto===0&&proposta.dadosTitulo.protesto.qtdeDiasProtesto===0,
  'Protesto preexistente não pode ser removido.');
 alertas.push('O exemplo do manual utiliza codInstrucaoProtesto 0; confirmar aceitação dessa representação no endpoint de produção antes do envio.');
 alertas.push('Vencimento está como zero por não ser objeto da alteração; validar com o contrato vigente antes do PUT.');
 alertas.push('Após um único PUT autorizado, consultar novamente; timeout ou retorno incerto não autorizam repetição automática.');
 const contrato=checar(proposta);
 check('estrutura e tipos integrais do JSON',contrato.ok,'Falhas estruturais do PUT: '+contrato.erros.join('; '));
 const sha256=crypto.createHash('sha256').update(JSON.stringify(proposta)).digest('hex');
 const pronto=pendencias.length===0;
 return {titulo:'56078-02',nosso_numero:'62710000058',verificacoes,pendencias,alertas,
  estrutura_candidata_montada:pronto,quantidade_campos_raiz:Object.keys(proposta).length,
  hash_payload_candidato:pronto?sha256:null,
  validacao_estrutural:{aprovada:contrato.ok,erros:contrato.erros},
  valor_nominal_preservado:true,vencimento_original_preservado:true,
  juros_percentual:5,multa_percentual:2,alteracao_enviada:false,
  conclusao:pronto?'DADOS_PRONTOS_REQUER_VALIDACAO_FINAL_DO_ENDPOINT':'BLOQUEADO_POR_DADOS',
  liberar_put:false};
}
module.exports={validarCandidato,cpfCnpjVO,dataDDMMAAAA};
