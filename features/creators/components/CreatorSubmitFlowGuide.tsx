import Image from "next/image";

/**
 * /creators/submit 冒頭に出す「申請の流れ」説明。
 * 申請 → 運営がモデル画像にプロンプトを適用して生成・確認 → 承認 → 掲載、までを説明する。
 * testImageUrl(運営の確認用モデル画像)があれば実画像を表示する。
 * ※ 公開時の通知は未実装のため、ここでは通知に言及しない。
 */
export function CreatorSubmitFlowGuide({
  testImageUrl,
}: {
  testImageUrl: string | null;
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
      <h2 className="text-base font-bold text-amber-900">申請の流れ</h2>
      <p className="mt-1 text-sm text-amber-800">
        提供いただいたプロンプトは、運営が確認したうえで掲載します。
      </p>

      <ol className="mt-4 space-y-4">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
            1
          </span>
          <div className="text-sm text-amber-900">
            <p className="font-semibold">入力して申請</p>
            <p className="mt-0.5 text-amber-800">
              スタイルのタイプ・タイトル・プロンプト・サムネを入力して申請します。
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
            2
          </span>
          <div className="text-sm text-amber-900">
            <p className="font-semibold">運営が生成して確認</p>
            <p className="mt-0.5 text-amber-800">
              下のモデル画像にあなたのプロンプトを適用して実際に生成し、仕上がりを運営が確認します。
              プロンプトは非公開で保護されます。
            </p>
            {testImageUrl ? (
              <figure className="mt-3">
                <div className="relative h-44 w-32 overflow-hidden rounded-lg border border-amber-200 bg-white">
                  <Image
                    src={testImageUrl}
                    alt="確認に使うモデル画像"
                    fill
                    sizes="128px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <figcaption className="mt-1 text-xs text-amber-700">
                  確認に使うモデル画像
                </figcaption>
              </figure>
            ) : null}
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
            3
          </span>
          <div className="text-sm text-amber-900">
            <p className="font-semibold">承認 → 掲載</p>
            <p className="mt-0.5 text-amber-800">
              問題なければ承認し、運営がタイミングを見て One-Tap
              Style(ホーム・Style画面)に掲載します。掲載時はサムネとあなたの名前・アイコン付きで表示されます。
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
