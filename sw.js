const CACHE = "crewview-v144";
const PDF_MAIN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=138",
  "./app.js?v=138",
  "./airport-timezones.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  PDF_MAIN,
  PDF_WORKER
];

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Same-origin shell is required. CDN files are attempted separately so a
    // temporary CDN failure cannot prevent the service worker from installing.
    await cache.addAll(ASSETS.filter(url=>!/^https?:/i.test(url)));
    await Promise.allSettled([PDF_MAIN,PDF_WORKER].map(url=>cache.add(url)));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if(event.request.method!=="GET") return;

  // Navigation must fall back to the cached app shell when Safari/PWA is
  // launched in airplane mode or after iOS has killed the previous process.
  if(event.request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request);
        const cache=await caches.open(CACHE);
        cache.put("./index.html",fresh.clone()).catch(()=>{});
        return fresh;
      }catch(_error){
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const url=new URL(event.request.url);
    const sameOrigin=url.origin===self.location.origin;
    const coreAsset=sameOrigin && /\/(?:app\.js|style\.css|airport-timezones\.js)$/.test(url.pathname);

    // Code and CSS are network-first. This prevents a newly fetched index.html
    // from being paired with an older cached app.js/style.css after deployment.
    if(coreAsset){
      try{
        const fresh=await fetch(event.request,{cache:"no-store"});
        if(fresh && fresh.ok){
          const cache=await caches.open(CACHE);
          cache.put(event.request,fresh.clone()).catch(()=>{});
        }
        return fresh;
      }catch(_error){
        return (await caches.match(event.request)) || Response.error();
      }
    }

    const cached=await caches.match(event.request);
    if(cached) return cached;
    try{
      const response=await fetch(event.request);
      if(response && (response.ok || response.type==="opaque")){
        const cache=await caches.open(CACHE);
        cache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(_error){
      return cached || Response.error();
    }
  })());
});
