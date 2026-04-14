"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubscriptionPortalButtonProps {
  className?: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
}

export function SubscriptionPortalButton({
  className,
  label,
  size = "sm",
  variant = "outline",
}: SubscriptionPortalButtonProps) {
  const t = useTranslations("subscription");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenPortal = async () => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/subscription/portal", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || t("portalError"));
      }

      window.location.href = data.url;
    } catch (error) {
      console.error("[Subscription] Failed to open portal:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleOpenPortal}
      disabled={isLoading}
      className={cn("w-fit whitespace-nowrap", className)}
    >
      {isLoading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="h-4 w-4" />
      )}
      {label ?? t("manageAction")}
    </Button>
  );
}
