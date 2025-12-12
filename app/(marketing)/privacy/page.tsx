import type { Metadata } from "next";
import { Shield, Eye, Lock, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "プライバシーポリシー",
	description: "AI Coordinate のプライバシーポリシー",
};

export default function PrivacyPage() {
	return (
		<main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
			<div className="mb-6">
				<h1 className="text-xl font-semibold md:text-2xl">プライバシーポリシー</h1>
				<p className="mt-2 text-sm text-gray-600">「AI Coordinate」のプライバシーポリシーです。</p>
			</div>

			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-4 w-4 text-gray-500" />
							1. 個人情報の取得について
						</CardTitle>
						<CardDescription>当サービスが取得する個人情報について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800 mb-3">
							当サービスは、以下の個人情報を取得いたします。
						</p>
						<ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
							<li>メールアドレス（認証用）</li>
							<li>ニックネーム（表示名）</li>
							<li>プロフィール画像（任意）</li>
							<li>生成した画像データ</li>
							<li>決済情報（Stripe経由、当サービスでは直接保存しません）</li>
							<li>アクセスログ、IPアドレス、ブラウザ情報等</li>
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Eye className="h-4 w-4 text-gray-500" />
							2. 個人情報の利用目的
						</CardTitle>
						<CardDescription>取得した個人情報の利用目的について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800 mb-3">
							当サービスは、取得した個人情報を以下の目的で利用いたします。
						</p>
						<ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
							<li>当サービスの提供、運営、管理</li>
							<li>ユーザーからのお問い合わせへの対応</li>
							<li>利用規約に違反した行為への対応</li>
							<li>当サービスの新機能、更新情報、キャンペーン等の案内</li>
							<li>利用状況の分析、サービス改善のための統計データの作成</li>
							<li>不正利用の防止、セキュリティ対策</li>
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Lock className="h-4 w-4 text-gray-500" />
							3. 個人情報の管理
						</CardTitle>
						<CardDescription>個人情報の安全管理について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、個人情報の漏洩、滅失または毀損の防止その他の個人情報の安全管理のため、必要かつ適切な措置を講じます。個人情報の取扱いに関する責任は、当サービスが負います。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="h-4 w-4 text-gray-500" />
							4. 個人情報の第三者提供
						</CardTitle>
						<CardDescription>第三者への提供について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800 mb-3">
							当サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供することはありません。
						</p>
						<ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
							<li>ユーザーの同意がある場合</li>
							<li>法令に基づく場合</li>
							<li>人の生命、身体または財産の保護のために必要がある場合</li>
							<li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</li>
							<li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合</li>
						</ul>
						<p className="mt-3 text-sm text-gray-800">
							なお、当サービスは、Supabase（認証・データベース・ストレージサービス）およびStripe（決済サービス）を利用しており、これらのサービス提供者に個人情報が提供される場合があります。これらのサービス提供者は、それぞれのプライバシーポリシーに従って個人情報を管理します。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">5. Cookie等の利用</CardTitle>
						<CardDescription>Cookie等の利用について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、ユーザーによりよいサービスを提供するため、Cookie等の技術を使用することがあります。Cookieは、ユーザーのコンピュータに識別子を保存することにより、当サービスの利用状況を把握するために使用されます。ユーザーは、ブラウザの設定により、Cookieの受け取りを拒否することができます。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">6. 個人情報の開示・訂正・削除</CardTitle>
						<CardDescription>個人情報の開示等の請求について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							ユーザーは、当サービスが保有する自己の個人情報について、開示、訂正、削除を求めることができます。これらの請求は、当サービスが定める方法により、当サービスにご連絡いただくことで対応いたします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">7. プライバシーポリシーの変更</CardTitle>
						<CardDescription>プライバシーポリシーの変更について</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							当サービスは、必要に応じて、本プライバシーポリシーを変更することがあります。変更後のプライバシーポリシーは、本ページに掲載した時点で効力を生じるものとします。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">8. お問い合わせ窓口</CardTitle>
						<CardDescription>個人情報に関するお問い合わせについて</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-800">
							本プライバシーポリシーに関するお問い合わせは、以下のメールアドレスまでご連絡ください。
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

