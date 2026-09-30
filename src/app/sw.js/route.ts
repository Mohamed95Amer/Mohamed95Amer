export const dynamic = "force-static";

const source = `const CACHE='get-gold-shell-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||event.request.mode==='navigate')return;if(url.pathname.startsWith('/_next/static/')||url.pathname==='/icon'||url.pathname==='/apple-icon'||url.pathname==='/manifest.webmanifest'){event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request);if(hit)return hit;const response=await fetch(event.request);if(response.ok)cache.put(event.request,response.clone());return response;}));}});`;

export function GET() {
  return new Response(source, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", "Service-Worker-Allowed": "/" } });
}

