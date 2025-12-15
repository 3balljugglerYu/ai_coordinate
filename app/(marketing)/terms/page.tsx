import type { Metadata } from "next";
import { FileText, AlertCircle, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "利用規約",
	description: "AI Coordinate の利用規約",
};

export default function TermsPage() {
	return (
		<main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
			<div className="mb-6">
				<h1 className="text-xl font-semibold md:text-2xl">利用規約</h1>
				<p className="mt-2 text-sm text-gray-600">「AI Coordinate」の利用規約です。</p>
			</div>

			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-4 w-4 text-gray-500" />
							第1条（適用）
						</CardTitle>
						<CardDescription>本規約の適用範囲について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							本規約は、AI Coordinate（以下「当サービス」）の利用条件を定めるものです。登録ユーザーの皆さま（以下「ユーザー」）には、本規約に従って、当サービスをご利用いただきます。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-4 w-4 text-gray-500" />
							第2条（利用登録）
						</CardTitle>
						<CardDescription>アカウント登録について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスの利用を希望する方は、本規約に同意の上、当サービスの定める方法によって利用登録を申請し、当サービスがこれを承認することによって、利用登録が完了するものとします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-gray-500" />
							第3条（禁止事項）
						</CardTitle>
						<CardDescription>利用にあたっての禁止事項</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
							<li>法令または公序良俗に違反する行為</li>
							<li>犯罪行為に関連する行為</li>
							<li>当サービスの内容等、当サービスに含まれる著作権、商標権ほか知的財産権を侵害する行為</li>
							<li>当サービス、ほかのユーザー、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為</li>
							<li>当サービスによって得られた情報を商業的に利用する行為</li>
							<li>当サービスの運営を妨害するおそれのある行為</li>
							<li>不正アクセスをし、またはこれを試みる行為</li>
							<li>その他、当サービスが不適切と判断する行為</li>
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第4条（当サービスの提供の停止等）</CardTitle>
						<CardDescription>サービス提供の停止について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく当サービスの全部または一部の提供を停止または中断することができるものとします。
						</p>
						<ul className="mt-2 list-disc list-inside space-y-1 text-sm text-gray-800">
							<li>当サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
							<li>地震、落雷、火災、停電または天災などの不可抗力により、当サービスの提供が困難となった場合</li>
							<li>コンピュータまたは通信回線等が事故により停止した場合</li>
							<li>その他、当サービスが当サービスの提供が困難と判断した場合</li>
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第5条（保証の否認および免責）</CardTitle>
						<CardDescription>免責事項について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、当サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第6条（サービス内容の変更等）</CardTitle>
						<CardDescription>サービス内容の変更について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、ユーザーへの事前の告知をもって、本サービスの内容を変更、追加または廃止することがあり、ユーザーはこれに同意するものとします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第7条（利用規約の変更）</CardTitle>
						<CardDescription>規約変更について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができるものとします。なお、本規約の変更後、本サービスの利用を開始した場合には、当該ユーザーは変更後の規約に同意したものとみなします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第8条（個人情報の取扱い）</CardTitle>
						<CardDescription>個人情報の取り扱いについて</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、本サービスの利用によって取得する個人情報については、当サービス「プライバシーポリシー」に従い適切に取り扱うものとします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">第9条（準拠法・裁判管轄）</CardTitle>
						<CardDescription>準拠法と裁判管轄について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当サービスの本店所在地を管轄する裁判所を専属的合意管轄とします。
						</p>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}



