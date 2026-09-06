import { NextResponse } from "next/server";
import { allowedDomain, currentUser, headEmail } from "@/lib/auth";

export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json({
      user,
      domain: allowedDomain(),
      headConfigured: !!headEmail(),
    });
  } catch (e) {
    // Before the tables exist this is the first call that fails, so say so plainly.
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
