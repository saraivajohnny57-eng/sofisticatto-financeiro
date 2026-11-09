'use strict';
// Substitui prompts de segredos por um formulario mascarado, sem log ou persistencia.
(function(root){
 let aberta=false;
 function estilo(){
  if(document.getElementById('sofSegredoEstilo'))return;
  const el=document.createElement('style');el.id='sofSegredoEstilo';
  el.textContent='.sof-segredo-fundo{position:fixed;inset:0;z-index:2147483600;background:rgba(28,20,49,.68);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.sof-segredo-card{width:min(440px,100%);box-sizing:border-box;border-radius:16px;background:#fff;color:#282038;font-family:Arial,Segoe UI,sans-serif;padding:23px;box-shadow:0 22px 70px rgba(10,8,30,.33)}.sof-segredo-card h3{font-size:20px;line-height:1.35;margin:0 0 9px;color:#5a4fa3}.sof-segredo-card p{font-size:14px;line-height:1.45;margin:0 0 15px;color:#605771}.sof-segredo-card label{display:block;font-size:14px;font-weight:600;margin:0 0 7px}.sof-segredo-card input[type=password]{box-sizing:border-box;width:100%;height:44px;border:1px solid #aaa3c0;border-radius:9px;padding:9px 12px;font:16px Arial,Segoe UI,sans-serif;background:#fff;color:#292238}.sof-segredo-card input[type=password]:focus{outline:2px solid #8e80c4;outline-offset:2px}.sof-segredo-acoes{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;flex-wrap:wrap}.sof-segredo-acoes button{border:0;border-radius:9px;font:600 14px Arial,Segoe UI,sans-serif;padding:10px 15px;cursor:pointer}.sof-segredo-cancelar{background:#eeeaf6;color:#423962}.sof-segredo-confirmar{background:#5a4fa3;color:#fff}';
  document.head.appendChild(el);
 }
 function solicitarSegredoSofisticatto({titulo='Autorização',descricao='',rotulo='Senha ou chave'}={}){
  if(typeof document==='undefined'||!document.body)return Promise.reject(new Error('Entrada segura indisponível.'));
  if(aberta)return Promise.resolve('');
  aberta=true;estilo();
  return new Promise(resolve=>{
   const anterior=document.activeElement,fundo=document.createElement('div');fundo.className='sof-segredo-fundo';
   const caixa=document.createElement('div');caixa.className='sof-segredo-card';caixa.setAttribute('role','dialog');caixa.setAttribute('aria-modal','true');
   const tituloEl=document.createElement('h3');tituloEl.id='sofSegredoTitulo';tituloEl.textContent=String(titulo);caixa.setAttribute('aria-labelledby',tituloEl.id);
   const desc=document.createElement('p');desc.textContent=String(descricao);
   const form=document.createElement('form');form.setAttribute('autocomplete','off');
   const label=document.createElement('label');label.htmlFor='sofSegredoCampo';label.textContent=String(rotulo);
   const input=document.createElement('input');input.id='sofSegredoCampo';input.name='sof-segredo-temporario';input.type='password';input.autocomplete='new-password';input.autocapitalize='off';input.spellcheck=false;input.required=true;input.setAttribute('aria-label',String(rotulo));
   const acoes=document.createElement('div');acoes.className='sof-segredo-acoes';
   const cancelar=document.createElement('button');cancelar.type='button';cancelar.className='sof-segredo-cancelar';cancelar.textContent='Cancelar';
   const continuar=document.createElement('button');continuar.type='submit';continuar.className='sof-segredo-confirmar';continuar.textContent='Continuar';
   acoes.append(cancelar,continuar);form.append(label,input,acoes);caixa.append(tituloEl,desc,form);fundo.appendChild(caixa);
   const finalizar=valor=>{input.value='';fundo.removeEventListener('keydown',teclado);fundo.remove();aberta=false;try{anterior?.focus?.()}catch(_){}resolve(valor)};
   const teclado=evento=>{
    if(evento.key==='Escape'){evento.preventDefault();finalizar('');return}
    if(evento.key==='Tab'){const todos=[input,cancelar,continuar],pos=todos.indexOf(document.activeElement);
     if(evento.shiftKey&&pos<=0){evento.preventDefault();continuar.focus()}
     else if(!evento.shiftKey&&pos===todos.length-1){evento.preventDefault();input.focus()}}
   };
   fundo.addEventListener('keydown',teclado);
   cancelar.addEventListener('click',()=>finalizar(''));
   form.addEventListener('submit',evento=>{evento.preventDefault();if(input.value)finalizar(input.value)});
   document.body.appendChild(fundo);input.focus();
  });
 }
 root.solicitarSegredoSofisticatto=solicitarSegredoSofisticatto;
 if(typeof module!=='undefined'&&module.exports)module.exports={solicitarSegredoSofisticatto};
})(typeof window!=='undefined'?window:globalThis);
