#!/usr/bin/env python3
"""Build a fact-only 50-episode inventory using public YouTube search metadata."""
import concurrent.futures,json,re,urllib.parse,urllib.request,time
from pathlib import Path

ROOT="https://www.youtube.com/results?search_query="
SERIES="奇門慧李解盤"
OUT=Path("qimen_series_index")
OUT.mkdir(exist_ok=True)

def parse(item,out):
    if isinstance(item,dict):
        vr=item.get("videoRenderer")
        if isinstance(vr,dict):
            vid=vr.get("videoId")
            runs=vr.get("title",{}).get("runs",[])
            title="".join(x.get("text","") for x in runs)
            owner="".join(x.get("text","") for x in vr.get("ownerText",{}).get("runs",[]))
            if vid and title:out.append({"id":vid,"title":title,"owner":owner})
        for v in item.values():parse(v,out)
    elif isinstance(item,list):
        for v in item:parse(v,out)

def one(n):
    query=f"{SERIES} EP{n:02d} 三坐山"
    req=urllib.request.Request(ROOT+urllib.parse.quote(query),
      headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"})
    try:
        with urllib.request.urlopen(req,timeout=20) as f: raw=f.read(2500000).decode("utf8","replace")
        m=re.search(r'(?:var\s+)?ytInitialData\s*=\s*(\{.*?\})\s*;\s*(?:</script>|var|\n)',raw,re.S)
        if not m:return {"ep":n,"status":"no_metadata"}
        vals=[]
        parse(json.loads(m.group(1)),vals)
        def is_ep(x):
            if SERIES not in x["title"]:return False
            return bool(re.search(rf"(?i)\bEP\s*[-]?\s*0?{n}(?!\d)",x["title"]))
        matches=[v for v in vals if is_ep(v)]
        matches.sort(key=lambda v:("三坐山" not in v["owner"],len(v["title"])))
        if matches:return {"ep":n,"status":"found",**matches[0],"other_matches":len(matches)-1}
        return {"ep":n,"status":"no_exact_match","videos":len(vals)}
    except Exception as e:return {"ep":n,"status":"error","error":f"{type(e).__name__}: {str(e)[:120]}"}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    results=list(pool.map(one,range(1,51)))
for r in results:
    print(f"EP{r['ep']:02d} {r['status']} {r.get('id','')} {r.get('title','')[:145]}",flush=True)
(OUT/"series_ep01_ep50.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf8")
with (OUT/"series_ep01_ep50.csv").open("w",encoding="utf-8") as f:
    import csv
    writer=csv.writer(f);writer.writerow(["EP","status","title","YouTube link"])
    for x in results: writer.writerow([x["ep"],x["status"],x.get("title",""),"https://www.youtube.com/watch?v="+x["id"] if x.get("id") else ""])
print("FOUND TOTAL",sum(x["status"]=="found" for x in results),"/50",flush=True)
