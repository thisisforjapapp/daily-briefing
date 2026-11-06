#!/usr/bin/env python3
"""Read public Bilibili video-search metadata only; no login, no private API."""
import urllib.request,urllib.parse,urllib.error,json,re,html
KEYWORD="奇門慧李解盤"
base="https://api.bilibili.com/x/web-interface/search/type"
rows=[]
for page in [1,2,3]:
    url=base+"?"+urllib.parse.urlencode({"search_type":"video","keyword":KEYWORD,"page":page,"page_size":20})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36","Referer":"https://www.bilibili.com/"})
    try:
        with urllib.request.urlopen(req,timeout=14) as res: s=res.read(3000000).decode("utf-8","replace")
        obj=json.loads(s); data=obj.get("data") or {}
        print("PAGE",page,"code",obj.get("code"),"message",obj.get("message"),"num",len(data.get("result") or []),flush=True)
        for x in data.get("result") or []:
            title=html.unescape(re.sub(r"<[^>]+>","",x.get("title","")))
            if KEYWORD in title:
                item={"title":title,"bvid":x.get("bvid"),"author":x.get("author"),"url":"https://www.bilibili.com/video/"+x.get("bvid","")}
                rows.append(item)
                print("MATCH",item,flush=True)
        if not data.get("result"): break
    except Exception as e:print("ERROR",page,type(e).__name__,str(e)[:160],flush=True)
print("TOTAL",len(rows),flush=True)
