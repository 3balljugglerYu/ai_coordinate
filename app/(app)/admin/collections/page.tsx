import { redirect } from "next/navigation";

/**
 * コレクションKPIは /admin のダッシュボードタブへ集約済み。
 * 旧URL /admin/collections は新タブへ 308 リダイレクトする(既存ブックマーク保護)。
 */
export default function AdminCollectionsPage() {
  redirect("/admin?tab=collections");
}
