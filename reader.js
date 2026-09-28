/* Progressive enhancement shared by dashboard, bookmarks and every edition. */
(function(){
'use strict';
const $=(s,root=document)=>root.querySelector(s);
const store={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch(_){return f;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(_){return false;}}};
const filename=location.pathname.split('/').pop()||'index.html';
const isEdition=/^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/.test(filename);
const base=new URL('./',location.href);
const prefs=store.get('dl_preferences_v1',{theme:'system',font:18});
function el(tag,attrs={},text){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function hktDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function dateLabel(date){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Hong_Kong'}).format(new Date(date+'T12:00:00+08:00'));}
let toastTimer;
function toast(text){let n=$('.dl-toast');if(!n){n=el('div',{class:'dl-toast',role:'status'});document.body.append(n);}n.textContent=text;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,6500);}
function applyPrefs(){document.documentElement.dataset.theme=['light','dark','system'].includes(prefs.theme)?prefs.theme:'system';document.documentElement.style.setProperty('--dl-font',([18,20,22].includes(+prefs.font)?prefs.font:18)+'px');if(!store.set('dl_preferences_v1',prefs))toast('Preferences work for this visit; browser storage is unavailable.');}
let registration,acceptUpdate=false;
async function worker(){if(!('serviceWorker'in navigator)||!isSecureContext)throw new Error('Offline downloads need HTTPS or a local preview.');
const ready=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline support is not ready. Reconnect and retry.')),12000))]);return ready.active;}
async function message(type,file){const target=await worker();return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('Download timed out. Please retry.')),25000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve(e.data):reject(new Error(e.data.message));};target.postMessage({type,file},[channel.port2]);});}
async function downloads(){try{return (await message('LIST_DOWNLOADS')).rows;}catch(_){return [];}}
async function download(file,button){const original=button?.textContent;if(button){button.disabled=true;button.textContent='Downloading…';}
try{const result=await message('DOWNLOAD',file);toast('Text downloaded for offline reading. Images need internet.'+(result.removed.length?' Oldest download removed (7-edition limit).':''));document.dispatchEvent(new Event('dl:downloads'));return result;}catch(e){toast(e.message);throw e;}finally{if(button){button.disabled=false;button.textContent=original;}}}
function connectivity(cached){const n=$('#dl-network');if(!n)return;if(!navigator.onLine||cached){n.textContent='Offline / connection unavailable · showing saved content';n.dataset.offline='true';}else{n.textContent='Online';n.dataset.offline='false';}}
async function publicationData(){
 try{const response=await fetch(new URL('briefings.json',base),{cache:'no-cache',signal:AbortSignal.timeout(6500)});if(!response.ok)throw 0;
 const data=await response.json();if(!Array.isArray(data))throw 0;
 const list=data.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&/^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/.test(e.url)).sort((a,b)=>a.date.localeCompare(b.date)||(a.edition||1)-(b.edition||1));
 const cached=response.headers.get('X-DL-Offline')==='1';connectivity(cached);
 if(!cached)store.set('dl_last_checked',Date.now());
 return {list,cached};
 }catch(_){connectivity(true);const tag=$('#bdata');return {list:tag?JSON.parse(tag.textContent):[],cached:true};}
}
function savedPosition(file){const all=store.get('dl_reading_v1',{});return all[file];}
function renderFeatured(doc,file,target){
 target.replaceChildren();target.hidden=true;
 try{const rows=JSON.parse(doc.querySelector('#dl-featured-data')?.textContent||'null');
  if(!Array.isArray(rows)||rows.length!==3||new Set(rows.map(r=>r.id)).size!==3)return;
  if(!rows.every(r=>/^card-(?:[1-9]|10|11)$/.test(r.id)&&doc.getElementById(r.id)?.querySelector('h2')&&typeof r.reason==='string'&&r.reason.trim()&&r.reason.length<=220))return;
  target.append(el('h2',{},'Start with these three'),el('p',{class:'dl-featured-note'},'An invitation, not an assignment. All topics are below.'));
  const list=el('ol',{class:'dl-featured-list'});for(const r of rows){const li=el('li'),a=el('a',{href:(file||'')+'#'+r.id});a.append(el('strong',{},doc.getElementById(r.id).querySelector('h2').textContent.trim()),el('span',{},r.reason));li.append(a);list.append(li);}target.append(list);target.hidden=false;
 }catch(_){} // Older editions have no featured metadata; keep their normal opening.
}
function jump(id,offset=0){const node=document.getElementById(id);if(!node)return;const header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dl-header'))||70;window.scrollTo({top:Math.max(0,node.getBoundingClientRect().top+scrollY-header-16+offset),behavior:'auto'});}
function topicNavigation(cards){
 if(!cards.length)return;
 const data=cards.map((card,i)=>({card,id:card.id,topic:$('.card-label',card)?.textContent.trim()||'Topic '+(i+1),title:$('h2',card)?.textContent.trim()||card.id}));
 const dock=el('nav',{class:'dl-topic-dock','aria-label':'Reading location'}),trigger=el('button',{type:'button','aria-haspopup':'dialog','aria-controls':'dl-topic-panel','aria-expanded':'false',class:'dl-topic-trigger'});
 const currentText=el('span'),buttonLabel=el('strong',{},'Topics');trigger.append(buttonLabel,currentText);dock.append(trigger);
 const panel=el('dialog',{id:'dl-topic-panel',class:'dl-topic-panel','aria-labelledby':'dl-topic-title'}),head=el('div',{class:'dl-topic-panel-head'}),close=el('button',{type:'button','aria-label':'Close topics'},'Close');
 head.append(el('h2',{id:'dl-topic-title'},'In this edition'),close);panel.append(head,el('p',{class:'dl-topic-hint'},'Your location in the edition — not a measure of completion.'));
 const sidebar=el('nav',{class:'dl-topic-sidebar','aria-label':'Topics in this edition'});sidebar.append(el('h2',{},'In this edition'));
 const backMobile=el('button',{type:'button',class:'dl-topic-back',hidden:''},'Back to where I was'),backDesktop=backMobile.cloneNode(true);
 dock.append(backMobile);sidebar.append(backDesktop);
 let current=-1,origin=null,backTimer,selected=false;
 const lists=[el('ol',{class:'dl-topic-list'}),el('ol',{class:'dl-topic-list'})];panel.append(lists[0]);sidebar.append(lists[1]);
 const buttons=lists.map(list=>data.map((item,i)=>{const li=el('li'),b=el('button',{type:'button','data-card':item.id});b.append(el('small',{},(i+1)+' · '+item.topic),el('span',{},item.title));b.onclick=()=>choose(item);li.append(b);list.append(li);return b;}));
 function hideBack(){origin=null;backMobile.hidden=backDesktop.hidden=true;}
 function focusHeading(item){const h=$('h2',item.card)||item.card;h.setAttribute('tabindex','-1');h.focus({preventScroll:true});}
 function choose(item){
  const anchor=data.slice().reverse().find(x=>x.card.getBoundingClientRect().top<=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dl-header'))+80);
  origin={id:anchor?.id,top:scrollY,offset:anchor?scrollY-(anchor.card.getBoundingClientRect().top+scrollY-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dl-header'))||70)-16):0,hash:location.hash};
  selected=true;if(panel.open)panel.close();
  history.pushState(null,'','#'+encodeURIComponent(item.id));jump(item.id);focusHeading(item);update();
  backMobile.hidden=backDesktop.hidden=false;clearTimeout(backTimer);backTimer=setTimeout(hideBack,60000);
 }
 function goBack(){if(!origin)return;const old=origin;clearTimeout(backTimer);hideBack();history.replaceState(null,'',location.pathname+location.search+old.hash);if(old.id){jump(old.id,old.offset);focusHeading(data.find(x=>x.id===old.id));}else{scrollTo({top:old.top,behavior:'auto'});$('.dl-edition-title h1').setAttribute('tabindex','-1');$('.dl-edition-title h1').focus({preventScroll:true});}update();}
 backMobile.onclick=backDesktop.onclick=goBack;
 // Featured entries share heading focus and temporary return with Topics.
 document.addEventListener('click',event=>{const a=event.target.closest('.dl-featured a[href^="#"]');if(!a)return;const item=data.find(x=>'#'+x.id===a.getAttribute('href'));if(!item)return;event.preventDefault();event.stopImmediatePropagation();choose(item);},true);
 trigger.onclick=()=>{selected=false;panel.showModal();trigger.setAttribute('aria-expanded','true');document.documentElement.classList.add('dl-topics-open');(buttons[0][Math.max(0,current)]||close).focus();};
 close.onclick=()=>panel.close();
 panel.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');document.documentElement.classList.remove('dl-topics-open');if(!selected)trigger.focus({preventScroll:true});});
 panel.addEventListener('keydown',e=>{
  if(e.key==='Tab'){const first=close,last=buttons[0].at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!e.target.matches('[data-card]'))return;e.preventDefault();const i=buttons[0].indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?data.length-1:Math.max(0,Math.min(data.length-1,i+(e.key==='ArrowDown'?1:-1)));buttons[0][next].focus();});
 function update(){const header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dl-header'))||70;let next=-1;data.forEach((x,i)=>{if(x.card.getBoundingClientRect().top<=header+80)next=i;});if(next===current&&currentText.textContent)return;current=next;currentText.textContent=next<0?'Edition opening · '+data.length+' topics':(next+1)+' of '+data.length+' · '+data[next].topic;buttons.forEach(list=>list.forEach((b,i)=>{if(i===next)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');}));
  if(next>=0&&getComputedStyle(sidebar).display!=='none'){const rect=buttons[1][next].getBoundingClientRect(),top=backDesktop.hidden?12:70;if(rect.top<top)sidebar.scrollTop+=rect.top-top;else if(rect.bottom>innerHeight-12)sidebar.scrollTop+=rect.bottom-innerHeight+12;}
 }
 let scheduled=false;addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;update();});}},{passive:true});
 document.body.append(dock,panel,sidebar);new ResizeObserver(()=>document.documentElement.style.setProperty('--dl-dock',dock.getBoundingClientRect().height+'px')).observe(dock);
 const desktop=matchMedia('(min-width:1000px)');desktop.addEventListener('change',()=>{if(desktop.matches&&panel.open){selected=true;panel.close();(buttons[1][Math.max(0,current)]).focus({preventScroll:true});}update();});
 update();
}
function readingPosition(cards){
 if(!cards.length)return;
 if('scrollRestoration'in history)history.scrollRestoration='manual';
 let initialized=false,interacted=false,restoreTarget=null;
 const layoutObserver=new ResizeObserver(()=>{if(restoreTarget&&!interacted)jump(restoreTarget.id,restoreTarget.offset);});
 layoutObserver.observe($('.content')||document.body);setTimeout(()=>layoutObserver.disconnect(),15000);
 ['pointerdown','wheel','touchstart','keydown','change'].forEach(type=>addEventListener(type,()=>{interacted=true;},{passive:true}));
 function restore(){if(initialized)return;initialized=true;if(interacted)return;
  let id='';try{id=decodeURIComponent(location.hash.slice(1));}catch(_){}
  if(id){restoreTarget={id,offset:0};jump(id);return;}
  if(new URLSearchParams(location.search).get('start')==='1'){window.scrollTo({top:0,behavior:'auto'});return;}
  const pos=savedPosition(filename);if(pos?.id&&document.getElementById(pos.id)){
   const node=document.getElementById(pos.id);restoreTarget={id:pos.id,offset:Math.min(pos.offset||0,Math.max(0,node.offsetHeight-100))};jump(restoreTarget.id,restoreTarget.offset);toast('Returned to your last reading position.');
  }
 }
 // Image dimensions must settle before restoring an intra-card position.
 const images=cards.flatMap(c=>Array.from(c.querySelectorAll('img')));
 Promise.race([Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});}))),new Promise(r=>setTimeout(r,2500))]).then(()=>requestAnimationFrame(restore));
 function save(){if(!interacted)return;const header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dl-header'))||70;let chosen;
  for(const card of cards){if(card.getBoundingClientRect().top<=header+80)chosen=card;}
  if(!chosen)return;
  const all=store.get('dl_reading_v1',{});all[filename]={id:chosen.id,offset:Math.max(0,header+16-chosen.getBoundingClientRect().top),updatedAt:Date.now()};
  const ordered=Object.entries(all).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,180);
  if(store.set('dl_reading_v1',Object.fromEntries(ordered)))store.set('dl_last_read',filename);
 }
 let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(save,250);},{passive:true});addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
 addEventListener('hashchange',()=>{try{jump(decodeURIComponent(location.hash.slice(1)));}catch(_){}});
 // Capture before the old per-page handlers with hard-coded scroll offsets.
 document.addEventListener('click',event=>{const a=event.target.closest('a[href^="#"]');if(!a)return;let id;try{id=decodeURIComponent(a.getAttribute('href').slice(1));}catch(_){return;}if(!document.getElementById(id))return;event.preventDefault();event.stopImmediatePropagation();history.pushState(null,'','#'+encodeURIComponent(id));jump(id);},true);
}
async function share(){const url=new URL(filename,base);url.hash=location.hash;
 try{if(navigator.share)await navigator.share({title:document.title,url:url.href});else{await navigator.clipboard.writeText(url.href);toast('Link copied.');}}catch(e){if(e.name!=='AbortError')toast('Sharing unavailable. Copy the address from your browser.');}}
