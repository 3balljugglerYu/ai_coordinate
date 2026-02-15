import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Crown, Star, Medal, Heart, Shield, Users } from "lucide-react";
import { SUPPORTERS, type Supporter } from "@/constants/supporters";
import { createMarketingPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMarketingPageMetadata({
  title: "Special Thanks",
  description: "Persta.AIを支えてくださった皆様への感謝を込めて",
  path: "/thanks",
});

export default function ThanksPage() {
  // グループ分け
  const platinumSupporters = SUPPORTERS.filter((s) => s.tier === "platinum");
  const goldSupporters = SUPPORTERS.filter((s) => s.tier === "gold");
  const silverSupporters = SUPPORTERS.filter((s) => s.tier === "silver");
  
  // Supporter Sub-tiers
  const coreSupporters = SUPPORTERS.filter((s) => s.tier === "core-supporter");
  const standardSupporters = SUPPORTERS.filter((s) => s.tier === "supporter");
  const friendSupporters = SUPPORTERS.filter((s) => s.tier === "friend-supporter");

  const hasAnySupporters = 
    coreSupporters.length > 0 || 
    standardSupporters.length > 0 || 
    friendSupporters.length > 0;

  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-8 md:py-12">
      {/* Header Section */}
      <div className="mb-10 text-center md:mb-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
          Special Thanks
          <br />
          <span className="text-sm text-muted-foreground">（サンプル）</span>
        </h1>
        <div className="mt-6 flex justify-center">
          <p className="max-w-2xl text-base font-medium leading-relaxed text-muted-foreground md:text-lg">
            このページに掲載されている皆さまは、Persta.AIを初期から信じ、支えてくださった大切なサポーターです。ご支援への感謝として、お名前をSpecial Thanksページに掲載します。
          </p>
        </div>
      </div>

      <div className="space-y-12 md:space-y-16">
        {/* Platinum Supporters */}
        {platinumSupporters.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-center gap-2 text-xl font-bold text-slate-800 md:text-2xl">
              <Crown className="h-6 w-6 fill-yellow-500 text-yellow-600" />
              <h2 className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Platinum Supporter
              </h2>
            </div>
            
            <div className="grid gap-6">
              {platinumSupporters.map((supporter) => (
                <Card
                  key={supporter.id}
                  className="relative overflow-hidden border border-[#B7BDC6] bg-[linear-gradient(135deg,#F9FBFF_0%,#E6F0FF_20%,#E5E4E2_45%,#CBD6E3_70%,#FFFFFF_100%)] shadow-[0_0_12px_rgba(216,235,255,0.8),0_0_28px_rgba(216,235,255,0.45)] transition-shadow hover:shadow-[0_0_16px_rgba(216,235,255,0.9),0_0_32px_rgba(216,235,255,0.6)]"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#D8EBFF,55%,transparent)] bg-[length:250%_100%] animate-shine opacity-60 mix-blend-overlay pointer-events-none" />
                  <CardHeader className="relative z-10 p-6">
                    <div className="space-y-2 text-center md:text-left">
                      <div className="flex flex-col items-center gap-2 md:flex-row md:items-start md:gap-3">
                        <span className="text-2xl font-bold text-slate-900">
                          {supporter.name}
                        </span>
                      </div>
                      
                      {supporter.message && (
                        <p className="mt-2 font-medium leading-relaxed text-slate-700">
                          {supporter.message}
                        </p>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Gold Supporters */}
        {goldSupporters.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-center gap-2 text-xl font-bold text-slate-800 md:text-2xl">
              <Star className="h-6 w-6 fill-amber-400 text-amber-500" />
              <h2>Gold Supporters</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {goldSupporters.map((supporter) => (
                <Card
                  key={supporter.id}
                  className="relative overflow-hidden border border-[#8F7A28] bg-[linear-gradient(135deg,#FFF1B8_0%,#E6C766_30%,#D4AF37_55%,#A68A2A_75%,#FFF1B8_100%)] shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#FFF6D5,55%,transparent)] bg-[length:250%_100%] animate-shine opacity-50 mix-blend-overlay pointer-events-none" />
                  <CardContent className="relative z-10 p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900 drop-shadow-sm truncate">
                          {supporter.name}
                        </span>
                      </div>
                      
                      {supporter.message && (
                        <p className="text-sm font-medium leading-relaxed text-slate-800/90 break-words">
                          {supporter.message}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Silver Supporters */}
        {silverSupporters.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-center gap-2 text-xl font-bold text-slate-800 md:text-2xl">
              <Medal className="h-6 w-6 text-slate-400" />
              <h2>Silver Supporters</h2>
            </div>

            <Card className="relative overflow-hidden border border-[#8E9096] bg-[linear-gradient(135deg,#ECEDEF_0%,#C9CCD1_40%,#B3B6BC_65%,#DADCE0_100%)] shadow-sm">
              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#F2F3F5,55%,transparent)] bg-[length:200%_100%] animate-shine opacity-40 mix-blend-overlay pointer-events-none" />
              <CardContent className="relative z-10 p-6">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {silverSupporters.map((supporter) => (
                    <div key={supporter.id} className="flex items-baseline gap-2">
                      <span className="text-base font-medium text-slate-800">{supporter.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Supporters Section */}
        {hasAnySupporters && (
          <section className="space-y-8">
            {/* Core Supporters (10,000円) - Visible & Bold */}
            {coreSupporters.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-2 text-xl font-bold text-slate-800 md:text-2xl">
                  <Shield className="h-6 w-6 text-indigo-500" />
                  <h2>Core Supporters</h2>
                </div>
                <Card className="border-indigo-50 bg-indigo-50/20">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {coreSupporters.map((supporter) => (
                        <div key={supporter.id} className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {supporter.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Standard Supporters (5,000円) - Visible & Normal */}
            {standardSupporters.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <span>Supporters</span>
                </div>
                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-4">
                      {standardSupporters.map((supporter) => (
                        <div key={supporter.id} className="text-sm text-slate-600">
                          {supporter.name}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Friend Supporters (1,000円) - Visible & Small */}
            {friendSupporters.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                  <Heart className="h-3 w-3 text-pink-300" />
                  <span>Friend Supporters</span>
                </div>
                <Card>
                  <CardContent className="p-2">
                    <div className="grid grid-cols-4 gap-2 text-center md:grid-cols-5 lg:grid-cols-5 text-xs text-slate-600">
                      {friendSupporters.map((supporter) => (
                        <div key={supporter.id} className="truncate px-1">
                          {supporter.name}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>
        )}
      </div>

      <Separator className="my-12 md:my-16" />

      {/* Footer Statement */}
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">
          このページは、Persta.AIを初期から支えてくださった皆さまの記録として、今後も公開し続けます。
        </p>
      </div>
    </main>
  );
}
