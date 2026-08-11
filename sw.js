const CACHE = "crewview-v101-offline-boot";
const PDF_MAIN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./airport-timezones.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // The application shell is mandatory and entirely same-origin.
    await cache.addAll(SHELL);
    // PDF.js is only needed for NEW uploads, never for restoring an existing roster.
    // Cache it opportunistically without allowing a CDN failure to break offline boot.
    await Promise.allSettled([PDF_MAIN,PDF_WORKER].map(async url=>{
      try{
        const response=await fetch(url,{mode:"cors",cache:"no-store"});
        if(response && response.ok) await cache.put(url,response.clone());
      }catch(_error){}
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if(event.request.method!=="GET") return;

  // App navigations are cache-first so iOS can launch CrewView immediately in
  // airplane mode instead of trying the network before falling back.
  if(event.request.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const shell=(await cache.match("./index.html")) || (await cache.match("./"));
      if(shell){
        // Refresh the shell in the background when a connection exists.
        event.waitUntil((async()=>{
          try{
            const fresh=await fetch(event.request);
            if(fresh && fresh.ok) await cache.put("./index.html",fresh.clone());
          }catch(_error){}
        })());
        return shell;
      }
      try{return await fetch(event.request);}catch(_error){
        return new Response("CrewView is not cached on this device yet. Open it once while online.",{status:503,headers:{"Content-Type":"text/plain"}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached) return cached;
    try{
      const response=await fetch(event.request);
      if(response && (response.ok || response.type==="opaque")){
        cache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(_error){
      return cached || Response.error();
    }
  })());
});
