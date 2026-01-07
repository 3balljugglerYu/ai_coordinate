import type { Metadata } from "next";
import { CreditCard, Receipt, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "資金決済法に基づく表示",
	description: "Persta.AI の資金決済法に基づく表示",
};

export default function PaymentServicesActPage() {
	return (
		<main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
			<div className="mb-6">
				<h1 className="text-xl font-semibold md:text-2xl">資金決済法に基づく表示</h1>
				<p className="mt-2 text-sm text-gray-600">「Persta.AI」に関する資金決済法に基づく表示です。</p>
			</div>

			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<CreditCard className="h-4 w-4 text-gray-500" />
							前払式支払手段の発行者
						</CardTitle>
						<CardDescription>前払式支払手段の発行者に関する情報</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
							<div className="md:col-span-2">
								<dt className="text-gray-500">発行者名</dt>
								<dd className="mt-1 text-gray-800">
									請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）
								</dd>
							</div>
							<div className="md:col-span-2">
								<dt className="text-gray-500">所在地</dt>
								<dd className="mt-1 text-gray-800">
									請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）
								</dd>
							</div>
							<div className="md:col-span-2">
								<dt className="text-gray-500">連絡先</dt>
								<dd className="mt-1">
									<a href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
										yuh.products@gmail.com
									</a>
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Receipt className="h-4 w-4 text-gray-500" />
							前払式支払手段の種類
						</CardTitle>
						<CardDescription>発行する前払式支払手段の種類について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスでは、ペルコイン購入により取得できる「ペルコイン」を前払式支払手段として発行しています。
						</p>
						<p className="mt-2 text-sm text-gray-800">
							ペルコインは、当サービス内でのみ使用可能なデジタル通貨であり、画像生成サービスの利用料金の支払いに使用できます。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-gray-500" />
							前払式支払手段の利用可能期間
						</CardTitle>
						<CardDescription>ペルコインの有効期限について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスで発行するペルコインには、有効期限は設定しておりません。ただし、当サービスの終了、または法令に基づく場合を除き、ペルコインは無期限に使用可能です。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">未使用残高の返金</CardTitle>
						<CardDescription>未使用残高の返金について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							ペルコインの未使用残高について、原則として返金は行っておりません。ただし、以下の場合には返金に対応する場合があります。
						</p>
						<ul className="mt-2 list-disc list-inside space-y-1 text-sm text-gray-800">
							<li>当サービスの不具合により、ペルコインが正常に使用できない場合</li>
							<li>当サービスの終了により、ペルコインが使用できなくなった場合</li>
							<li>その他、当サービスが返金を認めた場合</li>
						</ul>
						<p className="mt-2 text-sm text-gray-800">
							返金を希望される場合は、メールにてお問い合わせください。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">資金決済法に基づく供託</CardTitle>
						<CardDescription>供託について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、資金決済法に基づき、前払式支払手段の発行に伴い、未使用残高の一定割合を供託しています。供託の詳細については、請求があった場合には遅滞なく開示いたします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">苦情・相談窓口</CardTitle>
						<CardDescription>苦情・相談について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							前払式支払手段に関する苦情・相談については、以下の連絡先までお問い合わせください。
						</p>
						<p className="mt-2 text-sm text-gray-800">
							<a href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
								yuh.products@gmail.com
							</a>
						</p>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}





