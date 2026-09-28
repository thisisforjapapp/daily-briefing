/* Only this site's shell and explicitly selected text editions are cached.
   Cross-origin requests (including private sync) are never intercepted. */
'use strict';
const SHELL = 'dl-shell-20260928-5';
const EDITIONS = 'dl-editions-v1';
const BASE = new URL('./', self.location.href);
const INDEX_KEY = new URL('__download_index__', BASE).href;
const MAX_EDITIONS = 7;
const ASSETS = ['index.html','offline.html','reader.css','reader.js','preferences.js','dashboard.js','bm.js','bookmarks.html','briefings.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','icons/homepage-qr.svg'];
const editionName = /^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/;
async function timedFetch(request, timeout=8000) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(request,{cache:'no-cache',signal:controller.signal});}finally{clearTimeout(timer);}
}
self.addEventListener('install', event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  await Promise.all(ASSETS.map(async file=>{
    const response=await timedFetch(new URL(file,BASE));
    if(!response.ok)throw new Error('Shell unavailable');
    await cache.put(new URL(file,BASE),response);
  }));
  // Updates wait for explicit user acceptance; never interrupt an active reader.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('dl-shell-')&&name!==SHELL)await caches.delete(name);
  // Never delete the edition cache, localStorage, or bookmark data on a shell update.
  await self.clients.claim();
})()));
async function records(){const c=await caches.open(EDITIONS),r=await c.match(INDEX_KEY);return r?await r.json():[];}
async function writeRecords(rows){const c=await caches.open(EDITIONS);await c.put(INDEX_KEY,new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}}));}
let queue=Promise.resolve();
function exclusive(fn){const run=queue.then(fn);queue=run.catch(()=>{});return run;}
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE'){self.skipWaiting();return;}
  const port=event.ports[0];if(!port)return;
  event.waitUntil(exclusive(async()=>{
    const {type,file}=event.data||{};
    if(type==='LIST_DOWNLOADS')return {ok:true,rows:await records()};
    if(!editionName.test(file||''))throw new Error('Invalid edition');
    const cache=await caches.open(EDITIONS),url=new URL(file,BASE);
    let rows=await records();
    if(type==='DOWNLOAD'){
      const response=await timedFetch(url,15000);
      if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html'))throw new Error('Edition unavailable');
      const text=await response.clone().text();
      if(!text.includes('<body')||!text.includes('reader.js')||text.length>3000000)throw new Error('Edition not ready for offline reading');
      await cache.put(url,response);
      rows=rows.filter(r=>r.file!==file);
      rows.push({file,date:file.match(/\d{4}-\d{2}-\d{2}/)[0],savedAt:Date.now()});
      const removed=[];
      while(rows.length>MAX_EDITIONS){const old=rows.shift();await cache.delete(new URL(old.file,BASE));removed.push(old.file);}
      await writeRecords(rows);
      return {ok:true,rows,removed};
    }
    if(type==='REMOVE_DOWNLOAD'){
      await cache.delete(url);rows=rows.filter(r=>r.file!==file);await writeRecords(rows);return {ok:true,rows};
    }
    throw new Error('Unknown request');
  }).then(result=>port.postMessage(result)).catch(()=>port.postMessage({ok:false,message:'Could not finish. Check your connection and available device storage, then try again.'})));
});
function offlineCopy(response){const headers=new Headers(response.headers);headers.set('X-DL-Offline','1');return new Response(response.body,{status:response.status,headers});}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  let file=url.pathname.slice(BASE.pathname.length)||'index.html';
  const isPage=request.mode==='navigate';
  if(!isPage&&!ASSETS.includes(file)&&!editionName.test(file))return;
  event.respondWith((async()=>{
    const shell=await caches.open(SHELL),editions=await caches.open(EDITIONS);
    const key=new URL(file,BASE);
    // Versioned shell files stay consistent with the active worker.
    if(!isPage&&ASSETS.includes(file)&&file!=='briefings.json'){
      const hit=await shell.match(key);if(hit)return hit;
    }
    try{
      const response=await timedFetch(request,4500);
      if(!response.ok)throw new Error('Network unavailable');
      // Only the publication index refreshes automatically; editions require explicit download.
      if(file==='briefings.json')await shell.put(key,response.clone());
      return response;
    }catch(_){
      const cached=await editions.match(key)||await shell.match(key);
      if(cached)return offlineCopy(cached);
      if(isPage)return await shell.match(new URL('offline.html',BASE));
      return new Response('Unavailable offline',{status:503});
    }
  })());
});
