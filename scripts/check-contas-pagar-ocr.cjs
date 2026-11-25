// Build gate: generated text only; never contact Gmail or Supabase.
const {ocrSelfTest}=require('../lib/portal/contas-pagar')._test;
(async()=>{
 const r=await ocrSelfTest();
 console.log('CONTAS_PAGAR_OCR_SMOKE:',r.detalhe);
 if(!r.aprovado)process.exit(1);
 process.exit(0);
})().catch(e=>{console.error('CONTAS_PAGAR_OCR_SMOKE: falha na inicialização',e?.code||e?.name||'Error');process.exit(1)});
