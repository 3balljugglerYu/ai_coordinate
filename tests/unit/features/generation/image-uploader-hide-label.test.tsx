/**
 * @jest-environment jsdom
 *
 * 元の画像を上げる部品(ImageUploader)の見出しの出し方。
 *
 * ここで守ること:
 *  - 既定では見出しを画面に出す(今までどおり)
 *  - hideLabel のときは、見出しを画面に出さず、読み上げにだけ残す(見本を使える人の2枚並べで使う)
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { render, screen } from "@testing-library/react";
import { ImageUploader } from "@/features/generation/components/ImageUploader";

test("既定では、見出しを画面に出す", () => {
  render(<ImageUploader onImageUpload={jest.fn()} label="うちの子（必須）" />);

  const label = screen.getByText("うちの子（必須）");
  expect(label.className).toContain("text-base");
  expect(label.className).not.toContain("sr-only");
});

test("hideLabel のときは、見出しを読み上げにだけ残す", () => {
  render(<ImageUploader onImageUpload={jest.fn()} label="うちの子（必須）" hideLabel />);

  const label = screen.getByText("うちの子（必須）");
  expect(label.className).toContain("sr-only");
  expect(label.getAttribute("for")).toBe("image-upload");
});
