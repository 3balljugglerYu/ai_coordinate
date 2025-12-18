import type { Metadata } from "next";
import Link from "next/link";
import { ShieldQuestion, FileText, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "「商取引に関する開示」(特定商取引法に基づく表記)",
	description: "AI Coordinate の特商法表記ページ",
};

export default function TokushohoPage() {
	return (
		<main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
			<div className="mb-6">
				<h1 className="text-xl font-semibold md:text-2xl">商取引に関する開示（特定商取引法に基づく表記）</h1>
				<p className="mt-2 text-sm text-gray-600">「AI Coordinate」に関する法定表示です。</p>
			</div>

			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-4 w-4 text-gray-500" />
							基本情報
						</CardTitle>
						<CardDescription>氏名・住所・電話番号は請求時に開示いたします。</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
							<div>
								<dt className="text-gray-500">法人名／屋号</dt>
								<dd className="mt-1 text-gray-800">請求があった場合には遅滞なく開示いたします。</dd>
							</div>
							<div>
								<dt className="text-gray-500">運営責任者</dt>
								<dd className="mt-1 text-gray-800">請求があった場合には遅滞なく開示いたします。</dd>
							</div>
							<div>
								<dt className="text-gray-500">所在地</dt>
								<dd className="mt-1 text-gray-800">請求があった場合には遅滞なく開示いたします。</dd>
							</div>
							<div>
								<dt className="text-gray-500">電話番号</dt>
								<dd className="mt-1 text-gray-800">
									請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）
								</dd>
							</div>
							<div className="md:col-span-2">
								<dt className="text-gray-500">メールアドレス</dt>
								<dd className="mt-1">
									<Link href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
										yuh.products@gmail.com
									</Link>
									<p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
										<Clock className="h-3.5 w-3.5" />
										お問い合わせ対応：平日10:00-18:00、3営業日以内に回答
									</p>
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldQuestion className="h-4 w-4 text-gray-500" />
							料金・お支払い・提供時期
						</CardTitle>
						<CardDescription>価格表示・決済方法・提供開始タイミングについてのご案内です。</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
							<div>
								<dt className="text-gray-500">販売価格</dt>
								<dd className="mt-1 text-gray-800">
									<Link href="/pricing" className="text-primary underline underline-offset-2">
										料金ページ
									</Link>
									で税込価格を表示しています。
								</dd>
							</div>
							<div>
								<dt className="text-gray-500">商品代金以外の必要料金</dt>
								<dd className="mt-1 text-gray-800">なし</dd>
							</div>
							<div>
								<dt className="text-gray-500">追加手数料</dt>
								<dd className="mt-1 text-gray-800">なし</dd>
							</div>
							<div>
								<dt className="text-gray-500">支払方法</dt>
								<dd className="mt-1 text-gray-800">クレジットカード（Stripe）</dd>
							</div>
							<div>
								<dt className="text-gray-500">支払時期</dt>
								<dd className="mt-1 text-gray-800">クレジットカードは商品・サービス購入時に即時決済されます。</dd>
							</div>
							<div className="md:col-span-2">
								<dt className="text-gray-500">商品の提供時期</dt>
								<dd className="mt-1 text-gray-800">
									決済完了後、即時利用可能です。なお、通信状況等により反映に時間がかかる場合があります。
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">返品・キャンセル</CardTitle>
						<CardDescription>デジタル商品の特性上のポリシーです。</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3 text-sm text-gray-800">
							<p>
								デジタル商品の性質上、正常品については購入後の返金・キャンセル・交換はお受けしておりません。
							</p>
							<p>
								不具合・障害など弊社責による問題がある場合は、購入後7日以内にメールにてご連絡ください。内容を確認のうえ、返金または再提供で対応いたします。
							</p>
							<p className="text-xs text-gray-600">
								連絡先：<Link href="mailto:yuh.products@gmail.com" className="underline underline-offset-2">yuh.products@gmail.com</Link>
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">サービス名</CardTitle>
						<CardDescription>当サービスの名称です。</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">AI Coordinate</p>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
