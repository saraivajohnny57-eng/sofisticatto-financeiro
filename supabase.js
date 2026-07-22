const SUPABASE_URL = "https://drtgtwwsbxrmqcaabzcs.supabase.co";
const SUPABASE_KEY = "sb_publishable_h0Ep974nBED88dimAY0BGQ_KLqoQ7po";
let banco = null;
let realtimeIniciado = false;

function carregarSupabase(){
  return new Promise((resolve, reject) => {
    if(window.supabase){
      banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    script.onload = () => {
      if(window.supabase){
        banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        resolve();
      }else{
        reject(new Error("Supabase não carregou"));
      }
    };
    script.onerror = () => reject(new Error("Falha ao carregar Supabase"));
    document.head.appendChild(script);

    setTimeout(() => {
      if(!banco) reject(new Error("Tempo limite ao carregar Supabase"));
    }, 15000);
  });
}

function bancoPronto(){
  if(banco) return true;
  alert("O sistema ainda está conectando. Aguarde alguns segundos e tente novamente.");
  return false;
}
