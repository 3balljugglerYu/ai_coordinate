import { redirect } from "next/navigation";
import { ROUTES } from "@/constants";

interface PurchasePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PurchasePage({ searchParams }: PurchasePageProps) {
  const params = await searchParams;
  const nextSearchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => nextSearchParams.append(key, entry));
      return;
    }
    if (value) {
      nextSearchParams.set(key, value);
    }
  });

  const destination = nextSearchParams.size
    ? `${ROUTES.CREDITS_PURCHASE}?${nextSearchParams.toString()}`
    : ROUTES.CREDITS_PURCHASE;

  redirect(destination);
}
