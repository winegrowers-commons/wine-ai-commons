#!/usr/bin/env python3
"""コモンズのスキル（正本）を、各自の Notion のスキルDBへ写す。

標準ライブラリだけで動く。環境変数：
  NOTION_TOKEN            Notion の接続トークン（読み・挿入・更新の権限）
  SKILLS_DATA_SOURCE_ID   写し先のスキルDBのデータソースID
  COMMONS_DIR             コモンズのリポジトリの場所（既定：このファイルの2つ上）
  PLUGINS                 写すプラグイン。カンマ区切り、または all（既定）
  STATE_FILE              前回写した内容の控え（既定：.notion-skill-sync.json）
  DRY_RUN                 1 なら Notion に書かず、何をするかだけ出す

スキルDBのページのタイトルが SKILL.md の name と同じものを「写し」とみなし、
中身が変わったときだけ入れ直す。無ければページを作ってから入れる。
"""
import hashlib
import io
import json
import os
import pathlib
import re
import sys
import tarfile
import time
import urllib.error
import urllib.request
import uuid

API = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        sys.exit(f"環境変数 {name} がありません")
    return v


def request(method, path, token, body=None, headers=None, raw=None):
    h = {"Authorization": f"Bearer {token}", "Notion-Version": NOTION_VERSION}
    data = None
    if raw is not None:
        data = raw
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if headers:
        h.update(headers)
    for attempt in range(5):
        req = urllib.request.Request(API + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 504, 529) and attempt < 4:
                time.sleep(int(e.headers.get("Retry-After", 2 ** attempt)))
                continue
            sys.exit(f"{method} {path} が失敗しました（{e.code}）：{msg[:500]}")


def frontmatter_name(skill_md):
    m = re.match(r"^---\n(.*?)\n---\n", skill_md.read_text(encoding="utf-8"), re.S)
    if not m:
        return None
    nm = re.search(r"^name:\s*(.+)$", m.group(1), re.M)
    return nm.group(1).strip() if nm else None


def find_skills(commons, plugins):
    out = []
    for skill_md in sorted((commons / "plugins").glob("*/skills/*/SKILL.md")):
        plugin = skill_md.parts[-4]
        if plugins != ["all"] and plugin not in plugins:
            continue
        name = frontmatter_name(skill_md)
        if name:
            out.append((plugin, name, skill_md.parent))
    return out


def pack(skill_dir):
    """SKILL.md を根に置いた tar.gz と、中身のハッシュを返す。"""
    files = sorted(p for p in skill_dir.rglob("*") if p.is_file())
    digest = hashlib.sha256()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in files:
            rel = p.relative_to(skill_dir).as_posix()
            content = p.read_bytes()
            digest.update(rel.encode() + b"\0" + content + b"\0")
            info = tarfile.TarInfo(rel)
            info.size = len(content)
            info.mtime = 0
            tar.addfile(info, io.BytesIO(content))
    return buf.getvalue(), digest.hexdigest()


def title_property(token, ds_id):
    ds = request("GET", f"/data_sources/{ds_id}", token)
    for name, prop in ds.get("properties", {}).items():
        if prop.get("type") == "title":
            return name
    sys.exit("スキルDBにタイトルの列が見つかりません")


def existing_pages(token, ds_id, title_prop):
    pages, cursor = {}, None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        res = request("POST", f"/data_sources/{ds_id}/query", token, body)
        for page in res.get("results", []):
            parts = page.get("properties", {}).get(title_prop, {}).get("title", [])
            title = "".join(t.get("plain_text", "") for t in parts).strip()
            if title:
                pages.setdefault(title, page["id"])
        if not res.get("has_more"):
            return pages
        cursor = res.get("next_cursor")


def create_page(token, ds_id, title_prop, name):
    body = {
        "parent": {"type": "data_source_id", "data_source_id": ds_id},
        "properties": {title_prop: {"title": [{"text": {"content": name}}]}},
    }
    return request("POST", "/pages", token, body)["id"]


def upload(token, page_id, archive, name):
    boundary = uuid.uuid4().hex
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{name}.tar.gz"\r\n'
        "Content-Type: application/gzip\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    return request(
        "POST",
        f"/ai/skills/{page_id}/upload",
        token,
        raw=head + archive + tail,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def main():
    here = pathlib.Path(__file__).resolve()
    commons = pathlib.Path(env("COMMONS_DIR", str(here.parents[2])))
    plugins = [p.strip() for p in env("PLUGINS", "all").split(",") if p.strip()]
    state_path = pathlib.Path(env("STATE_FILE", ".notion-skill-sync.json"))
    dry = env("DRY_RUN", "0") == "1"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}

    skills = find_skills(commons, plugins)
    names = [n for _, n, _ in skills]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        sys.exit(f"同じ名前のスキルが複数あります：{', '.join(sorted(dupes))}")

    token = ds_id = title_prop = None
    pages = {}
    if not dry:
        token = env("NOTION_TOKEN", required=True)
        ds_id = env("SKILLS_DATA_SOURCE_ID", required=True)
        title_prop = title_property(token, ds_id)
        pages = existing_pages(token, ds_id, title_prop)

    changed = 0
    for plugin, name, skill_dir in skills:
        archive, digest = pack(skill_dir)
        if state.get(name) == digest and (dry or name in pages):
            print(f"＝ {plugin}:{name}（変わりなし）")
            continue
        if dry:
            print(f"→ {plugin}:{name}（入れ直す予定、{len(archive)} バイト）")
            continue
        page_id = pages.get(name) or create_page(token, ds_id, title_prop, name)
        res = upload(token, page_id, archive, name)
        state[name] = digest
        changed += 1
        print(f"✓ {plugin}:{name} → {res.get('status')}（{res.get('version_id', '')[:12]}）")

    if not dry:
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(f"おわり：{len(skills)} 件中 {changed} 件を入れ直しました")


if __name__ == "__main__":
    main()
