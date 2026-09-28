/* Apply preferences before paint. Separate keys leave existing bookmarks untouched. */
(function(){try{var p=JSON.parse(localStorage.getItem('dl_preferences_v1')||'{}');
if(['light','dark','system'].includes(p.theme))document.documentElement.dataset.theme=p.theme;
if([18,20,22].includes(p.font))document.documentElement.style.setProperty('--dl-font',p.font+'px');
}catch(_){}})();
