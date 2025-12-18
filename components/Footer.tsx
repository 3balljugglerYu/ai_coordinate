import Link from "next/link";

export function Footer() {
	const links = [
		{ href: "/about", label: "サービス紹介" },
		{ href: "/pricing", label: "料金" },
		{ href: "/terms", label: "利用規約" },
		{ href: "/privacy", label: "プライバシーポリシー" },
		{ href: "/tokushoho", label: "「商取引に関する開示」(特定商取引法に基づく表記)　" },
		{ href: "/payment-services-act", label: "資金決済法に基づく表示" },
	];

	return (
		<footer className="mt-8 border-t bg-white/80">
			<div className="mx-auto max-w-7xl px-4 py-6">
				{/* モバイル: 2x2グリッド */}
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
		</footer>
	);
}
