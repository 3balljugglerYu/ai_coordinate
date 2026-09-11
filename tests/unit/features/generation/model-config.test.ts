import {
  getPercoinCost,
  creatorLooksCost,
  GUEST_ALLOWED_MODELS,
  isCanonicalGuestAllowedModel,
  isFreePlanAllowedModel,
  resolveRequestedModelFromUrl,
  resolveServerDefaultModel,
  isModelAvailableForGeneration,
  parseGuestRequestedModel,
  resolveEffectiveModelForAuthState,
} from "@/features/generation/lib/model-config";
import {
  DEFAULT_GENERATION_MODEL,
  FALLBACK_GENERATION_MODEL,
  isOpenAIImageModel,
  normalizeModelName,
} from "@/features/generation/types";
import { loadConfigWithGemini } from "@/tests/helpers/load-config-with-gemini";

describe("model-config / model identification helpers", () => {
  describe("creatorLooksCost", () => {
    it("衣装のみ/背景のみ=モデルコスト、衣装＋背景=ceil(×2×0.9)", () => {
      // gemini-3.1-flash-image-preview-512 = 10
      expect(creatorLooksCost("gemini-3.1-flash-image-preview-512", "outfit_only")).toBe(10);
      expect(creatorLooksCost("gemini-3.1-flash-image-preview-512", "background_only")).toBe(10);
      expect(
        creatorLooksCost("gemini-3.1-flash-image-preview-512", "outfit_and_background"),
      ).toBe(18); // ceil(10*2*0.9)=18
    });

    it("1024モデル(20)では 20/36/20 にスケール", () => {
      expect(creatorLooksCost("gemini-3.1-flash-image-preview-1024", "outfit_only")).toBe(20);
      expect(
        creatorLooksCost("gemini-3.1-flash-image-preview-1024", "outfit_and_background"),
      ).toBe(36); // ceil(20*2*0.9)=36
    });
  });

  describe("isFreePlanAllowedModel", () => {
    it("無課金でも ChatGPT の Low と Medium を 1k まで選べる", () => {
      // 実測した1ペルコインあたりの原価が Low とほぼ同じ帯に収まるため開放した
      // (2026-08-14 / ADR-005)。ペルコインの消費は倍になる
      expect(isFreePlanAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(isFreePlanAllowedModel("gpt-image-2-medium-1k")).toBe(true);
      // 2.5 も 2.0 と同じ 2 つを無課金へ開く（ペルコイン消費が同額のため）
      expect(isFreePlanAllowedModel("gpt-image-2.5-flare-low-1k")).toBe(true);
      expect(isFreePlanAllowedModel("gpt-image-2.5-flare-medium-1k")).toBe(true);
    });

    it("High と 2k/4k は有料プラン限定のまま", () => {
      // High は ¥0.642〜0.701/pc と一段高く、Low/Medium の帯から外れる
      expect(isFreePlanAllowedModel("gpt-image-2-high-1k")).toBe(false);
      // 2.5 側も 2.0 と同じ線引き（high と 2k/4k は有料プランのまま）
      expect(isFreePlanAllowedModel("gpt-image-2.5-flare-high-1k")).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2.5-flare-medium-2k")).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2.5-flare-low-4k")).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2-medium-2k")).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2-medium-4k")).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2-high-4k")).toBe(false);
    });

    it("未知の値は false（ロック扱い）", () => {
      expect(isFreePlanAllowedModel(null)).toBe(false);
      expect(isFreePlanAllowedModel(undefined)).toBe(false);
      expect(isFreePlanAllowedModel("gpt-image-2-ultra-8k")).toBe(false);
    });

    it("ゲストには Medium を開けていない（ログインの動機として残す）", () => {
      expect(isCanonicalGuestAllowedModel("gpt-image-2-medium-1k")).toBe(false);
      expect(parseGuestRequestedModel("gpt-image-2-medium-1k")).toBeNull();
    });
  });

  describe("getPercoinCost", () => {
    it("returns the GPT Image 2 percoin matrix", () => {
      expect(getPercoinCost("gpt-image-2-low-1k")).toBe(10);
      expect(getPercoinCost("gpt-image-2-low-2k")).toBe(20);
      expect(getPercoinCost("gpt-image-2-low-4k")).toBe(40);
      expect(getPercoinCost("gpt-image-2-medium-1k")).toBe(20);
      expect(getPercoinCost("gpt-image-2-medium-2k")).toBe(50);
      expect(getPercoinCost("gpt-image-2-medium-4k")).toBe(80);
      expect(getPercoinCost("gpt-image-2-high-1k")).toBe(50);
      expect(getPercoinCost("gpt-image-2-high-2k")).toBe(80);
      expect(getPercoinCost("gpt-image-2-high-4k")).toBe(130);
    });

    it("keeps existing Gemini cost mapping intact", () => {
      expect(getPercoinCost("gemini-3.1-flash-image-preview-512")).toBe(10);
      expect(getPercoinCost("gemini-3-pro-image-2k")).toBe(80);
    });
  });

  describe("normalizeModelName", () => {
    it("passes gpt-image-2-low-1k through unchanged", () => {
      expect(normalizeModelName("gpt-image-2-low-1k")).toBe("gpt-image-2-low-1k");
    });

    it("normalizes the legacy GPT Image 2 low id to the 1k canonical", () => {
      expect(normalizeModelName("gpt-image-2-low")).toBe("gpt-image-2-low-1k");
    });

    it("still normalizes legacy Gemini ids", () => {
      expect(normalizeModelName("gemini-3-pro-image-preview")).toBe(
        "gemini-3-pro-image-2k",
      );
    });
  });

  describe("isOpenAIImageModel", () => {
    it("recognizes OpenAI gpt-image-* models", () => {
      expect(isOpenAIImageModel("gpt-image-2-low-1k")).toBe(true);
    });

    it("returns false for Gemini models", () => {
      expect(isOpenAIImageModel("gemini-3-pro-image-2k")).toBe(false);
      expect(isOpenAIImageModel("gemini-3.1-flash-image-preview-512")).toBe(
        false,
      );
    });

    it("returns false for null / undefined / empty", () => {
      expect(isOpenAIImageModel(null)).toBe(false);
      expect(isOpenAIImageModel(undefined)).toBe(false);
      expect(isOpenAIImageModel("")).toBe(false);
    });
  });

  describe("GUEST_ALLOWED_MODELS / isCanonicalGuestAllowedModel", () => {
    it("Gemini 停止中は ChatGPT Images の Low(2.0 / 2.5)のみ", () => {
      expect(GUEST_ALLOWED_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gpt-image-2.5-flare-low-1k",
      ]);
    });

    it("canonical な許可モデルだけ true", () => {
      expect(isCanonicalGuestAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
    });

    it("canonical でない許可外モデル / エイリアス / 未知 / null は false", () => {
      // エイリアス（normalize 前）
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-2.5-flash-image")).toBe(false);
      // 許可外モデル
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-1024")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-3-pro-image-1k")).toBe(false);
      // 未知 / null
      expect(isCanonicalGuestAllowedModel("dall-e-3")).toBe(false);
      expect(isCanonicalGuestAllowedModel(null)).toBe(false);
      expect(isCanonicalGuestAllowedModel(undefined)).toBe(false);
    });
  });

  describe("parseGuestRequestedModel", () => {
    it("canonical な許可モデルはそのまま返す", () => {
      expect(parseGuestRequestedModel("gpt-image-2-low-1k")).toBe("gpt-image-2-low-1k");
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-512")
      ).toBeNull();
    });

    it("legacy GPT Image 2 low は canonical に正規化して許可する", () => {
      expect(parseGuestRequestedModel("gpt-image-2-low")).toBe(
        "gpt-image-2-low-1k"
      );
    });

    it("Gemini 停止中は許可モデルへ正規化されるエイリアスも null", () => {
      // gemini-3.1-flash-image-preview → gemini-3.1-flash-image-preview-512
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview")
      ).toBeNull();
      // gemini-2.5-flash-image → gemini-3.1-flash-image-preview-512
      expect(parseGuestRequestedModel("gemini-2.5-flash-image")).toBeNull();
      expect(parseGuestRequestedModel("gemini-2.5-flash-image-preview")).toBeNull();
    });

    it("許可外モデルは null", () => {
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-1024")
      ).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-1k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-2k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-4k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-preview")).toBeNull();
      expect(parseGuestRequestedModel("gpt-image-2-low-2k")).toBeNull();
      expect(parseGuestRequestedModel("gpt-image-2-medium-1k")).toBeNull();
      expect(parseGuestRequestedModel("gpt-image-2-high-1k")).toBeNull();
    });

    it("未知の値や null は null（normalize の fallback で許可されない）", () => {
      expect(parseGuestRequestedModel("dall-e-3")).toBeNull();
      expect(parseGuestRequestedModel("")).toBeNull();
      expect(parseGuestRequestedModel(null)).toBeNull();
      expect(parseGuestRequestedModel(undefined)).toBeNull();
    });
  });

  describe("resolveServerDefaultModel（サーバーが自分で決める既定値）", () => {
    it("2.5 が使えるなら既定(2.5)を返す", () => {
      expect(resolveServerDefaultModel(true)).toBe("gpt-image-2.5-flare-low-1k");
      expect(resolveServerDefaultModel(true)).toBe(DEFAULT_GENERATION_MODEL);
    });

    it("⭐ 2.5 が使えないなら 2.0 を返す（自分のゲートで自分を弾かないため）", () => {
      // ここが DEFAULT のままだと、段階公開フラグを戻したときに
      // 「サーバーが選んだ 2.5」をサーバーのゲートが 400 にして、
      // そのユーザーは何をしても生成できなくなる。
      expect(resolveServerDefaultModel(false)).toBe("gpt-image-2-low-1k");
      expect(resolveServerDefaultModel(false)).toBe(FALLBACK_GENERATION_MODEL);
    });

    it("返す値は常に誰でも実行できる（ゲストでも丸められない）", () => {
      for (const available of [true, false]) {
        const model = resolveServerDefaultModel(available);
        expect(
          resolveEffectiveModelForAuthState(model, "guest", {
            gptImage25Available: available,
          })
        ).toBe(model);
      }
    });
  });

  describe("resolveRequestedModelFromUrl（告知バナーの ?model= 対策）", () => {
    it("未知の文字列・空・null は採用しない", () => {
      for (const raw of ["", "not-a-model", "javascript:alert(1)", null, undefined]) {
        expect(
          resolveRequestedModelFromUrl(raw, "authenticated", {
            gptImage25Available: true,
          })
        ).toBeNull();
      }
    });

    it("legacy 別名は canonical に正規化して採用する", () => {
      expect(
        resolveRequestedModelFromUrl("gpt-image-2-low", "authenticated", {
          gptImage25Available: true,
        })
      ).toBe("gpt-image-2-low-1k");
    });

    it("バナーが使う 2.5 Low(1k)は、ゲストでも採用する", () => {
      expect(
        resolveRequestedModelFromUrl(
          "gpt-image-2.5-flare-low-1k",
          "guest",
          { gptImage25Available: true }
        )
      ).toBe("gpt-image-2.5-flare-low-1k");
    });

    it("段階公開中(available=false)は 2.5 を採用しない", () => {
      expect(
        resolveRequestedModelFromUrl(
          "gpt-image-2.5-flare-low-1k",
          "authenticated",
          { gptImage25Available: false }
        )
      ).toBeNull();
    });

    it("ゲストが許可外モデルを URL で指定しても採用しない", () => {
      for (const raw of [
        "gpt-image-2-high-4k",
        "gpt-image-2.5-flare-medium-1k",
        "gemini-3-pro-image-4k",
      ]) {
        expect(
          resolveRequestedModelFromUrl(raw, "guest", {
            gptImage25Available: true,
          })
        ).toBeNull();
      }
    });

    it("⭐ 無料プランが URL で有料モデルを指定しても採用しない（南京錠の迂回防止）", () => {
      for (const raw of [
        "gpt-image-2-high-1k",
        "gpt-image-2.5-flare-high-4k",
        "gpt-image-2.5-flare-medium-2k",
      ]) {
        expect(
          resolveRequestedModelFromUrl(raw, "authenticated", {
            gptImage25Available: true,
            isFreePlan: true,
          })
        ).toBeNull();
      }
    });

    it("無料プランでも許可内(2.5 の Low / Medium の 1k)は採用する", () => {
      for (const raw of [
        "gpt-image-2.5-flare-low-1k",
        "gpt-image-2.5-flare-medium-1k",
      ]) {
        expect(
          resolveRequestedModelFromUrl(raw, "authenticated", {
            gptImage25Available: true,
            isFreePlan: true,
          })
        ).toBe(raw);
      }
    });

    it("有料プランなら High / 4K も採用する", () => {
      expect(
        resolveRequestedModelFromUrl(
          "gpt-image-2.5-flare-high-4k",
          "authenticated",
          { gptImage25Available: true, isFreePlan: false }
        )
      ).toBe("gpt-image-2.5-flare-high-4k");
    });
  });

  describe("resolveEffectiveModelForAuthState", () => {
    it("ゲストの許可外モデルと停止中 Gemini は DEFAULT_GENERATION_MODEL に丸める", () => {
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "guest")
      ).toBe("gpt-image-2-low-1k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-512",
          "guest"
        )
      ).toBe("gpt-image-2-low-1k");
    });

    it("利用可能モデルはそのまま返し、認証ユーザーの停止中 Gemini は丸める", () => {
      expect(
        resolveEffectiveModelForAuthState(
          "gpt-image-2-low-1k",
          "guest"
        )
      ).toBe("gpt-image-2-low-1k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3-pro-image-4k",
          "authenticated"
        )
      ).toBe("gpt-image-2-low-1k");
    });

    describe("ChatGPT Images 2.5 の段階公開(REQ-014)", () => {
      it("gptImage25Available 省略時は 2.5 を DEFAULT_GENERATION_MODEL に丸める(fail closed)", () => {
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-low-1k",
            "authenticated"
          )
        ).toBe("gpt-image-2-low-1k");
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-high-4k",
            "authenticated",
            {}
          )
        ).toBe("gpt-image-2-low-1k");
      });

      it("gptImage25Available=false なら quality / size に関わらず丸める", () => {
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-medium-2k",
            "authenticated",
            { gptImage25Available: false }
          )
        ).toBe("gpt-image-2-low-1k");
      });

      it("gptImage25Available=true なら 2.5 をそのまま返す(運営)", () => {
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-medium-2k",
            "authenticated",
            { gptImage25Available: true }
          )
        ).toBe("gpt-image-2.5-flare-medium-2k");
      });

      it("ゲストでも 2.5 の Low(1k)は許可リスト内なので保つ", () => {
        // 2026-09-10: お試しにも 2.5 の Low を開いた(2.0 と同額・原価もほぼ同じ)。
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-low-1k",
            "guest",
            { gptImage25Available: true }
          )
        ).toBe("gpt-image-2.5-flare-low-1k");
      });

      it("ゲストの 2.5 は Low(1k)以外なら丸める", () => {
        for (const model of [
          "gpt-image-2.5-flare-low-2k",
          "gpt-image-2.5-flare-medium-1k",
          "gpt-image-2.5-flare-high-1k",
        ] as const) {
          expect(
            resolveEffectiveModelForAuthState(model, "guest", {
              gptImage25Available: true,
            })
          ).toBe("gpt-image-2-low-1k");
        }
      });

      it("段階公開中(available=false)はゲストの 2.5 Low も丸める", () => {
        // 許可リストには入っているが、公開フラグ側で閉じる(fail closed)。
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2.5-flare-low-1k",
            "guest",
            { gptImage25Available: false }
          )
        ).toBe("gpt-image-2-low-1k");
      });

      it("gpt-image-2 は gptImage25Available の値に影響されない", () => {
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2-high-4k",
            "authenticated",
            { gptImage25Available: false }
          )
        ).toBe("gpt-image-2-high-4k");
        expect(
          resolveEffectiveModelForAuthState(
            "gpt-image-2-high-4k",
            "authenticated",
            { gptImage25Available: true }
          )
        ).toBe("gpt-image-2-high-4k");
      });
    });
  });

  describe("isModelAvailableForGeneration", () => {
    it("Gemini 停止中は OpenAI のみ利用可能", () => {
      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });
  });

  // 以下は kill switch を ON にしたときの挙動を回帰テストする。
  // 上の既存ブロックは OFF（停止中）状態の本番デフォルトを担保し、
  // 下のブロックは将来 Gemini を再開した時のリグレッションを担保する。
  describe("kill switch ON (Gemini 有効) 時", () => {
    it("GUEST_ALLOWED_MODELS にはゲスト用 Gemini preview-512 も含まれる", () => {
      const { GUEST_ALLOWED_MODELS } = loadConfigWithGemini(true);
      expect(GUEST_ALLOWED_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gpt-image-2.5-flare-low-1k",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });

    it("isCanonicalGuestAllowedModel: 許可リストの Gemini も true、許可外 Gemini は false", () => {
      const { isCanonicalGuestAllowedModel } = loadConfigWithGemini(true);
      expect(isCanonicalGuestAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-512")
      ).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-1024")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-3-pro-image-1k")).toBe(false);
    });

    it("parseGuestRequestedModel: ゲスト許可 Gemini はそのまま返り、許可外は null", () => {
      const { parseGuestRequestedModel } = loadConfigWithGemini(true);
      expect(parseGuestRequestedModel("gpt-image-2-low-1k")).toBe(
        "gpt-image-2-low-1k"
      );
      // 旧 "gpt-image-2-low" は normalize 後 "gpt-image-2-low-1k" に正規化される
      expect(parseGuestRequestedModel("gpt-image-2-low")).toBe(
        "gpt-image-2-low-1k"
      );
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-512")
      ).toBe("gemini-3.1-flash-image-preview-512");
      // エイリアス（preview, 2.5-flash-image）は normalize 後に preview-512 へ正規化される
      expect(parseGuestRequestedModel("gemini-3.1-flash-image-preview")).toBe(
        "gemini-3.1-flash-image-preview-512"
      );
      expect(parseGuestRequestedModel("gemini-2.5-flash-image")).toBe(
        "gemini-3.1-flash-image-preview-512"
      );
      // 許可外 Gemini は null
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-1024")
      ).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-4k")).toBeNull();
    });

    it("isModelAvailableForGeneration: Gemini 系も全部利用可能（未知モデルは引き続き不許可）", () => {
      const { isModelAvailableForGeneration } = loadConfigWithGemini(true);
      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")
      ).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-1024")
      ).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-1k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-2.5-flash-image")).toBe(true);
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });

    it("resolveEffectiveModelForAuthState: 認証ユーザーの Gemini はそのまま、ゲストは許可リストに照らして丸める", () => {
      const { resolveEffectiveModelForAuthState } = loadConfigWithGemini(true);
      // 認証ユーザーはどの Gemini もそのまま使える
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "authenticated")
      ).toBe("gemini-3-pro-image-4k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-1024",
          "authenticated"
        )
      ).toBe("gemini-3.1-flash-image-preview-1024");
      // ゲストは preview-512 のみ許可、それ以外の Gemini は default (gpt-image-2-low-1k) に丸める
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-512",
          "guest"
        )
      ).toBe("gemini-3.1-flash-image-preview-512");
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "guest")
      ).toBe("gpt-image-2-low-1k");
    });
  });
});
