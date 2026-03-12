# .agents

AI エージェント関連の設定を集約するディレクトリです。

## ディレクトリ構成

```
.agents/
├── mcp.json      # MCP サーバー設定（複数 AI で共有）
├── skills/       # スキル定義
└── README.md     # このファイル
```

## MCP 設定

`.agents/mcp.json` に MCP サーバー設定を集約しています。複数の AI ツールから利用できます。

### 各 AI ツールでの利用方法

| ツール | 設定方法 |
|-------|----------|
| **Cursor** | `.cursor/mcp.json` を `.agents/mcp.json` へのシンボリックリンクに変更: `ln -sf ../.agents/mcp.json .cursor/mcp.json` |
| **Codex** | `.codex/config.toml` に同等の設定を記載済み。プロジェクトを信頼すると自動で読み込まれる |
| **Claude Code** | `.claude/settings.json` で参照するか、`mcpServers` に同等の設定を追加 |

### 現在の MCP サーバー

- **serena**: セマンティック（意味的）なコード操作ツール（`find_symbol`, `replace_symbol_body` など）

### Cursor で他の MCP サーバーも使う場合

現在 `.agents/mcp.json` には serena のみが含まれています（機密情報を含まないためコミット可能）。

Supabase や Context7 など他のサーバーも使う場合:

1. **ユーザーグローバル設定**: `~/.cursor/mcp.json` に追加する
2. **プロジェクトで統合**: `.agents/mcp.json.example` を参考に `.agents/mcp.json` にマージし、`.gitignore` に `.agents/mcp.json` を追加する（機密情報を含む場合）
