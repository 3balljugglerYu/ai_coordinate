# Supabase アドバイザー結果サマリー

## セキュリティ（2025-02 確認）

| 項目 | レベル | 内容 |
|------|--------|------|
| function_search_path_mutable | WARN | `pgmq_read`, `pgmq_send`, `pgmq_delete` の search_path が未設定（Supabase 拡張） |

**対応**: pgmq は Supabase 標準拡張のため、現状維持。必要に応じて [remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) を参照。

## パフォーマンス

| 項目 | レベル | 内容 |
|------|--------|------|
| unused_index | INFO | 複数テーブルで未使用インデックス（admin_audit_log 含む） |
| multiple_permissive_policies | WARN | generated_images で SELECT 用の複数ポリシーが存在 |
| auth_db_connections_absolute | INFO | Auth の接続数が絶対値指定 |

**admin_audit_log**: 新規作成のため未使用インデックスは想定内。将来的に使用される。

## admin_audit_log RLS

- RLS 有効
- ポリシー `admin_audit_log_no_public_access`: USING (false) で全ロール拒否
- Service Role 経由の API のみアクセス可能（RLS バイパス）
