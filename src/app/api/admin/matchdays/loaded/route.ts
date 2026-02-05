import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!session || !isAdminEmail(email)) {
        return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
    }

    const rows = await prisma.matchdayStat.findMany({
        distinct: ["matchday"],
        select: { matchday: true },
        orderBy: { matchday: "asc" },
    });

    const loaded = rows
        .map((r) => Number(r.matchday))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

    return NextResponse.json({ ok: true, loaded });
}
