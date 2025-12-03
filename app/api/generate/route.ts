import { NextRequest, NextResponse } from "next/server";
import { generationRequestSchema } from "@/features/generation/lib/schema";
import { buildPrompt } from "@/features/generation/lib/prompt-builder";
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

    const { prompt, sourceImageBase64, sourceImageMimeType, backgroundChange, count, generationType } = validationResult.data;

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
    let fullPrompt: string;
    
    if (sourceImageBase64) {
      // 画像がある場合はプロンプトテンプレートを使用して構築
      fullPrompt = buildPrompt({
        generationType: generationType || 'coordinate',
        outfitDescription: prompt,
        shouldChangeBackground: backgroundChange || false,
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
      };
    } = {
      contents: [
        {
          parts,
        },
      ],
    };

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

