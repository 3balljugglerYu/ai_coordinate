import { NextResponse } from "next/server";

export function jsonError<T extends string>(
  message: string,
  errorCode: T,
  status: number
) {
  return NextResponse.json({ error: message, errorCode }, { status });
}
