/* Explicit card feedback only. No reading analytics. Local first; optional shared sync code. */
(function () {
  'use strict';
  const KEY='dl_reader_feedback_v1', ENDPOINT='https://daily-bookmarks.mankin1024.workers.dev/feedback';
  let syncTimer;
  const acknowledged=new Set();
  const file=location.pathname.split('/').pop(), views=new Map(), states=new Map();
  const identity=r=>r.file+'#'+r.card;
  const valid=r=>!!r&&/^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/.test(r.file)&&/^card-(?:[1-9]|10|11)$/.test(r.card)&&[-1,0,1].includes(r.vote)&&Number.isSafeInteger(r.updatedAt)&&r.updatedAt>0&&typeof r.eventId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(r.eventId);
  const canonical=r=>({file:r.file,card:r.card,vote:r.vote,updatedAt:r.updatedAt,eventId:r.eventId});
  const newer=(a,b)=>!b||a.updatedAt>b.updatedAt||(a.updatedAt===b.updatedAt&&a.eventId>b.eventId);
  let ratings=new Map(), persistenceError=false, syncing=false, rerun=false;
  function read() {
    try {
      const raw=localStorage.getItem(KEY);
      if(!raw)return new Map();
      const doc=JSON.parse(raw);
      if(doc.version!==1||!Array.isArray(doc.ratings)||!doc.ratings.every(valid))throw Error();
      return new Map(doc.ratings.map(r=>[identity(r),canonical(r)]));
    } catch (_) { persistenceError=true; return new Map(); }
  }
  ratings=read();
  function save(next) {
    try { localStorage.setItem(KEY,JSON.stringify({version:1,ratings:Array.from(next.values(),canonical)})); persistenceError=false; return true; }
    catch (_) { persistenceError=true; return false; }
  }
  function code() { try { return window.BM&&BM.getCode()||''; } catch (_) { return ''; } }
  function remoteAllowed() { return location.protocol==='https:'&&location.hostname==='thisisforjapapp.github.io'&&/^[A-Za-z0-9_-]{6,64}$/.test(code()); }
  function render() {
    views.forEach((v,key)=>{
      const r=ratings.get(key), vote=r?r.vote:0, state=states.get(key);
      v.like.setAttribute('aria-pressed',String(vote===1));v.dislike.setAttribute('aria-pressed',String(vote===-1));
      v.like.classList.toggle('is-selected',vote===1);v.dislike.classList.toggle('is-selected',vote===-1);
      let text;
      if(persistenceError)text=v.zh?'未能儲存，請重試。':'Could not save. Please try again.';
      else if(location.hostname!=='thisisforjapapp.github.io'||location.protocol!=='https:')text=v.zh?(r?'本機預覽：已儲存在此裝置；回饋只儲存在此裝置。':'本機預覽：回饋只儲存在此裝置。'):(r?'Local preview · saved on this device; feedback stays on this device.':'Local preview · feedback stays on this device.');
      else if(state==='failed')text=v.zh?'已儲存在此裝置；同步未成功，稍後再試。':'Saved on this device; sync failed. Will retry later.';
      else if(state==='pending')text=v.zh?'已儲存在此裝置；正在同步。':'Saved on this device; syncing.';
      else if(state==='synced')text=v.zh?'已同步回饋。':'Feedback synced.';
      else if(r&&!code())text=v.zh?'已儲存在此裝置；設定同步碼後可同步。':'Saved on this device; configure your sync code for optional sync.';
      else if(r)text=v.zh?'已儲存在此裝置；雲端同步尚未確認。':'Saved on this device; cloud sync not yet confirmed.';
      else text=v.zh?'自願回饋；儲存在此裝置，設定同步碼後可同步。':'Optional feedback. Saved on this device; sync available with your sync code.';
      v.status.textContent=text;
    });
  }
  async function request(method,payload,syncCode) {
    for(let attempt=0;attempt<3;attempt++) {
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
      try {
        const response=await fetch(ENDPOINT+'?code='+encodeURIComponent(syncCode),{method,signal:controller.signal,headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
        if(!response.ok){if(response.status===429||response.status>=500)throw Error('retry');throw Error('stop');}
        return await response.json();
      } catch(error) {
        if(attempt===2||error.message==='stop'||error instanceof SyntaxError)throw Error('Feedback sync failed');
      } finally {clearTimeout(timer);}
      await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));
    }
  }
  async function sync() {
    if(!remoteAllowed())return;
    if(syncing){rerun=true;return;}
    syncing=true;
    const syncCode=code();
    try {
      const remote=await request('GET',null,syncCode);
      if(code()!==syncCode)throw Error();
      if(!remote||remote.version!==1||!Array.isArray(remote.ratings)||!remote.ratings.every(valid))throw Error();
      const server=new Map(remote.ratings.map(r=>[identity(r),canonical(r)])), next=new Map(ratings);
      remote.ratings.forEach(r=>{if(newer(r,next.get(identity(r))))next.set(identity(r),canonical(r));});
      if(!save(next))throw Error();
      ratings=next;
      for(const [key,r] of Array.from(ratings.entries())) {
        const old=server.get(key);
        if((old&&!newer(r,old))||acknowledged.has(syncCode+':'+r.eventId)){states.set(key,'synced');continue;}
        states.set(key,'pending');render();
        if(code()!==syncCode)throw Error();
        const ack=await request('POST',{version:1,rating:r},syncCode);
        if(!ack||ack.ok!==true||ack.version!==1||!valid(ack.rating)||identity(ack.rating)!==key||ack.rating.eventId!==r.eventId||ack.rating.vote!==r.vote||ack.rating.updatedAt!==r.updatedAt)throw Error();
        // A newer click made during the request must remain pending.
        const current=ratings.get(key);
        if(newer(ack.rating,current)){const updated=new Map(ratings);updated.set(key,ack.rating);if(!save(updated))throw Error();ratings=updated;}
        acknowledged.add(syncCode+':'+ack.rating.eventId);
        if(ratings.get(key).eventId===ack.rating.eventId)states.set(key,'synced');
        else {states.set(key,'pending');rerun=true;}
      }
    } catch (_) {ratings.forEach((r,key)=>{if(states.get(key)!=='synced')states.set(key,'failed');});}
    finally {syncing=false;render();if(rerun){rerun=false;sync();}}
  }
  function scheduleSync() {clearTimeout(syncTimer);syncTimer=setTimeout(sync,1200);}
  function vote(card,value) {
    const key=file+'#'+card, old=ratings.get(key);
    const next=new Map(ratings), timestamp=Math.max(Date.now(),old?old.updatedAt+1:1);
    let eventId;
    try {eventId=crypto.randomUUID();}catch(_){eventId=timestamp.toString(36)+'_'+Math.random().toString(36).slice(2);}
    next.set(key,{file,card,vote:old&&old.vote===value?0:value,updatedAt:timestamp,eventId});
    if(save(next)){ratings=next;states.delete(key);render();scheduleSync();}else render();
  }
  function attach(cards) {
    if(!/^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/.test(file))return;
    Array.from(cards).forEach(card=>{
      if(!/^card-(?:[1-9]|10|11)$/.test(card.id)||card.querySelector('.dl-feedback'))return;
      const zh=card.id==='card-2'||card.id==='card-4', box=document.createElement('div');box.className='dl-feedback';
      const label=document.createElement('p');label.className='dl-feedback-label';label.textContent=zh?'想再讀這類題材嗎？':'Would you like more stories like this?';
      const controls=document.createElement('div');controls.className='dl-feedback-buttons';
      const like=document.createElement('button'),dislike=document.createElement('button');
      like.type=dislike.type='button';like.textContent=zh?'喜歡':'Like';dislike.textContent=zh?'不感興趣':'Not for me';
      like.setAttribute('aria-label',zh?'喜歡這類題材；再按一次取消':'Like this subject; press again to clear');
      dislike.setAttribute('aria-label',zh?'對這類題材不感興趣；再按一次取消':'Not interested in this subject; press again to clear');
      like.addEventListener('click',()=>vote(card.id,1));dislike.addEventListener('click',()=>vote(card.id,-1));
      const status=document.createElement('p');status.className='dl-feedback-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      controls.append(like,dislike);box.append(label,controls,status);card.append(box);
      views.set(file+'#'+card.id,{like,dislike,status,zh});
    });render();sync();
  }
  window.addEventListener('online',sync);
  window.addEventListener('storage',event=>{if(event.key===KEY){const incoming=read(),next=new Map(ratings);incoming.forEach((r,key)=>{if(newer(r,next.get(key)))next.set(key,r);});ratings=next;render();}if(event.key==='dl_sync_code')sync();});
  document.addEventListener('dl:sync',sync);
  window.DLFeedback={attach,sync};
})();
