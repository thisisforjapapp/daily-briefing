"""Resumeable Qwen ASR with source audio windows, without credentials.

Window boundaries are audio offsets, not word-level timestamps. Raw output
must be checked before it supports a claim about the speaker's method.
"""
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

os.environ.setdefault("HF_HOME", "/private/tmp/qimen-hf-cache")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--source", required=True)
    p.add_argument("--device", default="mps")
    p.add_argument("--window", type=int, default=60)
    args = p.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_asr import Qwen3ASRModel
    args.output.mkdir(parents=True, exist_ok=True)
    wav = args.output / "audio16k.wav"
    if not wav.exists():
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-i", str(args.audio), "-ar", "16000", "-ac", "1", str(wav)], check=True)
    samples, sr = sf.read(wav, dtype="float32")
    digest = hashlib.sha256(args.audio.read_bytes()).hexdigest()
    model_id = "Qwen/Qwen3-ASR-0.6B"
    print("Loading", model_id, args.device, flush=True)
    model = Qwen3ASRModel.from_pretrained(model_id, device_map=args.device,
        dtype=torch.float32, max_inference_batch_size=1, max_new_tokens=1200)
    total = int(np.ceil(len(samples) / sr / args.window))
    for i in range(total):
        dest = args.output / f"segment-{i:04d}.json"
        start = max(0, i * args.window - (1 if i else 0))
        end = min(len(samples) / sr, (i + 1) * args.window)
        if dest.exists():
            old = json.loads(dest.read_text())
            if old.get("audio_sha256") != digest or old.get("window_start") != start:
                raise RuntimeError("Checkpoint belongs to different audio or window settings")
            continue
        began = time.monotonic()
        result = model.transcribe(audio=(samples[int(start*sr):int(end*sr)], sr), language="Cantonese")
        if len(result) != 1:
            raise RuntimeError("Unexpected output count")
        data = {"source": args.source, "audio_sha256": digest, "model": model_id,
            "model_revision": getattr(model.model.config, "_commit_hash", None),
            "window_start": start, "window_end": end,
            "timestamp_kind": "audio window; 1 second overlap; not word-aligned",
            "status": "raw ASR; not independently checked against audio",
            "elapsed_seconds": round(time.monotonic()-began, 2), "text": result[0].text}
        tmp = dest.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(dest)
        print(f"Saved {i+1}/{total}, window {start}-{end}s, processing {data['elapsed_seconds']}s", flush=True)
    manifest = {"source":args.source,"audio_sha256":digest,"duration":len(samples)/sr,
        "segments":total,"status":"ASR complete; manual content verification pending"}
    (args.output / "manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    print("EPISODE ASR COMPLETE", flush=True)

if __name__ == "__main__":
    main()
