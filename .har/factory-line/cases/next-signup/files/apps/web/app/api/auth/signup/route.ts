import { NextResponse, type NextRequest } from "next/server";

async function handler(req: NextRequest) {
  return NextResponse.json({ ok: true });
}

export const POST = handler;
