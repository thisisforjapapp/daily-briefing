#!/usr/bin/env python3
"""Check only public video metadata/caption-track discovery; no login or cookies."""
import json,re,urllib.request,urllib.error
VIDEO="UZ9W_aFs_-U"
urls=[
 "https://www.youtube.com/watch?v="+VIDEO,
 "https://www.youtube.com/embed/"+VIDEO,
 "https://m.youtube.com/watch?v="+VIDEO,
 "https://pipedapi.adminforge.de/streams/"+VIDEO,
 "https://pipedapi.kavin.rocks/streams/"+VIDEO,
]
for url in urls:
    print("Checking",url,flush=True)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req,timeout=12) as res:
            body=res.read(4000000).decode("utf8","replace")
            print("HTTP",res.status,"bytes",len(body),"captionTracks",body.find("captionTracks"),"captions",body.find('"captions"'),"preview",body[:250].replace("\n"," "),flush=True)
            if "captionTracks" in body:
                ix=body.find("captionTracks")
                print("CAPTIONTRACKS_CONTEXT",body[max(0,ix-80):ix+1300].replace("\n"," "),flush=True)
            if "pipedapi" in url:
                try:
                    parsed=json.loads(body)
                    print("PIPED_CAPTIONS",str(parsed.get("subtitles",[]))[:1700],flush=True)
                except: pass
    except Exception as exc:
        print("FAILED",type(exc).__name__,str(exc)[:280],flush=True)
