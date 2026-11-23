'use strict';
// GNRE - PDF tecnico por UF. Somente auditorias ConfigUF previamente salvas,
// exclui payloads cifrados, tokens e dados pessoais. Nenhuma chamada de emissao.
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const {exigirAdmin,supabaseRest}=require('./_utils');
const UFS='AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const RECEITAS=['100099','100102','100129'];
function limpo(v){
 const s=String(v===null||v===undefined?'nao informado':typeof v==='object'?JSON.stringify(v):v);
 return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?')
  .replace(/(?:\d[\s.\-/]?){11,44}/g,'[identificador protegido]').slice(0,1800);
}
async function gerarPdf(registros){
 const pdf=await PDFDocument.create();
 pdf.setTitle('Sofisticatto | Auditoria GNRE - ConfigUF das 27 UFs');
 pdf.setAuthor('Portal Sofisticatto - Financeiro02');
 pdf.setSubject('Consulta oficial por UF e receita, sem emissao de guias');
 const normal=await pdf.embedFont(StandardFonts.Helvetica);
 const forte=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,H=841.89,M=39;
 let page=null,y=0,pg=0,ufAtual='',receitaAtual='';
 const roxo=rgb(.32,.27,.60),cinza=rgb(.32,.34,.40);
 function novaPagina(contexto=''){
  page=pdf.addPage([W,H]);pg++;y=H-53;
  page.drawRectangle({x:0,y:H-15,width:W,height:15,color:roxo});
  page.drawText(limpo('SOFISTICATTO  |  GNRE / CONFIGUF'),{x:M,y:H-37,size:11,font:forte,color:roxo});
  if(contexto){page.drawText(limpo(contexto).slice(0,90),{x:M,y:H-52,size:8,font:normal,color:cinza});y-=16;}
 }
 function cabecalhoEstado(uf){
  novaPagina('Estado '+uf+'  -  3 receitas em consultas independentes');
  escrever('UNIDADE FEDERATIVA: '+uf,15,true);
  escrever('Fontes: servico oficial GNRE ConfigUF, respostas auditadas no Financeiro02.',8);
  escrever('Nao e homologacao de emissao. Estados sem retorno exibem pendencia.',8);
  espaco(5);
 }
 function espaco(v=7){y-=v;}
 function quebra(texto,font,size,maxWidth){
  const parts=limpo(texto).split(/\s+/).filter(Boolean),lines=[];let cur='';
  for(let p of parts){
   if(font.widthOfTextAtSize(p,size)>maxWidth){
    if(cur){lines.push(cur);cur='';}
    while(p.length>0){let n=p.length;while(n>1&&font.widthOfTextAtSize(p.slice(0,n),size)>maxWidth)n--;
     lines.push(p.slice(0,n));p=p.slice(n);}
    continue;
   }
   const test=cur?cur+' '+p:p;
   if(font.widthOfTextAtSize(test,size)>maxWidth&&cur){lines.push(cur);cur=p;}else cur=test;
  }
  if(cur)lines.push(cur);return lines.length?lines:['-'];
 }
 function escrever(t,size=8,negrito=false,indent=0){
  const font=negrito?forte:normal,maxW=W-M*2-indent;
  for(const line of quebra(t,font,size,maxW)){
   if(y<50)novaPagina(ufAtual+' / '+receitaAtual+' - continuacao');
   page.drawText(line,{x:M+indent,y,size,font,color:negrito?roxo:cinza});y-=size+4;
  }
 }
 function secao(texto){
  espaco(6);
  if(y<82)novaPagina(ufAtual+' / '+receitaAtual+' - continuacao');
  page.drawRectangle({x:M,y:y-5,width:W-M*2,height:18,color:rgb(.94,.92,.97)});
  page.drawText(limpo(texto),{x:M+6,y,size:9,font:forte,color:roxo});y-=24;
 }
 function pares(titulo,obj){
  secao(titulo);
  const entries=Object.entries(obj&&typeof obj==='object'?obj:{});
  if(!entries.length)escrever('Nenhum dado disponibilizado na consulta.');
  for(const [k,v] of entries){const valor=(typeof v==='object'&&v!==null)?JSON.stringify(v):v;
   escrever(k+' = '+limpo(valor),8,false,8);}
 }
 const index=new Map();
 for(const r of registros){
  const k=r.uf+'|'+r.receita;if(!index.has(k))index.set(k,r);
 }
 novaPagina('Inventario completo - consulta de 100099, 100102 e 100129');
 escrever('RELATORIO DE REQUISITOS GNRE - 27 UNIDADES FEDERATIVAS',16,true);
 espaco();
 escrever('Gerado: '+new Date().toISOString().replace('T',' ').slice(0,19)+' UTC',9);
 escrever('Escopo: configuracoes individuais das receitas 100099 (ICMS/ST), 100102 (DIFAL), 100129 (FCP).',9);
 escrever('Cada UF/receita e consultada separadamente. Nao representa o catalogo inteiro de receitas.',9);
 escrever('Os retornos completos SOAP estao cifrados no banco; este PDF lista todas as tags, campos e valores sanitizados.',9);
 escrever('Nao aparecem CPF/CNPJ, chave fiscal, recibos, certificados ou informacoes bancarias.',9);
 escrever('CONSULTA CONFIGUF NAO EMITE GNRE. Receitas nao confirmadas permanecem bloqueadas para emissao.',9,true);
 const tentativas=UFS.length*RECEITAS.length;const aprovadas=[...index.values()].filter(z=>z.status_http===200&&z.inventario?.config?.ok===true).length;
 secao('COBERTURA DO RELATORIO');
 escrever('UFs: 27   |   Combinacoes esperadas: '+tentativas+'   |   Receitas confirmadas: '+aprovadas,9,true);
 escrever('Registros encontrados: '+index.size+'   |   Ausentes: '+(tentativas-index.size),9);
 escrever('Campos opcionais, obrigatorios e codigos variam por UF/receita; nao reutilizar o XML do PA indiscriminadamente.',9);
 secao('INTERPRETACAO');
 escrever('HTTP 200 e codigo 450 = consulta de configuracao bem-sucedida, nao emissao autorizada.',9);
 escrever('SEM CONSULTA = nenhuma resposta arquivada encontrada para a combinacao. ERRO = consulta nao comprovou configuracao.',9);
 escrever('Os sinais S/N/O devem ser interpretados de acordo com o nome do campo e o manual, nao como regra global.',9);
 for(const uf of UFS){
  ufAtual=uf;receitaAtual='';cabecalhoEstado(uf);
  for(const receita of RECEITAS){
   receitaAtual=receita;const r=index.get(uf+'|'+receita);
   const label=receita==='100099'?'ICMS/ST':receita==='100102'?'DIFAL':'FCP';
   secao('RECEITA '+receita+' - '+label);
   if(!r){escrever('SEM CONSULTA OFICIAL ARQUIVADA. Nao inferir requisitos nem ativar emissao.',9,true);continue;}
   const conf=r.inventario?.config||{},inv=r.inventario||{};
   escrever('Situacao: '+(r.status_http===200&&conf.ok?'CONSULTA CONFIRMADA':'NAO VALIDADA')+
    ' | HTTP '+(r.status_http??'sem resposta')+' | Codigo GNRE '+(r.codigo_gnre||'n/a'),9,true);
   escrever('Consultada em: '+(r.criado_em||'nao informado')+' | Arquivo #'+r.id+' | Hash SHA256: '+(r.retorno_sha256||'-'),7);
   if(r.observacao)escrever('Erro: '+r.observacao,8,true);
   pares('TODOS OS REQUISITOS / CAMPOS CONFIGUF',conf.obrigatoriedade);
   pares('PROPRIEDADES DA UF',conf.propriedades_uf);
   escrever('Tipos de documento origem: '+JSON.stringify(conf.tipos_documento_origem||[]));
   escrever('Tipos de GNRE: '+JSON.stringify(conf.tipos_gnre_uf||[]));
   escrever('Versoes XML: '+JSON.stringify(conf.versoes_xml_uf||[]));
   escrever('Campos adicionais: '+JSON.stringify(conf.campos_adicionais||[]));
   escrever('Detalhamentos da receita: '+JSON.stringify(conf.detalhamentos_receita||[]));
   escrever('Receita localizada: '+String(conf.receita_localizada??false)+' | Emissao autorizada por esta consulta: NAO',8,true);
   secao('INVENTARIO COMPLETO DO RETORNO - TAGS');
   const invent=conf.inventario_todos_campos||inv;
   const tags=invent.campos_e_quantidades||{};
   const keys=Object.keys(tags);
   if(!keys.length)escrever('Sem tags extraidas; verificar falha ou ausencia de resposta.');
   for(const key of keys)escrever(key+'  ('+tags[key]+' ocorrencia(s))',7,false,8);
   pares('CODIGOS / SITUACOES',Object.fromEntries((invent.codigos_e_situacoes||[]).map((v,i)=>[String(i+1)+'. '+v.campo,v.valor+'  (qtd '+v.quantidade+')'])));
   pares('VALORES DISPONIVEIS SANITIZADOS',invent.valores_sanitizados_por_campo||{});
   escrever('SOAP Fault: '+String(invent.soap_fault??false)+' | XML escapado: '+String(invent.xml_escapado??false)+
    ' | PDF retornado: '+String(invent.pdf_presente??false)+' | Resultado: '+String(invent.resultado_presente??false),7);
  }
 }
 const pages=pdf.getPages();for(let i=0;i<pages.length;i++){const page=pages[i];page.drawLine({start:{x:M,y:33},end:{x:W-M,y:33},thickness:.6,color:rgb(.8,.79,.83)});
  page.drawText('Sofisticatto | Auditoria GNRE - uso interno | Pagina '+(i+1)+' / '+pages.length,{x:M,y:20,size:7,font:normal,color:cinza});
 }
 return Buffer.from(await pdf.save());
}
async function handler(req,res){
 if(req.method!=='GET'){res.status(405).json({ok:false,erro:'Metodo indisponivel'});return;}
 if(!exigirAdmin(req,res))return;
 try{
  const dados=await supabaseRest('gnre_config_uf_consultas',{
   query:'?select=id,uf,receita,ambiente,status_http,codigo_gnre,inventario,retorno_sha256,observacao,criado_em&order=criado_em.desc&limit=700'
  });
  const registros=Array.isArray(dados)?dados.filter(r=>UFS.includes(r.uf)&&RECEITAS.includes(r.receita)&&r.ambiente==='producao'):[];
  const pdf=await gerarPdf(registros);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','attachment; filename="Sofisticatto-GNRE-ConfigUF-27-UFs.pdf"');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.status(200).end(pdf);
 }catch(e){res.status(500).json({ok:false,erro:'Falha ao gerar o PDF; verifique permissoes e dados arquivados.'});}
}
module.exports=handler;
module.exports.gerarPdf=gerarPdf;
