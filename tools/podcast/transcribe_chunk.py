#!/usr/bin/env python3
"""1つの音声チャンクを faster-whisper で文字起こしする。

usage: transcribe_chunk.py CHUNK.wav（16kHz・モノラル・16bit） OFFSET_SEC OUT.json [--model M] [--language ja|auto]
"""
import argparse
import json
import time
import wave

import numpy as np

from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument("audio")
ap.add_argument("offset", type=float)
ap.add_argument("out")
ap.add_argument("--model", default="large-v3-turbo")
ap.add_argument("--language", default="auto")
a = ap.parse_args()

t0 = time.time()
model = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=0)
with wave.open(a.audio) as w:  # 16kHz/mono/16bit の wav を直接読む（PyAV を使わない）
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
segments, info = model.transcribe(
    pcm,
    language=None if a.language == "auto" else a.language,
    beam_size=1,
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 500},
    condition_on_previous_text=False,
    language_detection_segments=4,
)
out = []
for s in segments:
    out.append({"start": round(s.start + a.offset, 2), "end": round(s.end + a.offset, 2), "text": s.text.strip()})
json.dump(
    {"language": info.language, "offset": a.offset, "elapsed_sec": round(time.time() - t0, 1), "segments": out},
    open(a.out, "w"),
    ensure_ascii=False,
)
print(f"done: {len(out)} segments, lang={info.language}, {time.time() - t0:.0f}s")
