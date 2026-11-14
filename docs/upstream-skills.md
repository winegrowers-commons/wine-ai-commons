# 本家のスキル：そのまま使うもの・上乗せしているもの

core の making-skills に従い、公式や公開のスキルで足りるものはコモンズで作り直さない。ここはその一覧。

## 上乗せしているもの

| コモンズのスキル | 本家 | ライセンス | 上乗せの中身 |
| --- | --- | --- | --- |
| finance の cash-flow | Anthropic `small-business` の `cash-flow-snapshot` | Apache-2.0 | 日本の会計ソフト・資金繰り表、税と社会保険の支払い、12か月の見通し、補助金の立て替え |
| grants の grant-support | Anthropic `small-business` の `grant-rfp-writer` | Apache-2.0 | 日本の制度の探し先、交付決定前の着手・併用・処分制限、制度カタログ |
| grape の spray-plan | `human-avatar/skills-for-agriculture` の `s4ag-pests` | MIT | 農薬取締法の使用基準、FRAC/IRACのローテーション、日本のワイン用ブドウの病害、醸造への影響、防除歴の点検 |

本家は、入っていればそれを呼び、無ければ GitHub の原文を毎回読む。だから本家が更新されると、その日から新しい版が使われ、上乗せの部分はそのまま残る。

## そのまま使うおすすめ（コモンズでは作らない）

| 使いたいこと | 本家 | 入れ方 |
| --- | --- | --- |
| Word・Excel・PowerPoint・PDF のファイルを作る | Anthropic の docx／xlsx／pptx／pdf スキル | Claude に最初から入っている |
| スキルを作る・試験する | Anthropic の skill-creator | Claude に最初から入っている |
| 製品の企画・調査のまとめ | Anthropic `product-management` | Claude の設定画面のプラグインから |
| 横断検索・まとめ | Anthropic `enterprise-search` | 同上 |
| 農業の幅広い相談（土壌・季節・直売・アグリツーリズムなど） | `human-avatar/skills-for-agriculture` | Claude Code で `claude plugin install`。アプリでは入れられないことがある（`bin/` を持つため）。その場合は原文を読ませて使う |

## 探す先

- Anthropic：`anthropics/skills`、`anthropics/knowledge-work-plugins`
- 公開のまとめ：ComposioHQ／travisvn の awesome-claude-skills
- 農業：`human-avatar/skills-for-agriculture`
