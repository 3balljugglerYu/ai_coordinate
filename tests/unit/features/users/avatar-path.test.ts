/**
 * アイコンを替えるときに消してよい、古いファイルの置き場所(ownAvatarStoragePath)。
 *
 * ここで守ること:
 *  - 消してよいのは本人のフォルダ(avatars/<本人の ID>/<ファイル>)の中だけ
 *  - ほかの人のフォルダ・.. で外へ出る場所・別のバケット・外の URL は消さない(null)
 *    (avatar_url は前は利用者が自分で書き換えられたので、何が入っていてもおかしくない)
 */

import { ownAvatarStoragePath } from "@/features/users/lib/avatar-path";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BUCKET = "generated-images";
const BASE = "https://ref.supabase.co/storage/v1/object/public/generated-images";

test("本人のフォルダの中のファイルは、その場所を返す", () => {
  expect(ownAvatarStoragePath(`${BASE}/avatars/${USER}/1730000000000.webp`, USER, BUCKET)).toBe(
    `avatars/${USER}/1730000000000.webp`,
  );
});

test.each([
  ["ほかの人のフォルダ", `${BASE}/avatars/${OTHER}/1.webp`],
  [".. で外へ出る", `${BASE}/avatars/${USER}/../${OTHER}/1.webp`],
  ["%2e%2e で外へ出る", `${BASE}/avatars/${USER}/%2e%2e/${OTHER}/1.webp`],
  ["ファイル名が ..", `${BASE}/avatars/${USER}/..`],
  ["フォルダより深い", `${BASE}/avatars/${USER}/sub/1.webp`],
  ["アイコン以外の画像", `${BASE}/generated/${USER}/1.webp`],
  ["別のバケット", `https://ref.supabase.co/storage/v1/object/public/other/avatars/${USER}/1.webp`],
  ["Google などの外の URL", "https://lh3.googleusercontent.com/a/abc"],
  ["URL でない文字", "/storage/v1/object/not a url"],
  ["空", ""],
])("%s → 消さない", (_label, url) => {
  expect(ownAvatarStoragePath(url, USER, BUCKET)).toBeNull();
});

test("うちの Supabase のサイトを渡したら、ほかのサイトの URL は消さない", () => {
  const path = `/storage/v1/object/public/generated-images/avatars/${USER}/1.webp`;
  expect(ownAvatarStoragePath(`https://ref.supabase.co${path}`, USER, BUCKET, "https://ref.supabase.co")).toBe(
    `avatars/${USER}/1.webp`,
  );
  expect(ownAvatarStoragePath(`https://evil.example${path}`, USER, BUCKET, "https://ref.supabase.co")).toBeNull();
});

test("アイコンが無いときは消さない", () => {
  expect(ownAvatarStoragePath(null, USER, BUCKET)).toBeNull();
  expect(ownAvatarStoragePath(undefined, USER, BUCKET)).toBeNull();
});
