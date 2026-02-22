import { NextRequest, NextResponse } from "next/server";
import { generationRequestSchema } from "@/features/generation/lib/schema";
import { buildPrompt } from "@/features/generation/lib/prompt-builder";
import { normalizeModelName, toApiModelName, extractImageSize, type GeminiApiModel } from "@/features/generation/types";
import type { GeminiResponse } from "@/features/generation/lib/nanobanana";

/**
 * Nano Banana画像生成プロキシAPI
 * Google AI StudioのAPIキーをサーバーサイドで使用して画像生成を行う
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // バリデーション
    const validationResult = generationRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const {
      prompt,
      sourceImageBase64,
      sourceImageMimeType,
      backgroundMode,
      count,
      generationType,
      model: rawModel,
    } = validationResult.data;

    // APIキーの取得（サーバー側専用を優先、フォールバックあり）
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 }
      );
    }

    // モデル名の正規化（データベース保存用とAPIエンドポイント用を分離）
    const dbModel = normalizeModelName(rawModel || 'gemini-2.5-flash-image'); // データベース保存用
    const apiModel = toApiModelName(dbModel); // APIエンドポイント用

    // リクエストボディを構築
    const parts: Array<{
      text?: string;
      inline_data?: {
        mime_type: string;
        data: string;
      };
    }> = [];

    // 元画像がある場合は追加
    if (sourceImageBase64 && sourceImageMimeType) {
      parts.push({
        inline_data: {
          mime_type: sourceImageMimeType,
          data: sourceImageBase64,
        },
      });
    }

    // プロンプトを構築
    let fullPrompt: string;
    
    if (sourceImageBase64) {
      // 画像がある場合はプロンプトテンプレートを使用して構築
      fullPrompt = buildPrompt({
        generationType: generationType || 'coordinate',
        outfitDescription: prompt,
        backgroundMode,
      });
    } else {
      // 画像がない場合はユーザー入力のプロンプトをそのまま使用
      fullPrompt = prompt;
    }

    parts.push({
      text: fullPrompt,
    });

    const requestBody: {
      contents: Array<{
        parts: typeof parts;
      }>;
      generationConfig?: {
        candidateCount?: number;
        imageConfig?: {
          imageSize?: "1K" | "2K" | "4K";
        };
      };
    } = {
      contents: [
        {
          parts,
        },
      ],
    };

    // 生成枚数を指定
    if (count && count > 1) {
      requestBody.generationConfig = {
        ...requestBody.generationConfig,
        candidateCount: Math.min(count, 4),
      };
    }

    // Gemini 3 Pro Image Previewの場合、imageConfigを追加
    if (apiModel === 'gemini-3-pro-image-preview') {
      const imageSize = extractImageSize(dbModel);
      if (imageSize) {
        requestBody.generationConfig = {
          ...requestBody.generationConfig,
          imageConfig: {
            imageSize: imageSize,
          },
        };
      }
    }

    // APIエンドポイントURLを構築
    function buildApiUrl(apiModel: GeminiApiModel): string {
      return `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;
    }

    const apiUrl = buildApiUrl(apiModel);

    // Google AI Studio APIを呼び出し（ヘッダー方式でAPIキーを送信）
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey, // ヘッダー方式
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      const status = response.status;
      
      // APIキーを含む可能性のある情報をログに出力しない
      console.error("Generation API error:", {
        status,
        error: error.error?.message || "Unknown error",
        model: dbModel,
        // apiKeyは含めない
      });
      
      if (status === 404) {
        return NextResponse.json(
          { error: `モデル "${dbModel}" が見つかりません。別のモデルを選択してください。` },
          { status: 404 }
        );
      }
      
      if (status === 403 || status === 503) {
        return NextResponse.json(
          { error: `モデル "${dbModel}" が現在利用できません。しばらく待ってから再試行するか、別のモデルを選択してください。` },
          { status: status }
        );
      }
      
      return NextResponse.json(
        { error: error.error?.message || "画像の生成に失敗しました" },
        { status: status }
      );
    }

    const data: GeminiResponse = await response.json();
    
    // デバッグ用: レスポンス構造をログ出力（APIキーは含めない）
    console.log("Gemini API Response:", JSON.stringify(data, null, 2));
    
    // エラーチェック
    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Failed to generate image" },
        { status: data.error.code || 500 }
      );
    }

    // レスポンスにデータベース保存用のmodel値を含める
    return NextResponse.json({
      ...data,
      model: dbModel, // データベース保存用のモデル名を追加
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
