'use strict';
const {exigirAdmin,supabaseRest}=require('./_utils');
const {configuracaoEfetiva,valorProfundo}=require('./_correios');
const {localizar}=require('./documentos-correios');
const {_teste:carta}=require('./carta-comercial-correios');
const crypto=require('node:crypto');
const txt=v=>String(v??'').trim();
const cod=v=>/^[A-Z]{2}\d{9}BR$/.test(txt(v).toUpperCase());
const idOk=v=>/^[A-Za-z0-9_-]{6,80}$/.test(txt(v));
function homologacao(){
 const u=process.env.FINANCEIRO02_SUPABASE_URL||process.env.SUPABASE_URL;
 return (process.env.VERCEL_ENV==='production'&&String(u||'').replace(/\/$/,'')==='https://xrtpidsqbfdlgjefuobs.supabase.co')||(process.env.VERCEL_ENV==='preview'&&String(u||'').replace(/\/$/,'')==='https://drtgtwwsbxrmqcaabzcs.supabase.co');
}
function uuidRastreio(codigo){
 const h=crypto.createHash('sha256').update('carta-80799:'+codigo).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
function registroConfirmado(r,p){
 const id=txt(r?.id),codigo=txt(r?.codigoObjeto).toUpperCase();
 if(!r?.ok||!idOk(id)||!cod(codigo)||(p.id&&p.id!==id)||(p.codigo&&p.codigo!==codigo))throw Error('Pré-postagem não confirmada pelo identificador exato nos Correios.');
 const item=r.item||{};
 const servico=txt(item.codigoServico||item.servico?.codigo||valorProfundo(item,['coServico','codigoServico']));
 if(servico!=='80799')throw Error('A resposta não confirmou o serviço Carta Registrada 80799.');
 const status=txt(item.status||item.situacao||item.statusPrePostagem);
 if(/cancel|exclu/i.test(status))throw Error('Pré-postagem cancelada; nenhum rastreio cadastrado.');
 const nome=txt(item.destinatario?.nome||item.nomeDestinatario||r.nome);
 if(!nome)throw Error('Destinatário não identificado no registro oficial.');
 return {id,codigo,nome};
}
async function vincular(reg,rest=supabaseRest){
 const q='?select=id,status,protocolo_rastreio&sentido=eq.saida&protocolo_rastreio=eq.'+encodeURIComponent(reg.codigo)+'&limit=2';
 const antes=await rest('logistica_rastreamentos',{query:q});
 if(antes.length>1)throw Error('Há rastreios duplicados existentes. Conferir antes de continuar.');
 if(antes.length===1)return {id:antes[0].id,existente:true};
 const ts=await rest('frete_transportadoras',{query:'?select=id,nome&nome=ilike.correios&ativa=eq.true&limit=5'});
 if(ts.length!==1)throw Error('É necessário identificar uma única transportadora Correios ativa no cadastro.');
 const body={id:uuidRastreio(reg.codigo),sentido:'saida',parceiro_nome:reg.nome,transportadora_id:ts[0].id,protocolo_rastreio:reg.codigo,volumes:1,status:'aguardando_coleta',origem:'carta_registrada',observacao:'Carta Registrada 80799 | Pré-postagem '+reg.id,atualizado_por:'carta_registrada'};
 try{const rr=await rest('logistica_rastreamentos',{method:'POST',body});return {id:rr[0].id,existente:false};}
 catch(e){const rr=await rest('logistica_rastreamentos',{query:q});if(rr.length===1)return {id:rr[0].id,existente:true};throw e;}
}
const FORMATOS_CARTA=Object.freeze({
  etiqueta1:[100,80],
  etiqueta2:[100,150],
  a4:[210,297],
  envelope:[115,230] // alimentação pela borda curta: driver Brother em Retrato
});
// Ajusta SOMENTE o tamanho da folha do PDF oficial: conteúdo vetorial, barras,
// QR e textos são importados do PDF de origem, nunca redesenhados como imagem.
async function ajustarRotuloCartaPdf(buffer,formato='envelope'){
  const dimensoes=FORMATOS_CARTA[formato];
  if(!dimensoes)throw Object.assign(new Error('Formato de impressão inválido.'),{httpStatus:422});
  if(!Buffer.isBuffer(buffer)||buffer.length<100||buffer.length>2*1024*1024||
     buffer.subarray(0,4).toString()!=='%PDF')
    throw Object.assign(new Error('Envie um PDF oficial válido de até 2 MB.'),{httpStatus:422});
  const {PDFDocument,degrees}=require('pdf-lib');
  let origem;
  try{origem=await PDFDocument.load(buffer);}catch{
    throw Object.assign(new Error('Não foi possível abrir este PDF. Selecione o PDF oficial dos Correios.'),{httpStatus:422});
  }
  const paginas=origem.getPages();
  if(!paginas.length||paginas.length>10)
    throw Object.assign(new Error('PDF precisa conter de 1 a 10 páginas.'),{httpStatus:422});
  const destino=await PDFDocument.create(),mm=72/25.4;
  const [largura,altura]=dimensoes.map(n=>n*mm);
  const margem=(formato==='envelope'?4.5:2.5)*mm; // folga contra área não imprimível da Brother
  let folhaA4=null;
  for(let i=0;i<paginas.length;i++){
    const pg=paginas[i],{width:w,height:h}=pg.getSize();
    if(!(w>0&&h>0))throw Object.assign(new Error('Página de PDF inválida.'),{httpStatus:422});
    const emb=await destino.embedPage(pg);
    if(formato==='a4'){
      // Duas etiquetas oficiais por folha A4 quando houver dois objetos.
      // Não duplica a mesma pré-postagem: uma origem = um rótulo.
      if(i%2===0)folhaA4=destino.addPage([largura,altura]);
      const faixaH=(altura-2*margem)/2;
      const escala=Math.min((largura-2*margem)/w,(faixaH-2*margem)/h,1);
      const dw=w*escala,dh=h*escala;
      const y=altura-margem-((i%2)+1)*faixaH+(faixaH-dh)/2;
      folhaA4.drawPage(emb,{x:(largura-dw)/2,y,width:dw,height:dh});
    }else{
      const saida=destino.addPage([largura,altura]);
      if(formato==='envelope'&&w>h){
        // O rótulo oficial mede 220x110 mm (paisagem), mas o papel entra
        // pela borda curta no alimentador manual: 115x230 mm em RETRATO.
        // Gira o conteúdo vetorial 90° para casar com a orientação do driver.
        const escala=Math.min((altura-2*margem)/w,(largura-2*margem)/h,1);
        const dw=w*escala,dh=h*escala;
        // A rotação de +90° ocupa x-dh..x, y..y+dw.
        saida.drawPage(emb,{x:(largura+dh)/2,y:(altura-dw)/2,
          width:dw,height:dh,rotate:degrees(90)});
      }else{
        const escala=Math.min((largura-2*margem)/w,(altura-2*margem)/h,1);
        const dw=w*escala,dh=h*escala;
        saida.drawPage(emb,{x:(largura-dw)/2,y:(altura-dh)/2,width:dw,height:dh});
      }
    }
  }
  return Buffer.from(await destino.save());
}


module.exports=async(req,res)=>{
 if(!exigirAdmin(req,res))return;
 if(!homologacao())return res.status(423).json({ok:false,erro:'Banco de dados não corresponde ao ambiente autorizado. Nenhuma operação realizada.'});
 if(req.method!=='POST')return res.status(405).json({ok:false,erro:'Método inválido.'});
 const modo=txt(req.query?.modo),p=req.body||{};
 try{
  if(modo==='arquivo'){
   const c=await configuracaoEfetiva();
   const arquivo=carta.arquivoImportacaoRegistrada(p,c,{codigo:'80799',categoria:'registrada'});
   return res.status(200).json({ok:true,arquivo,postagensCriadas:0});
  }
  if(modo==='sincronizar'){
   const id=txt(p.idPrePostagem),codigo=txt(p.codigoObjeto).toUpperCase();
   if((id&&!idOk(id))||(codigo&&!cod(codigo))||(!id&&!codigo))throw Error('Informe ID oficial ou código de rastreio.');
   const r=await localizar({id,codigoObjeto:codigo});
   const reg=registroConfirmado(r,{id,codigo});
   const vinculo=await vincular(reg);
   return res.status(200).json({ok:true,idPrePostagem:reg.id,codigoObjeto:reg.codigo,rastreioId:vinculo.id,existente:vinculo.existente});
  }
  if(modo==='ajustar-rotulo-carta'){
   const b64=txt(p.pdfBase64);
   if(b64.length>2800000)throw Error('PDF excede 2 MB.');
   const buf=Buffer.from(b64,'base64');
   if(buf.length>2097152||buf.slice(0,4).toString()!=='%PDF')throw Error('PDF inválido.');
   const pdf=await ajustarRotuloCartaPdf(buf,txt(p.formato||'envelope'));
   res.setHeader('Content-Type','application/pdf');return res.status(200).send(pdf);
  }
  return res.status(400).json({ok:false,erro:'Modo inválido; emissão postal direta não habilitada.'});
 }catch(e){return res.status(422).json({ok:false,erro:txt(e.message).slice(0,300)});}
};
module.exports._teste={registroConfirmado,vincular,uuidRastreio,homologacao};
