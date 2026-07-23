"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";

export function Footer() {
	const localeValue = useLocale();
	const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
	const t = useTranslations("footer");

	// 公開コンテンツへの導線。クローラーの回遊経路と各ページへの内部リンク評価を
	// 確保する SEO 上の役割も持つ(これらのページはナビからも辿れる必要がある)。
	const contentLinks = [
		{ href: localizePublicPath("/styles", locale), label: t("styles") },
		{ href: localizePublicPath("/catalog", locale), label: t("catalog") },
		{ href: "/collections", label: t("collections") },
		{
			href: localizePublicPath("/free-materials", locale),
			label: t("freeMaterials"),
		},
		{ href: "/creators", label: t("creators") },
	];

	const legalLinks = [
		{ href: localizePublicPath("/about", locale), label: t("about") },
		// { href: "/pricing", label: "料金" },
		{ href: localizePublicPath("/terms", locale), label: t("terms") },
		{ href: localizePublicPath("/privacy", locale), label: t("privacy") },
		{
			href: localizePublicPath("/community-guidelines", locale),
			label: t("communityGuidelines"),
		},
		{ href: localizePublicPath("/tokushoho", locale), label: t("disclosure") },
		// { href: "/payment-services-act", label: "資金決済法に基づく表示" },
	];

	const linkRows = [contentLinks, legalLinks];

	return (
		<footer className="mt-8 border-t bg-white/80">
			<div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
				{linkRows.map((links, rowIndex) => (
					<div key={rowIndex}>
						{/* モバイル: 2xNグリッド */}
						<div className="grid grid-cols-2 gap-3 text-center text-xs text-gray-600 md:hidden">
							{links.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="text-gray-700 underline underline-offset-2 hover:text-gray-900 transition-colors"
								>
									{link.label}
								</Link>
							))}
						</div>
						{/* PC: 横並び（|区切り） */}
						<div className="hidden items-center justify-center gap-2 text-center text-sm text-gray-600 md:flex">
							{links.map((link, index) => (
								<span key={link.href} className="flex items-center">
									<Link
										href={link.href}
										className="text-gray-700 underline underline-offset-2 hover:text-gray-900 transition-colors"
									>
										{link.label}
									</Link>
									{index < links.length - 1 && (
										<span className="mx-2 text-gray-400">|</span>
									)}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
		</footer>
	);
}
