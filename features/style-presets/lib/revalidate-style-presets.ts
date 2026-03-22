import { revalidatePath, revalidateTag } from "next/cache";

export function revalidateStylePresets() {
  revalidateTag("style-presets", "max");
  revalidatePath("/style");
  revalidatePath("/admin/style-presets");
}
