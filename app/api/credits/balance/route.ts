import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to retrieve credit balance:", error);
      return NextResponse.json(
        { error: "Failed to retrieve credit balance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ balance: data?.balance ?? 0 });
  } catch (error) {
    console.error("Credit balance route error:", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
