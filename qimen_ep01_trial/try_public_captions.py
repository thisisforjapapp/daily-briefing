#!/usr/bin/env python3
"""Fetch public captions via no-key documented endpoints, if available. No YouTube login."""
from pathlib import Path
import urllib.request, urllib.error, json
VIDEO = "UZ9W_aFs_-U"
URLs = {
 "free_transcript_api": f"https://api.freetranscriptapi.com/v1/transcript?video_url={VIDEO}",
 "youtube_transcribe_studio": f"https://youtubetranscribe.khabaroff.studio/transcript/{VIDEO}",
 "transcript_yt": f"https://transcript-yt.com/v1/transcript?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D{VIDEO}",
 "youtube_timedtext_yue": f"https://www.youtube.com/api/timedtext?v={VIDEO}&lang=yue&kind=asr",
 "youtube_timedtext_zh": f"https://www.youtube.com/api/timedtext?v={VIDEO}&lang=zh-HK&kind=asr",
}
OUT=Path("qimen_ep01_results")
OUT.mkdir(parents=True,exist_ok=True)
report=[]
for name,url in URLs.items():
    print(f"Testing {name}",flush=True)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (public caption test; no auth)","Accept":"application/json,text/plain,text/xml,*/*"})
        with urllib.request.urlopen(req,timeout=22) as r:
            body=r.read(6_000_000)
            status=r.status
            ct=r.headers.get("Content-Type","")
        print(f"RESULT {name} HTTP {status} bytes={len(body)} content-type={ct} preview={body[:200]!r}",flush=True)
        row={"provider":name,"http_status":status,"length":len(body),"content_type":ct}
        if len(body)>100 and ("json" in ct or "text/" in ct or body[:1] in (b"{",b"[")):
            suffix=".json" if ("json" in ct or body[:1] in (b"{",b"[")) else ".txt"
            fn=f"{name}{suffix}"
            (OUT/fn).write_bytes(body)
            row["file"]=fn
        report.append(row)
    except urllib.error.HTTPError as e:
        print(f"RESULT {name} HTTP {e.code} preview={e.read(180)!r}",flush=True)
        report.append({"provider":name,"http_status":e.code,"error":"http"})
    except Exception as e:
        print(f"RESULT {name} ERROR {type(e).__name__}: {str(e)[:180]}",flush=True)
        report.append({"provider":name,"error":type(e).__name__,"detail":str(e)[:150]})
(OUT/"caption_probe.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
