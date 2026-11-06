#!/usr/bin/env python3
"""Collect publicly visible YouTube video metadata for series; no login or audio."""
import json,re,urllib.request,urllib.parse
from pathlib import Path
OUT=Path("qimen_series_index")
OUT.mkdir(exist_ok=True)
Q="奇門慧李解盤"
urls={
  "search": "https://www.youtube.com/results?search_query="+urllib.parse.quote(Q),
  "channelsearch": "https://www.youtube.com/@mounttriohk/search?query="+urllib.parse.quote(Q),
  "channelvideos": "https://www.youtube.com/@mounttriohk/videos",
  "channelplaylists": "https://www.youtube.com/@mounttriohk/playlists",
}
def recurse(item,out):
    if isinstance(item,dict):
        if "videoRenderer" in item:
            vr=item["videoRenderer"]
            t="".join(x.get("text","") for x in vr.get("title",{}).get("runs",[]))
            vid=vr.get("videoId","")
            if vid:out[vid]={"id":vid,"title":t,"source":"videoRenderer"}
        if "gridVideoRenderer" in item:
            vr=item["gridVideoRenderer"]
            t="".join(x.get("text","") for x in vr.get("title",{}).get("runs",[]))
            vid=vr.get("videoId","")
            if vid:out[vid]={"id":vid,"title":t,"source":"gridVideoRenderer"}
        for x in item.values(): recurse(x,out)
    if isinstance(item,list):
        for x in item: recurse(x,out)
seen={}
for mode,url in urls.items():
    print("FETCH",mode,url,flush=True)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"})
        with urllib.request.urlopen(req,timeout=20) as resp:html=resp.read(6000000).decode("utf8","replace")
        print("BYTES",len(html),"ytInitialData",html.find("ytInitialData"),flush=True)
        m=re.search(r'(?:var\s+)?ytInitialData\s*=\s*(\{.*?\})\s*;\s*(?:</script>|var|\n)',html,re.S)
        if not m:
            ix=html.find("ytInitialData")
            print("CONTEXT",html[ix:ix+300] if ix>=0 else "not found",flush=True)
            continue
        data=json.loads(m.group(1))
        new={}
        recurse(data,new)
        print("FOUND",len(new),flush=True)
        for id,o in new.items():
            if Q in o["title"] or "慧李" in o["title"]:
                seen[id]=o
                print("MATCH",id,o["title"][:150],flush=True)
    except Exception as e: print("ERROR",mode,type(e).__name__,str(e)[:280],flush=True)
(OUT/"public_series_index.json").write_text(json.dumps(list(seen.values()),ensure_ascii=False,indent=2),encoding="utf8")
print("TOTAL MATCHES",len(seen),flush=True)
