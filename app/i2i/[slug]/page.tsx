import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { I2iPocClient } from "@/features/i2i-poc/components/I2iPocClient";
import { getI2iPocConfig } from "@/lib/i2i-poc-auth";

interface I2iPocPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const metadata: Metadata = {
  title: "I2I PoC | Persta.AI",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function I2iPocPage({ params }: I2iPocPageProps) {
  const { slug } = await params;
  const config = getI2iPocConfig();

  if (!config || slug !== config.slug) {
    notFound();
  }

  return <I2iPocClient slug={slug} />;
}
