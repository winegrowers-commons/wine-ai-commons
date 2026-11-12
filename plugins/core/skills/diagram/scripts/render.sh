#!/usr/bin/env bash
# 図のHTMLを、Notionの表示幅（約700px）で明るい表示・暗い表示の2枚のPNGに撮る。
# 使い方: render.sh 図.html [高さ(既定560)]
set -euo pipefail
f="$1"; h="${2:-560}"; base="${f%.html}"
chrome="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [ -z "$chrome" ]; then echo "Chrome/Chromium が見つかりません" >&2; exit 1; fi
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=700,"$h" \
  --screenshot="$base-light.png" "file://$(realpath "$f")" >/dev/null 2>&1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-dark-mode \
  --blink-settings=preferredColorScheme=0 --window-size=700,"$h" \
  --screenshot="$base-dark.png" "file://$(realpath "$f")" >/dev/null 2>&1
echo "$base-light.png"; echo "$base-dark.png"
