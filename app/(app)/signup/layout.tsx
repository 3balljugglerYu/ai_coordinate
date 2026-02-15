import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規登録 | Persta.AI",
  description: "Persta.AI に新規登録",
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
