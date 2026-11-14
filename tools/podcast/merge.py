#!/usr/bin/env python3
"""チャンクごとの文字起こしをまとめて、episodes/<フォルダ>/ に保存する。

usage: merge.py META.json PARTS_DIR OUT_ROOT
出力: OUT_ROOT/<published>_<episode_key>/{meta.json, transcript.md, segments.json}
最後に作ったフォルダのパスを標準出力に出す。
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone

meta = json.load(open(sys.argv[1]))
parts = sorted(glob.glob(os.path.join(sys.argv[2], "**", "part_*.json"), recursive=True))
segs, langs, cpu = [], [], 0.0
for p in parts:
    d = json.load(open(p))
    segs += d["segments"]
    langs.append(d["language"])
    cpu += d.get("elapsed_sec", 0)
segs.sort(key=lambda s: s["start"])

folder = f"{meta.get('published') or 'undated'}_{meta['episode_key']}"
out = os.path.join(sys.argv[3], folder)
os.makedirs(out, exist_ok=True)


def ts(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60:02d}:{sec % 60:02d}"


# 約60秒ごと、または長めの間（2秒以上）で段落を切る
paras, cur, cur_start, last_end = [], [], None, None
for s in segs:
    if cur and (s["start"] - cur_start >= 60 or (last_end is not None and s["start"] - last_end >= 2.0)):
        paras.append((cur_start, cur))
        cur = []
    if not cur:
        cur_start = s["start"]
    cur.append(s["text"])
    last_end = s["end"]
if cur:
    paras.append((cur_start, cur))

lang = max(set(langs), key=langs.count) if langs else ""
sep = "" if lang in ("ja", "zh") else " "
lines = [
    f"# {meta.get('title', '')}",
    "",
    f"- 番組: {meta.get('podcast', '')}",
    f"- 配信日: {meta.get('published', '')}",
    f"- 元URL: {meta.get('source_url', '')}",
    f"- 言語: {lang} / モデル: {meta.get('model', '')}",
    "",
    "> 自動文字起こし（Whisper）。固有名詞や専門用語の誤変換を含みます。",
    "",
    "## 概要欄",
    "",
    meta.get("description", "").strip() or "（なし）",
    "",
    "## 文字起こし",
    "",
]
for start, texts in paras:
    lines.append(f"**[{ts(start)}]** " + sep.join(texts))
    lines.append("")

meta.update({
    "language": lang,
    "segments": len(segs),
    "chars": sum(len(s["text"]) for s in segs),
    "transcribe_cpu_sec": round(cpu),
    "transcribed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "folder": f"episodes/{folder}",
})
json.dump(meta, open(os.path.join(out, "meta.json"), "w"), ensure_ascii=False, indent=2)
json.dump(segs, open(os.path.join(out, "segments.json"), "w"), ensure_ascii=False)
open(os.path.join(out, "transcript.md"), "w").write("\n".join(lines))
print(out)
