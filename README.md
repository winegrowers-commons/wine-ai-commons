# wine-ai-commons

ワイン生産者どうしで育てる、Claudeの共有基盤です。スキル（AIへの作業手順書）、DBの設計図、基本ルールを、ここでみんなで共有して直していきます。各自の事業データはここには入れず、それぞれのNotion・freee・Google Driveに置いたままにします。

全体の設計は [docs/design.md](docs/design.md) にあります。

## 入れ方

Claude（アプリ）では、カスタマイズ → プラグイン → マーケットプレイスを追加 で `winegrowers-commons/wine-ai-commons` を指定し、使うプラグインを入れます。非公開リポジトリなので、追加するときにGitHubアカウントをつなぎ、Claude GitHub Appにこのリポジトリへのアクセスを与えます。

Claude Code では次の1行です。

```
/plugin install core --marketplace winegrowers-commons/wine-ai-commons
```

## いま入っているもの

| プラグイン | 中身 |
| --- | --- |
| core（基盤・必須） | 基本ルール（basic-rules）、人間向けの資料づくり（writing-for-humans）、情報の構造の読み取り（structure-reading）、図解（diagram） |

畑・醸造・販売・経理・補助金などの分野別プラグインは、これから順に足します。

## 直し方

- 使っていて「ここ違う」「これ足りない」と思ったら、Claudeに伝えるか、このリポジトリにIssueを立ててください
- 変更はプルリクエストで入れます。作業のルールは `CLAUDE.md` にあります
