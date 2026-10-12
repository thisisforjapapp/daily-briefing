/* Online-only migration. No requests are intercepted or cached.
   The update still waits for reader consent; localStorage is untouched. */
'use strict';
const SHELL = 'dl-shell-20261013-3';
self.addEventListener('install',event=>{ /* Do not skipWaiting automatically. */ });
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())
  if(name.startsWith('dl-shell-')||name==='dl-editions-v1')await caches.delete(name);
 await self.clients.claim();
})()));
// Intentionally no fetch listener, downloads or remote request interception.