let printState=[];
function expandPrint(){if(printState.length)return;printState=Array.from(document.querySelectorAll('.card details,.spark-section details,footer details,.dl-spark-fold')).map(d=>[d,d.open]);printState.forEach(([d])=>d.open=true);}
function restorePrint(){printState.forEach(([d,open])=>d.open=open);printState=[];}
window.addEventListener('beforeprint',expandPrint);window.addEventListener('afterprint',restorePrint);
function init(){
 document.body.classList.add('dl-enhanced');if(isEdition)document.body.classList.add('dl-reading');if(filename==='bookmarks.html')document.body.classList.add('dl-saved');
 const bar=el('header',{class:'dl-bar'});
 const brand=el('a',{class:'dl-brand',href:'index.html'},'Daily Learning');bar.append(brand);
 const actions=el('div',{class:'dl-actions'});actions.append(el('a',{href:'bookmarks.html'},'Saved'));
 const menu=el('details',{class:'dl-menu'});menu.append(el('summary',{},'Settings'));
 const panel=el('div',{class:'dl-menu-panel'});
 const theme=el('label',{},'Appearance');const select=el('select',{'aria-label':'Appearance'});for(const t of ['system','light','dark'])select.append(el('option',{value:t},t[0].toUpperCase()+t.slice(1)));select.value=prefs.theme||'system';select.onchange=()=>{prefs.theme=select.value;applyPrefs();};theme.append(select);panel.append(theme);
 const size=el('label',{},'Reading text');const sizes=el('select',{'aria-label':'Reading text size'});for(const n of [18,20,22])sizes.append(el('option',{value:n},n+' px'+(n===18?' · Standard':n===20?' · Larger':' · Largest')));sizes.value=prefs.font||18;sizes.onchange=()=>{prefs.font=+sizes.value;applyPrefs();};size.append(sizes);panel.append(size);
 if(isEdition){panel.append(el('hr'));const dl=el('button',{type:'button'},'Download text for offline');dl.onclick=()=>download(filename,dl).catch(()=>{});panel.append(dl,el('p',{},'Keeps text and reading controls on this device. Images need internet. Up to 7 editions; oldest replaced first.'));
 const pdf=el('button',{type:'button'},'Export PDF');pdf.onclick=()=>{menu.open=false;expandPrint();window.print();};const send=el('button',{type:'button'},'Share this edition');send.onclick=share;panel.append(pdf,send);
 }
 panel.append(el('a',{href:'bookmarks.html#sync-settings'},'Bookmark sync & backups'),el('a',{href:'index.html#install'},'Install on your phone'),el('p',{},'Reading position, preferences and downloads stay on this device. Only bookmarks use optional cross-device sync.'));
 menu.append(panel);actions.append(menu);bar.append(actions);document.body.prepend(bar);
 const skip=el('a',{class:'dl-skip',href:'#dl-main'},'Skip to content');document.body.prepend(skip);
 const main=$('main')||$('.content')||$('.container');if(main&&!main.id)main.id='dl-main';
 const status=el('div',{class:'dl-statusbar'});status.append(el('p',{class:'dl-state',id:'dl-network','aria-live':'polite'},navigator.onLine?'Online':'Offline · downloaded text available'));
 const update=el('button',{id:'dl-update',type:'button',hidden:''},'Update available · Reload');update.onclick=()=>{if(registration?.waiting){acceptUpdate=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}};status.append(el('p',{class:'dl-state',id:'dl-download-state'}),update);bar.after(status);
 const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--dl-header',bar.getBoundingClientRect().height+'px'));observer.observe(bar);
 document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.open=false;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;$('summary',menu).focus();}});
 if(isEdition){
  const date=filename.match(/\d{4}-\d{2}-\d{2}/)[0];const title=el('div',{class:'dl-edition-title'});title.append(el('p',{class:'dl-eyebrow'},'THE DAILY EDITION'),el('h1',{},dateLabel(date)),el('p',{},'Explore at your own pace. Your place is remembered on this device.'));status.after(title);
  const cards=Array.from(document.querySelectorAll('.card[id]')).sort((a,b)=>Number(a.id.replace('card-',''))-Number(b.id.replace('card-','')));
  const topicbar=el('nav',{class:'dl-topicbar','aria-label':'Edition navigation'});
  topicbar.append(el('a',{href:'index.html#archive'},'Archive'));title.after(topicbar);
  topicNavigation(cards);
  const featured=el('section',{class:'dl-featured','aria-label':'Suggested starting points',hidden:''});topicbar.after(featured);renderFeatured(document,'',featured);
  const spark=$('.spark-section');if(spark){const fold=el('details',{class:'dl-spark-fold'});fold.append(el('summary',{},'Revisit the previous edition'));spark.before(fold);fold.append(spark);}
  cards.forEach(card=>{const b=$('.bm-btn',card);if(b){b.title='Bookmark this card';b.setAttribute('aria-label','Bookmark: '+($('h2',card)?.textContent.trim()||'card'));}card.querySelectorAll('img').forEach(img=>{
   const fallback=()=>{img.style.display='none';img.closest('.card-img-wrap')?.classList.add('dl-image-unavailable');if(!img.nextElementSibling?.classList.contains('dl-image-note'))img.after(el('p',{class:'dl-image-note'},'Image unavailable'+(!navigator.onLine?' offline':'')+'. Article text remains available.'));};img.addEventListener('error',fallback);if(img.complete&&!img.naturalWidth)fallback();
  });});
  readingPosition(cards);
  window.briefingSave=()=>download(filename).catch(()=>{});window.briefingShare=share;
  const adjacent=el('span',{class:'dl-adjacent'});topicbar.append(adjacent);
  publicationData().then(({list})=>{const i=list.findIndex(e=>e.url===filename);if(i>0)adjacent.append(el('a',{href:list[i-1].url},'← Previous'));if(i>=0&&i<list.length-1)adjacent.append(el('a',{href:list[i+1].url},'Next →'));});
  const downloadState=()=>downloads().then(rows=>{$('#dl-download-state').textContent=rows.some(r=>r.file===filename)?'Text downloaded on this device':'';});
  document.addEventListener('dl:worker',downloadState);document.addEventListener('dl:downloads',downloadState);
 }
 if(filename==='bookmarks.html'){
  const sync=$('.sync');if(sync){const fold=el('details',{id:'sync-settings'});fold.append(el('summary',{},'Sync settings'));sync.before(fold);fold.append(sync);const reveal=()=>{if(location.hash==='#sync-settings')fold.open=true;};reveal();addEventListener('hashchange',reveal);}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(isEdition)publicationData();else if(filename==='index.html')document.dispatchEvent(new Event('dl:refresh'));}});
 addEventListener('offline',()=>connectivity(true));addEventListener('online',()=>{publicationData().then(()=>document.dispatchEvent(new Event('dl:refresh')));});
 if('serviceWorker'in navigator&&isSecureContext){
  navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'}).then(reg=>{
   registration=reg;const show=()=>{update.hidden=!(reg.waiting&&navigator.serviceWorker.controller);};show();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',show);});document.dispatchEvent(new Event('dl:worker'));
  }).catch(()=>{toast('Offline setup unavailable. Reading online still works.');});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(acceptUpdate)location.reload();else update.hidden=true;});
 }
}
window.DL={el,store,hktDate,dateLabel,publicationData,savedPosition,downloads,download,message,toast,renderFeatured};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
