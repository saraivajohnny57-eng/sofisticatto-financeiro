self.addEventListener("push",event=>{
  let dados={
    titulo:"Sofisticatto Financeiro",
    mensagem:"Existe uma nova atualização.",
    url:"/"
  };

  try{
    if(event.data) dados={...dados,...event.data.json()};
  }catch{
    if(event.data) dados.mensagem=event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo,{
      body:dados.mensagem,
      icon:"/icone-192.png",
      badge:"/icone-192.png",
      tag:dados.tipo || "sofisticatto-financeiro",
      renotify:true,
      vibrate:[200,100,200],
      data:{url:dados.url || "/"}
    })
  );
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const destino=event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(janelas=>{
      for(const janela of janelas){
        if("focus" in janela){
          janela.navigate(destino);
          return janela.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(destino) : undefined;
    })
  );
});
