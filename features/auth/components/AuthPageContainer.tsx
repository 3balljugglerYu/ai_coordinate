import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthPageContainerProps {
  children: ReactNode;
  className?: string;
}

export function AuthPageContainer({ children, className }: AuthPageContainerProps) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(100vh-var(--app-header-height,64px))] flex-col bg-gray-50 px-4 pt-4 pb-8 sm:min-h-screen sm:items-center sm:justify-center sm:pt-1",
        className
      )}
    >
      {children}
    </div>
  );
}
