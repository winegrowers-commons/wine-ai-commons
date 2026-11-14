# Notion のプロンプトDBからの移行（2026年11月）

最初の参加者の Notion のプロンプトDB（29件）を確かめ、共有できるものをコモンズへ移した。移したものの正本はこのリポジトリで、Notion には `tools/notion-skill-sync/` が写しを入れる。

事業者ごとの事情（会社名、定款の条文、人名、DBのID、トンマナ）は外し、🧭 AI設定ページの自分ルールと接続表から読む形にした。

## 移したもの

| 元のプロンプト | 移した先 |
| --- | --- |
| 科学調査 | research の science-research |
| Deep Research | research の wide-research（総力調査と合わせた） |
| 参考文献登録 | research の reference-registration |
| 参考文献ページ点検 | research の reference-inspection |
| 参考文献照合チェック | research の citation-check |
| 科学的主張ファクトチェック | research の fact-check |
| 論理整合チェック | research の logic-check |
| 醸造技術 誤りパターン点検 | research の error-patterns |
| ページ検証オーケストレータ | research の page-review |
| 検証共通原則・検証出力スキーマ・主張検証共通基盤・書誌正規化ルール（部品） | research の verification-basics |
| 多言語PDF・Webページ 日本語翻訳 | research の translation |
| 問いづくり | team の question-design |
| 理事会議事録 生成 | team の board-minutes |
| 機械整備項目・部品登録 | equipment の maintenance-setup |
| [月次] 当月分の出勤簿（予定）自動生成 | labor の attendance-plan |
| [月次] 前月分の給与支給記録 作成・更新 | labor の payroll-record |
| ビンテージ一覧生成 | grape の vintage-summary |
| 税務リスクチェック、節税スキーム査察レビュー | finance の tax-risk-review（会社の前提は自分ルールへ） |

## core に置き換わったもの

| 元のプロンプト | 置き換え先 |
| --- | --- |
| 文体改善、構成リファクタ、文体抽出メタプロンプト | core の writing-for-humans と structure-reading（page-review の文体・構成の段もこれを使う） |

元のプロンプトにあって core に無い細かい手順（中心命題の木、寄与度による置き場の判定など）は、使ってみて要ると分かったら core への提案にする。

## 各自に残すもの（共有しない）

| 元のプロンプト | 理由 |
| --- | --- |
| ワイン紹介文（データシート・Web）、テイスティングコメント | 自社のワインとトンマナに強く結びつく（各自のスキルDBに置く） |
| 資金繰り×節税シミュレーション | 自社の数値の前提が中心（汎用部分は finance の cash-flow と tax-risk-review） |
| レシピ生成、InBody 測定結果の解析 | 事業と関係ない個人の用途 |
| Vikipedia のサブページ移行、Notion 数式レンダリング修正 | 1つのワークスペースの整備作業 |

## 移したあとの元のページ

元のページは消さず、名前の頭に「（移行済み→新しい正本の名前）」を付けた（2026-11-14、21件）。Notion AI は、同期で入る写し（スキルの名前のページ）を使う。写しが動くのを確かめたら、元のページは本人が消す。

Claude のアカウントに個人のスキルとして入っていた同じ役目のもの（科学調査、問いづくり、ポッドキャスト解説）も、コモンズのプラグインを入れて動くのを確かめたら、設定画面から消す。
