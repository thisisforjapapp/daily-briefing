#!/usr/bin/env python3
"""Supplement missing public video IDs; match English-translated as well as Chinese titles."""
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
    out=[]
    for query in (f"EP{n:02d}",f"奇門慧李解盤 EP{n:02d}"):
        url="https://www.youtube.com/@mounttriohk/search?query="+urllib.parse.quote(query)+"&hl=zh-HK"
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36","Accept-Language":"zh-HK,zh;q=0.9,en;q=0.5"})
            with urllib.request.urlopen(req,timeout=20) as res:raw=res.read(3000000).decode("utf8","replace")
            m=re.search(r'(?:var\s+)?ytInitialData\s*=\s*(\{.*?\})\s*;\s*(?:</script>|var|\n)',raw,re.S)
            if not m:continue
            a=[];recurse(json.loads(m.group(1)),a)
            exact=[(vid,t) for vid,t in a if re.search(rf"(?i)\bEP\s*[-]?\s*0?{n}(?!\d)",t) and re.search(r"(?:慧李|奇門|奇门|Qi\s*Men|Qimen|Hui\s*Li|Huili)",t,re.I)]
            if exact:
                return {"ep":n,"status":"found","id":exact[0][0],"title":exact[0][1],"query":query}
            out.extend(t[:100] for _,t in a)
        except Exception as e:out.append(f"{type(e).__name__}:{str(e)[:100]}")
    return {"ep":n,"status":"no_match","sample_titles":out[:5]}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:rows=list(ex.map(do,MISSING))
for r in rows:print("CHECK",f"EP{r['ep']:02d}",r["status"],r.get("id",""),r.get("title",""),r.get("sample_titles",""),flush=True)
(OUT/"missing_ep_checks_v2.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf8")
