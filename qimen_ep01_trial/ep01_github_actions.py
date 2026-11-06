#!/usr/bin/env python3
"""Public EP01 short Cantonese ASR; downloads only public media; no credentials."""
import argparse
import json
import subprocess
from pathlib import Path

VIDEO_ID = "UZ9W_aFs_-U"
URL = "https://www.youtube.com/watch?v=" + VIDEO_ID
OUT = Path("qimen_ep01_results")

def media_files():
    return [p for p in OUT.glob("ep01_clip.*") if p.suffix.lower() in {".m4a",".mp4",".webm",".opus",".mp3",".wav"}]

def download_audio():
    existing = media_files()
    if existing:
        print("Audio exists", existing[0], flush=True)
        return existing[0]
    common = ["yt-dlp","--js-runtimes","node","--remote-components","ejs:github",
              "--no-playlist","--no-progress","--socket-timeout","20","--retries","1",
              "--download-sections","*00:00:00-00:00:45","-f","bestaudio/best",
              "-o",str(OUT/"ep01_clip.%(ext)s")]
    attempts=[[],["--extractor-args","youtube:player_client=tv,web_safari"]]
    for i,extra in enumerate(attempts,1):
        print(f"Public-video download attempt {i}/{len(attempts)}",flush=True)
        try:
            subprocess.run(common + extra + [URL], check=True, timeout=120)
        except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
            print("Public download unavailable:",str(exc)[:400],flush=True)
            continue
        found=media_files()
        if found:
            return found[0]
    raise RuntimeError("No public audio available after official yt-dlp/EJS attempts; stopping without cookies")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--download-only",action="store_true")
    args=p.parse_args()
    OUT.mkdir(exist_ok=True)
    src=download_audio()
    if args.download_only:
        print("Public EP01 audio download OK:",src.name,flush=True)
        return
    wav=OUT/"ep01_first45s.wav"
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(src),
                    "-t","45","-ar","16000","-ac","1",str(wav)],check=True,timeout=60)
    import torch
    from qwen_asr import Qwen3ASRModel
    model_name="Qwen/Qwen3-ASR-0.6B"
    model=Qwen3ASRModel.from_pretrained(model_name,device_map="cpu",dtype=torch.float32,
                                         max_inference_batch_size=1,max_new_tokens=1024)
    results=model.transcribe(audio=str(wav),language="Cantonese")
    if len(results)!=1:
        raise RuntimeError(f"Unexpected ASR result count {len(results)}")
    txt=str(results[0].text).strip()
    data={"source":URL,"model":model_name,"language_hint":"Cantonese",
          "start":"00:00:00","end":"00:00:45","transcript":txt,
          "note":"Raw ASR output; no correction or manual audio verification."}
    (OUT/"ep01_first45s.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf8")
    (OUT/"ep01_first45s.txt").write_text(txt+"\n",encoding="utf8")
    print("EP01 Qwen raw ASR:",txt[:1200],flush=True)
if __name__=="__main__":
    main()
