#!/usr/bin/env python3
"""Independent Qwen3-ASR Cantonese inference smoke test; NOT podcast EP01."""
import json, subprocess
from pathlib import Path

AUDIO = "https://upload.wikimedia.org/wikipedia/commons/3/39/Zh-yue-%E8%AA%9E%E9%9F%B3%E5%AD%B8.ogg"
SOURCE = "https://commons.wikimedia.org/wiki/File:Zh-yue-%E8%AA%9E%E9%9F%B3%E5%AD%B8.ogg"
OUT = Path("qimen_cantonese_smoketest")

def run(*args,timeout=100):
    subprocess.run(list(args), check=True,timeout=timeout)

def main():
    OUT.mkdir(exist_ok=True)
    audio=OUT/"sample.ogg"
    wav=OUT/"sample_20s.wav"
    run("curl","-fLsS","--retry","2","--max-time","45",AUDIO,"-o",str(audio))
    run("ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(audio),
        "-t","20","-ar","16000","-ac","1",str(wav))
    import torch
    from qwen_asr import Qwen3ASRModel
    model_name="Qwen/Qwen3-ASR-0.6B"
    print("Loading",model_name,"on CPU",flush=True)
    model=Qwen3ASRModel.from_pretrained(model_name,device_map="cpu",dtype=torch.float32,
                                         max_inference_batch_size=1,max_new_tokens=256)
    results=model.transcribe(audio=str(wav),language="Cantonese")
    if len(results)!=1:
        raise RuntimeError("Incorrect ASR output count")
    transcript=str(results[0].text).strip()
    if not transcript:
        raise RuntimeError("Model returned empty transcript")
    meta={"test":"Public Cantonese audio independent of EP01","audio_source":SOURCE,
          "model":model_name,"language":"Cantonese","clip_seconds":20,
          "transcript":transcript,"status":"Unverified raw model output"}
    (OUT/"result.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf8")
    (OUT/"result.txt").write_text(transcript+"\n",encoding="utf8")
    print("ASR TEST TEXT:",transcript,flush=True)
if __name__=="__main__":
    main()
