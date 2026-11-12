# NotionのHTMLブロックで描くとき

## 置き方

1. 1つの .html ファイルに、CSSも中身も全部入れる（外部ファイル・外部フォントを読まない）
2. Notionの接続（MCP）の `create-attachment` で .html を上げ、返ってきた `file-upload://…` を `<embed source="file-upload://…" />` としてページに置く
3. 上げたファイルは1時間以内にページへ置かないと消える
4. 置いたあとの差し替えは、接続からはうまくいかないことがある。そのときは新しいブロックを足し、古いブロックをNotionの画面で消す

## 表示の条件

- 表示幅は**約700px**（ページ幅が標準のとき）。この幅で崩れないこと
- ブロックの高さは固定される。中身が短いと下に空白が出るので、だいたい400〜600pxに収める
- Notionの明るい表示・暗い表示に合わせ、`prefers-color-scheme` で色を切り替える。背景は透明にせず、各モードの背景色を塗る（文字が背景に溶けるのを防ぐ）

## 雛形

```html
<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fff;--ink:#1f2328;--sub:#57606a;--line:#d0d7de;--soft:#f6f8fa;
  --a:#0969da;--a-bg:#ddf4ff;--ok:#1a7f37;--ok-bg:#dafbe1;--warn:#cf222e;--warn-bg:#ffebe9}
@media (prefers-color-scheme:dark){:root{--bg:#191919;--ink:#e6edf3;--sub:#9da7b3;--line:#3d444d;--soft:#24282e;
  --a:#8cc8ff;--a-bg:#12324f;--ok:#7ee2a8;--ok-bg:#123d27;--warn:#ffa198;--warn-bg:#4a1d1c}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg)}
body{padding:16px;font:14px/1.6 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--ink)}
h1{font-size:16px;margin:0 0 12px}            /* 図のタイトル＝この図が答える問い */
.note{font-size:13px;color:var(--sub)}       /* 補足。12px未満にしない */
</style></head><body>
<h1>（この図が答える問い）</h1>
<!-- 線や矢印は SVG で描くと位置がずれにくい -->
</body></html>
```

- 箱の並びや矢印は、CSSの格子より **SVG** で座標を決めて描くほうが、幅による崩れが起きにくい（viewBox を 680 幅にし、`width:100%` で表示）
- 色は雛形の変数だけを使う。強調色（--a）は主役1つだけに使う

## 点検の撮り方

`scripts/render.sh 図.html` で、幅700pxの明るい表示と暗い表示のPNGを撮る。撮った画像を自分で開いて、SKILL.md の「8. 実物で点検する」を通す。
