import {
  NAME_INPUT_CREATE_INSTRUCTIONS,
  NAME_INPUT_CREATE_JSON_SCHEMA,
  type NameInputCreateModelOutput,
} from "@/shared/generation/name-input-create";
import { callLineToolModel } from "./gacha-split-openai";

/**
 * 「本文から名前の欄を作る」で使う文章の AI。モデル・呼び方は「ガチャに分ける」と同じ。
 * 返させるのは「名前に関する行の番号」の JSON だけ(shared/generation/name-input-create.ts)。
 */
export function callNameInputCreateModel(
  prompt: string,
  options: { apiKey?: string; fetchFn?: typeof fetch } = {},
): Promise<NameInputCreateModelOutput> {
  return callLineToolModel<NameInputCreateModelOutput>(
    {
      name: "name_input_create",
      logLabel: "name-input-create",
      instructions: NAME_INPUT_CREATE_INSTRUCTIONS,
      schema: NAME_INPUT_CREATE_JSON_SCHEMA,
      prompt,
    },
    options,
  );
}
