self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(janelas=>{
      for(const janela of janelas){
        if("focus" in janela){
          return janela.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});
