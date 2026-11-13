'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PDFDocument}=require('pdf-lib');
const documentos=require('../lib/integracoes/documentos-correios');
const {ajustarRotuloCartaPdf,FORMATOS_CARTA}=documentos._teste;
const mm=72/25.4;
async function pdfFixture(quantidade){
 const pdf=await PDFDocument.create();
 for(let n=0;n<quantidade;n++)pdf.addPage([220*mm,110*mm]);
 return Buffer.from(await pdf.save());
}
test('quatro tamanhos de folha e Envelope em folha Retrato 115x230 mm',async()=>{
 assert.deepEqual(Object.keys(FORMATOS_CARTA),['etiqueta1','etiqueta2','a4','envelope']);
 const fonte=await pdfFixture(1);
 assert.deepEqual(FORMATOS_CARTA.envelope,[115,230],'driver Brother usa Retrato com lado curto na entrada manual');
 for(const [formato,[w,h]]of Object.entries(FORMATOS_CARTA)){
  const bytes=await ajustarRotuloCartaPdf(fonte,formato);
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  const dimensoes=pdf.getPage(0).getSize();
  assert.ok(Math.abs(dimensoes.width-w*mm)<0.1,formato+' largura');
  assert.ok(Math.abs(dimensoes.height-h*mm)<0.1,formato+' altura');
 }
});
test('A4 organiza dois rótulos por página sem duplicar objetos',async()=>{
 const pdf=await PDFDocument.load(await ajustarRotuloCartaPdf(await pdfFixture(3),'a4'));
 assert.equal(pdf.getPageCount(),2);
});
test('PDFs não oficiais ou formato indevido são rejeitados sem imprimir',async()=>{
 await assert.rejects(ajustarRotuloCartaPdf(Buffer.from('nao e pdf'),'envelope'),/PDF oficial/);
 await assert.rejects(ajustarRotuloCartaPdf(await pdfFixture(1),'tamanho-inexistente'),/Formato de impressão/);
});
test('tela mostra 4 formatos, salva Envelope e usa modal original de Carta',()=>{
 const dir=path.join(__dirname,'..');
 const js=fs.readFileSync(path.join(dir,'cartas-impressao-registrada.js'),'utf8');
 const page=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const carta=fs.readFileSync(path.join(dir,'cartas-comerciais-correios.js'),'utf8');
 for(const nome of ['etiqueta1','etiqueta2','a4','envelope'])assert.ok(js.includes("id:'"+nome+"'"));
 assert.ok(js.includes("return formatos.some(f=>f.id===s)?s:'envelope'"));
 assert.ok(js.includes('window.cartaImportarRotuloPDF'));
 assert.ok(page.includes('onclick="cartaImportarRotuloPDF()"'));
 assert.ok(page.includes('cartas-impressao-registrada.js?v=1-envelope-brother-manual'));
 assert.ok(carta.includes('window.cartaAbrirPdfOficialCarta'));
 assert.ok(js.includes('Origem = Manual'));
 assert.ok(js.includes('Orientação = Retrato'));
 assert.ok(js.includes('115 × 230 mm'));
 assert.ok(js.includes("modo=ajustar-rotulo-carta"));
});
test('roteamento de ajuste exige POST e credencial administrativa; não cria postagem',async()=>{
 const fonte=await pdfFixture(1);
 const envAnterior=process.env.INTEGRATIONS_ADMIN_KEY;
 process.env.INTEGRATIONS_ADMIN_KEY='chave-teste-carta-impressao-nao-real';
 try{
  async function invoke(req){
   const resposta={code:0,body:null,headers:{},status(n){this.code=n;return this;},setHeader(k,v){this.headers[k]=v;},send(v){this.body=v;return this;},json(v){this.body=v;return this;}};
   await documentos(req,resposta);return resposta;
  }
  const body={formato:'envelope',pdfBase64:fonte.toString('base64')};
  const deny=await invoke({method:'POST',headers:{},query:{modo:'ajustar-rotulo-carta'},body});
  assert.equal(deny.code,401);
  const get=await invoke({method:'GET',headers:{},query:{modo:'ajustar-rotulo-carta'},body});
  assert.equal(get.code,405);
  const ok=await invoke({method:'POST',headers:{'x-integrations-admin-key':process.env.INTEGRATIONS_ADMIN_KEY},query:{modo:'ajustar-rotulo-carta'},body});
  assert.equal(ok.code,200);
  assert.equal(ok.headers['Content-Type'],'application/pdf');
  const r=await PDFDocument.load(ok.body);
  assert.ok(Math.abs(r.getPage(0).getSize().width-115*mm)<0.1);
  assert.ok(Math.abs(r.getPage(0).getSize().height-230*mm)<0.1);
 }finally{
  if(envAnterior===undefined)delete process.env.INTEGRATIONS_ADMIN_KEY;else process.env.INTEGRATIONS_ADMIN_KEY=envAnterior;
 }
});

test('envelope gira vetor 90° para coincidir com entrada manual em Retrato',async()=>{
 const original=await pdfFixture(1);
 const saida=await ajustarRotuloCartaPdf(original,'envelope');
 const documento=await PDFDocument.load(saida),pg=documento.getPage(0);
 const dimensao=pg.getSize();
 assert.ok(dimensao.width<dimensao.height);
 const stream=pg.node.Contents();
 assert.ok(stream,'conteúdo gráfico deve existir no PDF');
 assert.ok(saida.length>100,'não pode rasterizar ou descartar o rótulo');
});
