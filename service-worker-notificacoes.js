// ===============================
// SERVICE WORKER - NOTIFICAÇÕES
// Sofisticatto Financeiro
// ===============================

self.addEventListener("install", (event) => {
    console.log("Service Worker instalado.");
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("Service Worker ativado.");
    event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {

    event.notification.close();

    const url = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then((clientList) => {

            for (const client of clientList) {
                if ("focus" in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

self.addEventListener("push", (event) => {

    let dados = {};

    try {
        dados = event.data.json();
    } catch (e) {
        dados = {
            title: "Sofisticatto Financeiro",
            body: "Você recebeu uma nova notificação."
        };
    }

    event.waitUntil(

        self.registration.showNotification(
            dados.title || "Sofisticatto Financeiro",
            {
                body: dados.body || "",
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                vibrate: [200, 100, 200],
                requireInteraction: true,
                data: {
                    url: "/"
                }
            }
        )

    );

});
