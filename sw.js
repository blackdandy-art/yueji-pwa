// Only known app assets are cached; no health records, API/auth routes or telemetry.
// CacheStorage is origin-wide; each app scope owns only its own cache namespace.
const SCOPE_PATH=new URL(self.registration.scope).pathname;
const CACHE_PREFIX=SCOPE_PATH==='/'?'yueji-static-v':`yueji-static-scope-${encodeURIComponent(SCOPE_PATH)}-v`;
const CACHE=`${CACHE_PREFIX}11`;
const FILES=['./','./index.html','./style.css','./app.js','./local-store.js','./engine.js','./feedback.js','./record-options.js','./record-editor.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/icon.svg'];
const URLS=new Set(FILES.map(path=>new URL(path,self.registration.scope).href));
async function cacheable(request,response){
  if(!response.ok||response.redirected||!['basic','default'].includes(response.type))return false;
  if(response.url&&response.url!==request.url)return false;
  const pathname=new URL(request.url).pathname,type=response.headers.get('content-type')||'';
  if(pathname.endsWith('/')||pathname.endsWith('/index.html')){
    if(!type.includes('text/html'))return false;
    // An authentication gate can return status 200. Keep only our actual shell.
    const html=await response.clone().text();
    return html.includes('apple-mobile-web-app-title')&&html.includes('月记')&&html.includes('src="./app.js"');
  }
  if(pathname.endsWith('.js'))return /(?:javascript|ecmascript)/i.test(type);
  if(pathname.endsWith('.css'))return type.includes('text/css');
  if(pathname.endsWith('.webmanifest'))return /(?:manifest\+json|application\/json)/i.test(type);
  if(pathname.endsWith('.png'))return type.includes('image/png');
  if(pathname.endsWith('.svg'))return type.includes('image/svg+xml');
  return false;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const url of URLS){
    const request=new Request(url,{cache:'reload'}),response=await fetch(request);
    if(!await cacheable(request,response))throw new Error('App assets unavailable for offline use');
    await cache.put(request,response);
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!URLS.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(request,{cache:'no-store',signal:controller.signal});
      if(response.ok){
        if(await cacheable(request,response))await cache.put(request,response.clone()).catch(()=>{});
        return response;
      }
      return await cache.match(request)||response;
    }catch(error){
      return await cache.match(request)||Response.error();
    }finally{clearTimeout(timeout);}
  })());
});
