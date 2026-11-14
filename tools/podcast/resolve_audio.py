#!/usr/bin/env python3
"""エピソードのURLから、音声ファイルのURLとメタ情報を割り出す。

対応:
  - Pocket Casts (pca.st / pocketcasts.com)
  - Apple Podcasts (podcasts.apple.com/...?i=エピソードID)
  - 音声ファイルの直リンク (.mp3 / .m4a など)
  - 上記以外: ページ内の og:audio / <audio> / enclosure を探し、だめなら yt-dlp に任せる

出力: JSON を標準出力に1つ
  {audio_url, title, podcast, published, duration_sec, description, source_url, episode_key}
"""
import hashlib
import html
import json
import re
import subprocess
import sys
import urllib.parse

import requests

UA = {"User-Agent": "Mozilla/5.0 (wine-ai-commons podcast-notes; +https://github.com/winegrowers-commons/wine-ai-commons)"}
AUDIO_EXT = re.compile(r"\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?|$)", re.I)
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def key_of(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()[:10]


def strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>|</p>", "\n", s or "", flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def pocketcasts(url: str):
    r = requests.get(url, headers=UA, allow_redirects=True, timeout=30)
    final = urllib.parse.unquote(r.url)
    uuids = re.findall(UUID, final)
    ep_uuid = uuids[-1] if uuids else None
    pod_uuid = uuids[-2] if len(uuids) >= 2 else None
    if not pod_uuid:
        m = re.search(r"podcast/(?:[^/]+/)?(" + UUID + ")", r.text)
        pod_uuid = m.group(1) if m else None
    if not (ep_uuid and pod_uuid):
        return None
    data = requests.get(f"https://podcast-api.pocketcasts.com/podcast/full/{pod_uuid}", headers=UA, timeout=30).json()
    pod = data.get("podcast", {})
    ep = next((e for e in pod.get("episodes", []) if e.get("uuid") == ep_uuid), None)
    if not ep:
        return None
    desc = ""
    for notes_url in (
        f"https://podcast-api.pocketcasts.com/mobile/show_notes/full/{pod_uuid}",
        f"https://cache.pocketcasts.com/mobile/show_notes/full/{pod_uuid}",
    ):
        try:
            nd = requests.get(notes_url, headers=UA, timeout=30).json()
            for e in nd.get("podcast", {}).get("episodes", []):
                if e.get("uuid") == ep_uuid:
                    desc = strip_tags(e.get("show_notes", ""))
                    break
            if desc:
                break
        except Exception:
            pass
    if not desc:
        m = re.search(r'<meta[^>]+(?:property|name)="(?:og:)?description"[^>]+content="([^"]*)"', r.text)
        desc = html.unescape(m.group(1)) if m else ""
    return {
        "audio_url": ep["url"],
        "title": ep.get("title", ""),
        "podcast": pod.get("title", ""),
        "published": (ep.get("published") or "")[:10],
        "duration_sec": ep.get("duration"),
        "description": desc,
        "episode_key": "pc-" + ep_uuid[:8],
    }


def apple(url: str):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    ep_id = (q.get("i") or [None])[0]
    if not ep_id:
        return None
    d = requests.get("https://itunes.apple.com/lookup", params={"id": ep_id, "entity": "podcastEpisode"}, headers=UA, timeout=30).json()
    for res in d.get("results", []):
        if str(res.get("trackId")) == ep_id and res.get("episodeUrl"):
            return {
                "audio_url": res["episodeUrl"],
                "title": res.get("trackName", ""),
                "podcast": res.get("collectionName", ""),
                "published": (res.get("releaseDate") or "")[:10],
                "duration_sec": (res.get("trackTimeMillis") or 0) // 1000 or None,
                "description": res.get("description", ""),
                "episode_key": "ap-" + ep_id,
            }
    return None


def generic_page(url: str):
    r = requests.get(url, headers=UA, timeout=30)
    t = r.text
    pats = [
        r'<meta[^>]+property="og:audio(?::url|:secure_url)?"[^>]+content="([^"]+)"',
        r'<audio[^>]+src="([^"]+)"',
        r'<source[^>]+src="([^"]+\.(?:mp3|m4a)[^"]*)"',
        r'<enclosure[^>]+url="([^"]+)"',
        r'"(https?://[^"\s]+\.(?:mp3|m4a)(?:\?[^"\s]*)?)"',
    ]
    for p in pats:
        m = re.search(p, t, re.I)
        if m:
            audio = html.unescape(m.group(1))
            tm = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"', t) or re.search(r"<title>([^<]*)</title>", t)
            dm = re.search(r'<meta[^>]+(?:property|name)="(?:og:)?description"[^>]+content="([^"]*)"', t)
            return {
                "audio_url": urllib.parse.urljoin(url, audio),
                "title": html.unescape(tm.group(1)).strip() if tm else "",
                "podcast": "",
                "published": "",
                "duration_sec": None,
                "description": html.unescape(dm.group(1)) if dm else "",
                "episode_key": "pg-" + key_of(url),
            }
    return None


def ytdlp(url: str):
    p = subprocess.run(["yt-dlp", "-J", "--no-playlist", url], capture_output=True, text=True, timeout=180)
    if p.returncode != 0:
        print(p.stderr[-2000:], file=sys.stderr)
        return None
    d = json.loads(p.stdout)
    up = d.get("upload_date") or ""
    return {
        "audio_url": None,  # yt-dlp で直接ダウンロードする
        "ytdlp": True,
        "title": d.get("title", ""),
        "podcast": d.get("channel") or d.get("uploader") or "",
        "published": f"{up[:4]}-{up[4:6]}-{up[6:8]}" if len(up) == 8 else "",
        "duration_sec": d.get("duration"),
        "description": d.get("description", ""),
        "episode_key": "yt-" + key_of(url),
    }


def resolve(url: str):
    host = urllib.parse.urlparse(url).netloc.lower()
    tries = []
    if AUDIO_EXT.search(urllib.parse.urlparse(url).path):
        return {"audio_url": url, "title": url.rsplit("/", 1)[-1], "podcast": "", "published": "",
                "duration_sec": None, "description": "", "episode_key": "au-" + key_of(url)}
    if "pca.st" in host or "pocketcasts.com" in host:
        tries.append(pocketcasts)
    if "podcasts.apple.com" in host:
        tries.append(apple)
    if "youtube.com" not in host and "youtu.be" not in host:
        tries.append(generic_page)
    tries.append(ytdlp)
    for f in tries:
        try:
            res = f(url)
        except Exception as e:  # 次の手段へ
            print(f"{f.__name__}: {e}", file=sys.stderr)
            res = None
        if res:
            res["source_url"] = url
            res["resolver"] = f.__name__
            return res
    raise SystemExit(f"音声を見つけられませんでした: {url}")


if __name__ == "__main__":
    print(json.dumps(resolve(sys.argv[1]), ensure_ascii=False, indent=2))
