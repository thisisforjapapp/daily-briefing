#!/usr/bin/env python3
"""Supplement 17 missing series episode IDs from channel public search, metadata only."""
import concurrent.futures,json,re,urllib.parse,urllib.request
from pathlib import Path
OUT=Path("qimen_series_index");OUT.mkdir(exist_ok=True)
MISSING=[8,20,26,28,30,33,36,37,38,40,41,43,46,47,48,49,50]
def recurse(x,a):
    if isinstance(x,dict):
        v=x.get("videoRenderer")
        if isinstance(v,dict):
            title="".join(i.get("text","") for i in v.get("title",{}).get("runs",[]))
            if title and v.get("videoId"):a.append((v.get("videoId"),title))
        for z in x.values():recurse(z,a)
    elif isinstance(x,list):
        for z in x:recurse(z,a)
def do(n):
    url="https://www.youtube.com/@mounttriohk/search?query="+urllib.parse.quote(f"EP{n:02d}")
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36"})
        with urllib.request.urlopen(req,timeout=20) as res:raw=res.read(3000000).decode("utf8","replace")
        m=re.search(r'(?:var\s+)?ytInitialData\s*=\s*(\{.*?\})\s*;\s*(?:</script>|var|\n)',raw,re.S)
        if not m:return {"ep":n,"status":"no_metadata"}
        a=[];recurse(json.loads(m.group(1)),a)
        exact=[(vid,t) for vid,t in a if "慧李" in t and re.search(rf"(?i)\bEP\s*[-]?\s*0?{n}(?!\d)",t)]
        if exact:return {"ep":n,"status":"found","id":exact[0][0],"title":exact[0][1]}
        return {"ep":n,"status":"no_match","sample_titles":[t[:55] for _,t in a[:3]]}
    except Exception as e:return {"ep":n,"status":"error","error":str(e)[:150]}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:rows=list(ex.map(do,MISSING))
for r in rows: print("CHECK",f"EP{r['ep']:02d}",r["status"],r.get("id",""),r.get("title",""),r.get("sample_titles",""),flush=True)
(OUT/"missing_ep_checks.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf8")
