import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalRequest } from "@/lib/local-request";
import { ApiDocsClient } from "./ApiDocsClient";

export const metadata: Metadata = {
  title: "API Docs",
  description: "ReDoc viewer for the Persta.AI OpenAPI draft.",
};

export default async function ApiDocsPage() {
  const headerStore = await headers();

  if (!isLocalRequest(headerStore)) {
    notFound();
  }

  return <ApiDocsClient />;
}
