import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

function toInt(v: string | null, def: number) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : def;
}

export async function GET(req: Request) {
    // opzionale: se vuoi bloccare il mercato ai loggati
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const page = toInt(searchParams.get("page"), 1);
    const pageSizeRaw = toInt(searchParams.get("pageSize"), 20);
    const pageSize = Math.min(100, Math.max(10, pageSizeRaw));

    const role = (searchParams.get("role") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();

    // ✅ where dinamico
    const where: {
        roleMantra?: { contains: string; mode: "insensitive" };
        OR?: Array<
            | { name: { contains: string; mode: "insensitive" } }
            | { team: { contains: string; mode: "insensitive" } }
        >;
    } = {};

    // ruolo base: match “Por” dentro "Por;Dc" ecc.
    if (role) {
        where.roleMantra = { contains: role, mode: "insensitive" };
    }

    if (q) {
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { team: { contains: q, mode: "insensitive" } },
        ];
    }

    const skip = (page - 1) * pageSize;

    // ✅ count + page in parallelo
    const [total, players] = await Promise.all([
        prisma.player.count({ where }),
        prisma.player.findMany({
            where,
            orderBy: [{ name: "asc" }, { extId: "asc" }],
            skip,
            take: pageSize,
            select: {
                id: true,
                extId: true,
                name: true,
                team: true,
                roleMantra: true,
                roleClassic: true,
                price: true,
            },
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
        page,
        pageSize,
        total,
        totalPages,
        players,
    });
}
