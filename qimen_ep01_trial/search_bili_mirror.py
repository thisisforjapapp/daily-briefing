#!/usr/bin/env python3
"""Locate public series cross-posts via public Bilibili search API. No cookies."""
import urllib.request,urllib.parse,urllib.error,json,re,html,time
KEYWORDS=["识别真命天子","靈異體質怎分辨","奇门慧李解盘","李sir  林慧美  奇门"]
for key in KEYWORDS:
    url="https://api.bilibili.com/x/web-interface/search/type?"+urllib.parse.urlencode({"search_type":"video","keyword":key,"page":1})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36","Referer":"https://www.bilibili.com/"})
    try:
        with urllib.request.urlopen(req,timeout=14) as res: s=res.read(3000000).decode("utf-8","replace")
        obj=json.loads(s); data=obj.get("data") or {}
        print("QUERY",key,"code",obj.get("code"),"result_count",len(data.get("result") or []),flush=True)
        for x in (data.get("result") or [])[:20]:
            title=html.unescape(re.sub(r"<[^>]+>","",x.get("title","")))
            if any(word in title for word in ["奇門","奇门","真命","靈異","灵异"]):
                print("FOUND",{"title":title,"bvid":x.get("bvid"),"author":x.get("author"),"url":"https://www.bilibili.com/video/"+str(x.get("bvid") or "")},flush=True)
    except Exception as e:print("ERROR",key,type(e).__name__,str(e)[:160],flush=True)
    time.sleep(1)
