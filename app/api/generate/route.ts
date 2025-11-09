import { NextRequest, NextResponse } from "next/server";
import { generationRequestSchema } from "@/features/generation/lib/schema";
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
        { error: validationResult.error.errors[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { prompt, sourceImageBase64, sourceImageMimeType, backgroundChange, count } = validationResult.data;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 }
      );
    }

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
    let fullPrompt = prompt;
    
    if (sourceImageBase64) {
      // 画像がある場合は着せ替え用のプロンプトを追加
      fullPrompt = `この画像の人物の顔やスタイルはそのままに、${prompt}。`;
      
      if (backgroundChange) {
        fullPrompt += "背景も新しいスタイルに合わせて変更してください。";
      } else {
        fullPrompt += "背景はできるだけそのままにしてください。";
      }
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
      };
    } = {
      contents: [
        {
          parts,
        },
      ],
    };

    // 生成枚数を指定（1-4枚）
    if (count && count > 1) {
      requestBody.generationConfig = {
        candidateCount: Math.min(count, 4),
      };
    }

    // Google AI Studio APIを呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error?.message || "Failed to generate image" },
        { status: response.status }
      );
    }

    const data: GeminiResponse = await response.json();
    
    // デバッグ用: レスポンス構造をログ出力
    console.log("Gemini API Response:", JSON.stringify(data, null, 2));
    
    // エラーチェック
    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Failed to generate image" },
        { status: data.error.code || 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

