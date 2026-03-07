import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const requestSchema = z.object({
  owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  repo: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  prNumber: z.coerce.number().int().positive(),
  maxFiles: z.coerce.number().int().min(1).max(100).optional(),
});

const modelOutputSchema = z.object({
  summary: z.string().default(""),
  findings: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]).default("medium"),
        title: z.string().min(1).max(300),
        detail: z.string().min(1).max(2000),
        path: z.string().min(1).max(500),
        line: z.number().int().positive().nullable().optional(),
      })
    )
    .default([]),
});

interface GithubPullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GithubPull {
  title: string;
  body: string | null;
  html_url: string;
}

const GITHUB_API_BASE = "https://api.github.com";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_REVIEW_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_FILES = 30;
const MAX_PATCH_CHARS = 5000;
const MAX_TOTAL_PROMPT_CHARS = 120_000;

function buildGitHubHeaders(token: string | undefined): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "persta-pr-review",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toSafeJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return { summary: "", findings: [] };
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated]`;
}

async function fetchPull(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<GithubPull> {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: buildGitHubHeaders(token),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR取得に失敗しました (${res.status}): ${text}`);
  }

  return (await res.json()) as GithubPull;
}

async function fetchPullFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<GithubPullFile[]> {
  const files: GithubPullFile[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      {
        headers: buildGitHubHeaders(token),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub変更ファイル取得に失敗しました (${res.status}): ${text}`);
    }

    const pageFiles = (await res.json()) as GithubPullFile[];
    files.push(...pageFiles);

    if (pageFiles.length < 100) {
      break;
    }
  }

  return files;
}

function buildReviewPrompt(
  pr: GithubPull,
  files: GithubPullFile[],
  owner: string,
  repo: string,
  prNumber: number
) {
  let totalChars = 0;
  const fileSections: string[] = [];
  let truncatedBySize = false;

  for (const file of files) {
    const patch = file.patch
      ? truncate(file.patch, MAX_PATCH_CHARS)
      : "[no textual patch available]";
    const section = [
      `### ${file.filename}`,
      `status: ${file.status}, additions: ${file.additions}, deletions: ${file.deletions}`,
      "```diff",
      patch,
      "```",
    ].join("\n");

    if (totalChars + section.length > MAX_TOTAL_PROMPT_CHARS) {
      truncatedBySize = true;
      break;
    }

    fileSections.push(section);
    totalChars += section.length;
  }

  const prompt = `
あなたはシニアソフトウェアエンジニアとしてPRレビューを実施してください。
重大なバグ、セキュリティ問題、仕様逸脱、性能劣化の可能性を優先して指摘してください。
軽微なスタイル指摘は最小限にしてください。

対象PR:
- repository: ${owner}/${repo}
- number: ${prNumber}
- title: ${pr.title}
- url: ${pr.html_url}
- body:
${truncate(pr.body ?? "(no description)", 2000)}

変更ファイル:
${fileSections.join("\n\n")}

必ず以下のJSON形式のみを返してください（前後に説明文を付けない）:
{
  "summary": "レビュー要約",
  "findings": [
    {
      "severity": "high | medium | low",
      "title": "短い指摘タイトル",
      "detail": "具体的な問題点と影響",
      "path": "relative/file/path.ts",
      "line": 123
    }
  ]
}

要件:
- line は可能な限り実在する変更行を指定（不明なら null）
- path は変更ファイルの相対パスを使用
- 問題がなければ findings は空配列
`.trim();

  return {
    prompt,
    truncatedBySize,
  };
}

async function reviewWithGemini(prompt: string) {
  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY (または GOOGLE_AI_STUDIO_API_KEY) が未設定です"
    );
  }

  const model = process.env.GITHUB_REVIEW_GEMINI_MODEL || DEFAULT_REVIEW_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Geminiレビュー失敗 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Geminiレスポンスが空です");
  }

  const json = toSafeJsonText(text);
  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("GeminiレスポンスのJSON形式が不正です");
  }

  return parsed.data;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const body = await request.json();
    const input = requestSchema.parse(body);
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    const pr = await fetchPull(input.owner, input.repo, input.prNumber, token);
    const allFiles = await fetchPullFiles(
      input.owner,
      input.repo,
      input.prNumber,
      token
    );
    const reviewedFiles = allFiles.slice(0, input.maxFiles ?? DEFAULT_MAX_FILES);

    const { prompt, truncatedBySize } = buildReviewPrompt(
      pr,
      reviewedFiles,
      input.owner,
      input.repo,
      input.prNumber
    );
    const review = await reviewWithGemini(prompt);
    const validPaths = new Set(reviewedFiles.map((file) => file.filename));

    const findings = review.findings
      .filter((finding) => validPaths.has(finding.path))
      .map((finding, index) => ({
        id: `${finding.path}:${finding.line ?? 0}:${index}`,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        path: finding.path,
        line: finding.line ?? null,
      }));

    return NextResponse.json({
      repository: `${input.owner}/${input.repo}`,
      prNumber: input.prNumber,
      prTitle: pr.title,
      prUrl: pr.html_url,
      summary: review.summary,
      findings,
      meta: {
        changedFiles: allFiles.length,
        reviewedFiles: reviewedFiles.length,
        truncatedByFileLimit: allFiles.length > reviewedFiles.length,
        truncatedByPromptSize: truncatedBySize,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "入力値が不正です" },
        { status: 400 }
      );
    }

    console.error("PR review route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "PRレビューに失敗しました",
      },
      { status: 500 }
    );
  }
}
