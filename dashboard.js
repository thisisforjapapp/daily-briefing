(function(){
'use strict';
const {el,store,hktDate,dateLabel}=DL;
let entries=[],month=hktDate().slice(0,7),latestFile='';
const $=s=>document.querySelector(s);
let installPrompt;
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install-app').hidden=false;});
$('#install-app').onclick=async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;$('#install-app').hidden=true;try{await prompt.prompt();const result=await prompt.userChoice;$('#install-status').textContent=result.outcome==='accepted'?'Installation requested. Follow your browser’s confirmation.':'You can install later or keep reading in your browser.';}catch(_){$('#install-status').textContent='Use the browser instructions below to install.';}};
addEventListener('appinstalled',()=>{installPrompt=null;$('#install-app').hidden=true;$('#install-status').textContent='Daily Learning installed.';});
function ordered(data){return data.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&/^daily-learning-\d{4}-\d{2}-\d{2}(?:-\d+)?\.html$/.test(e.url)).sort((a,b)=>a.date.localeCompare(b.date)||(a.edition||1)-(b.edition||1));}
async function titles(file){const list=$('#edition-topics');list.replaceChildren();$('#featured-latest').hidden=true;$('#featured-latest').replaceChildren();$('#topics-note').textContent='Loading the edition’s topics…';
try{const r=await fetch(file);if(!r.ok)throw 0;const doc=new DOMParser().parseFromString(await r.text(),'text/html');if(latestFile!==file)return;
const cards=Array.from(doc.querySelectorAll('.card[id]'));if(!cards.length)throw 0;
DL.renderFeatured(doc,file,$('#featured-latest'));
for(const [i,card]of cards.entries()){const heading=card.querySelector('h2');if(!heading)continue;const li=el('li'),a=el('a',{href:file+'#'+encodeURIComponent(card.id)}),text=el('span');text.append(el('small',{},card.querySelector('.card-label')?.textContent.trim()||'Topic '+(i+1)),el('strong',{},heading.textContent.trim()));a.append(el('span',{class:'dl-number'},String(i+1).padStart(2,'0')),text);li.append(a);list.append(li);}
$('#topics-note').textContent=cards.length+' topics · choose where to begin';
}catch(_){$('#topics-note').textContent='Topic titles are unavailable offline until this edition is downloaded. You can still open an available edition.';}}
function render(data,cached){entries=ordered(data);const today=hktDate(),available=entries.filter(e=>e.date<=today),latest=available.at(-1);
$('#freshness').textContent=latest?(latest.date===today?'Today’s edition · '+dateLabel(latest.date):'No new edition today · Latest: '+dateLabel(latest.date)):'No published editions available.';
if(cached)$('#freshness').textContent+=' · Saved listing; reconnect to check for newer editions.';
const checked=store.get('dl_last_checked',null);$('#last-checked').textContent=checked?'Last checked '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(checked))+' HKT':'Publication status has not been checked online.';
if(latest){$('#read-latest').hidden=false;$('#read-latest').href=latest.url+'?start=1';$('#read-latest').textContent='Start edition →';$('#stamp-day').textContent=latest.date.slice(8);$('#stamp-month').textContent=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Hong_Kong'}).format(new Date(latest.date+'T12:00:00+08:00'));
if(latest.url!==latestFile||!cached){latestFile=latest.url;titles(latest.url);}}
const last=store.get('dl_last_read',''),pos=DL.savedPosition(last),entry=entries.find(e=>e.url===last);const resume=$('#continue-reading');resume.hidden=!(entry&&pos?.id);if(entry&&pos?.id){resume.href=entry.url+'?resume=1';resume.textContent='Continue reading →';resume.setAttribute('aria-label','Continue reading '+dateLabel(entry.date));}
renderCalendar();}
function renderCalendar(){const [year,m]=month.split('-').map(Number);$('#calendar-title').textContent=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,m-1,1)));
const min=entries[0]?.date.slice(0,7)||hktDate().slice(0,7),max=[hktDate().slice(0,7),entries.at(-1)?.date.slice(0,7)||''].sort().at(-1);
$('#previous-month').disabled=month<=min;$('#next-month').disabled=month>=max;
const grid=$('#calendar-grid');grid.replaceChildren();$('#edition-choice').hidden=true;
const pad=new Date(Date.UTC(year,m-1,1)).getUTCDay(),days=new Date(Date.UTC(year,m,0)).getUTCDate();for(let i=0;i<pad;i++)grid.append(el('span'));
for(let d=1;d<=days;d++){const date=month+'-'+String(d).padStart(2,'0'),matches=entries.filter(e=>e.date===date),cell=el('div',{class:'dl-cell'+(date===hktDate()?' today':'')});
if(matches.length){const a=el('a',{href:matches.at(-1).url,'aria-label':dateLabel(date)+(matches.length>1?' · '+matches.length+' editions':'')},String(d));cell.append(a);if(matches.length>1){cell.append(el('small',{},'×'+matches.length));a.onclick=e=>{e.preventDefault();const choice=$('#edition-choice');choice.hidden=false;choice.replaceChildren(el('strong',{},dateLabel(date)));for(const item of matches)choice.append(el('a',{href:item.url},'Edition '+(item.edition||1)));choice.focus();};}}else{cell.classList.add('blank');cell.textContent=d;}grid.append(cell);}
}
function step(amount){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+amount,1));month=d.toISOString().slice(0,7);renderCalendar();}
async function offlineList(){const rows=await DL.downloads();const target=$('#offline-list');target.replaceChildren();if(!rows.length){target.append(el('p',{},'No downloaded editions on this device. Open an edition and choose Settings → Download text for offline.'));return;}
for(const row of rows.slice().reverse()){const item=el('div',{class:'dl-offline-row'}),a=el('a',{href:row.file},dateLabel(row.date));a.append(el('small',{},'Text & reading controls · images online'));const remove=el('button',{type:'button','aria-label':'Remove download for '+dateLabel(row.date)},'Remove');remove.onclick=async()=>{try{await DL.message('REMOVE_DOWNLOAD',row.file);DL.toast('Offline copy removed. Bookmarks are unchanged.');offlineList();}catch(e){DL.toast(e.message);}};item.append(a,remove);target.append(item);}}
function revealHash(){if(['#archive','#install'].includes(location.hash)){$(location.hash).open=true;requestAnimationFrame(()=>$(location.hash).scrollIntoView());}}
async function refresh(){const result=await DL.publicationData();if(result.list.length)render(result.list,result.cached);}
try{render(JSON.parse($('#bdata').textContent),true);}catch(_){render([],true);}
$('#previous-month').onclick=()=>step(-1);$('#next-month').onclick=()=>step(1);
addEventListener('hashchange',revealHash);revealHash();
document.addEventListener('dl:downloads',offlineList);document.addEventListener('dl:worker',offlineList);document.addEventListener('dl:refresh',refresh);addEventListener('pageshow',refresh);refresh();offlineList();
})();
