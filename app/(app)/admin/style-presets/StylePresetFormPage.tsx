"use client";

import { useRouter } from "next/navigation";

import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";
import type { StylePresetAdmin } from "@/features/style-presets/lib/schema";
import type { AllowlistedCreator } from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetForm } from "./StylePresetForm";

const LIST_PATH = "/admin/style-presets";

interface StylePresetFormPageProps {
  preset?: StylePresetAdmin;
  categories: PresetCategoryAdmin[];
  creators: AllowlistedCreator[];
  headerTitle: string;
}

/**
 * 新規・編集の専用ページ。
 *
 * 以前はダイアログ（モバイルではボトムシート）で出していたが、キーボードに
 * 合わせて位置と高さを計算し直す「浮いた箱」がある限り、その途中の値が必ず
 * どこかで見えてガクつく（#617〜#622）。通常のページにすれば箱自体が無くなり、
 * キーボードの扱いはブラウザ標準に任せられる。
 */
export function StylePresetFormPage({
  preset,
  categories,
  creators,
  headerTitle,
}: StylePresetFormPageProps) {
  const router = useRouter();

  const backToList = () => {
    // 一覧はサーバーで取得しているので、保存内容を反映させるため refresh も呼ぶ
    router.push(LIST_PATH);
    router.refresh();
  };

  return (
    <StylePresetForm
      preset={preset}
      categories={categories}
      creators={creators}
      headerTitle={headerTitle}
      onSuccess={backToList}
      onCancel={backToList}
    />
  );
}
