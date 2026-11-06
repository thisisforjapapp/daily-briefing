#!/usr/bin/env python3
"""45s Cantonese ASR test for public Qimen podcast EP01, no repo writes."""
import json
import subprocess
from pathlib import Path

VIDEO_ID = "UZ9W_aFs_-U"
URL = "https://www.youtube.com/watch?v=" + VIDEO_ID
OUT = Path("qimen_ep01_results")
def run(cmd):
    print("Running", cmd[0], flush=True)
    subprocess.run(cmd, check=True, timeout=360)
def main():
    OUT.mkdir(exist_ok=True)
    run(["yt-dlp","--no-playlist","--no-progress","--socket-timeout","20","--retries","2",
         "--download-sections","*00:00:00-00:00:45","-f","bestaudio/best",
         "-o",str(OUT/"ep01_clip.%(ext)s"),URL])
    media=[p for p in OUT.glob("ep01_clip.*") if p.suffix in {".m4a",".mp4",".webm",".opus",".mp3",".wav"}]
    if not media: raise RuntimeError("Audio download failed")
    wav=OUT/"ep01_first45s.wav"
    run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(media[0]),
         "-t","45","-ar","16000","-ac","1",str(wav)])
    import torch
    from qwen_asr import Qwen3ASRModel
    model_name="Qwen/Qwen3-ASR-0.6B"
    model=Qwen3ASRModel.from_pretrained(model_name,device_map="cpu",dtype=torch.float32,
                                         max_inference_batch_size=1,max_new_tokens=1024)
    results=model.transcribe(audio=str(wav),language="Cantonese")
    if len(results)!=1: raise RuntimeError("Unexpected ASR result count")
    txt=str(results[0].text).strip()
    data={"source":URL,"model":model_name,"language_hint":"Cantonese",
          "start":"00:00:00","end":"00:00:45","transcript":txt,
          "note":"Raw unverified ASR; not manually checked."}
    (OUT/"ep01_first45s.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf8")
    (OUT/"ep01_first45s.txt").write_text(txt+"\n",encoding="utf8")
    print("EP01 ASR:",txt[:600],flush=True)
if __name__=="__main__":
    main()
