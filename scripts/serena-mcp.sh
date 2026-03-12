#!/usr/bin/env bash
# Serena MCP ラッパー - 複数ユーザー対応
# プロジェクトルートと uvx を自動解決し、どのユーザーでも動作する

set -euo pipefail

# スクリプトの場所からプロジェクトルートを算出
# (scripts/serena-mcp.sh の親ディレクトリ = プロジェクトルート)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# uvx のパスを検索 (PATH → $HOME/.local/bin → Homebrew)
UVX=""
if command -v uvx &>/dev/null; then
  UVX="$(command -v uvx)"
elif [ -x "${HOME}/.local/bin/uvx" ]; then
  UVX="${HOME}/.local/bin/uvx"
elif [ -x "/opt/homebrew/bin/uvx" ]; then
  UVX="/opt/homebrew/bin/uvx"
fi

if [ -z "$UVX" ]; then
  echo "serena-mcp: uvx が見つかりません。uv をインストールしてください: https://docs.astral.sh/uv/" >&2
  exit 1
fi

exec "$UVX" --from "git+https://github.com/oraios/serena@b3a6045f7e3f52024f8330f1e79aeb13c34417b0" serena start-mcp-server \
  --context ide \
  --project "$ROOT" \
  --open-web-dashboard false \
  "$@"
