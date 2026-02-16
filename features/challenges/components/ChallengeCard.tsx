"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface ChallengeCardProps {
  title: string;
  description: string;
  percoinAmount?: number;
  percoinText?: string;
  icon: LucideIcon;
  color?: "blue" | "purple" | "orange" | "green";
  children?: ReactNode;
  className?: string;
}

export function ChallengeCard({
  title,
  description,
  percoinAmount,
  percoinText,
  icon: Icon,
  color = "blue",
  children,
  className,
}: ChallengeCardProps) {
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    orange: "bg-orange-50 text-orange-600 border-orange-200",
    green: "bg-green-50 text-green-600 border-green-200",
  };

  const iconColorStyles = {
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
    green: "bg-green-100 text-green-600",
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 hover:shadow-lg border-2 motion-reduce:transition-none",
        className
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={cn("p-3 rounded-2xl transition-transform duration-300 group-hover:scale-110 motion-reduce:scale-100 motion-reduce:transition-none", iconColorStyles[color])}>
            <Icon className="w-8 h-8" strokeWidth={1.5} />
          </div>
          {(percoinAmount || percoinText) && (
            <div className={cn("px-4 py-1.5 rounded-full text-sm font-bold border", colorStyles[color])}>
              {percoinAmount ? `+${percoinAmount} ペルコイン` : percoinText}
            </div>
          )}
        </div>
        
        <h3 className="text-xl font-bold mb-2 text-gray-900 group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <p className="text-muted-foreground leading-relaxed mb-6">
          {description}
        </p>

        {children && (
          <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
            {children}
          </div>
        )}
      </div>
      
      {/* 背景装飾 */}
      <div className={cn(
        "absolute -right-8 -bottom-8 w-32 h-32 rounded-full opacity-10 blur-2xl transition-transform duration-500 group-hover:scale-150",
        {
          "bg-blue-500": color === "blue",
          "bg-purple-500": color === "purple",
          "bg-orange-500": color === "orange",
          "bg-green-500": color === "green",
        }
      )} />
    </Card>
  );
}
