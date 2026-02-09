import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

function toInt(v: string | null, def: number) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : def;
}

function toBool(v: string | null) {
    if (!v) return false;
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "y";
}

type Mode = "MANTRA" | "CLASSIC";

function normalizeMode(v: string | null): Mode {
    const s = String(v ?? "").trim().toUpperCase();
    return s === "CLASSIC" ? "CLASSIC" : "MANTRA";
}

export async function GET(req: Request) {
    // opzionale: se vuoi bloccare il mercato ai loggati
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const all = toBool(searchParams.get("all"));

    const page = toInt(searchParams.get("page"), 1);
    const pageSizeRaw = toInt(searchParams.get("pageSize"), 20);
    const pageSize = Math.min(100, Math.max(10, pageSizeRaw));

    const mode = normalizeMode(searchParams.get("mode"));
    const role = (searchParams.get("role") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();

    // ✅ where dinamico
    // role: su roleMantra o roleClassic in base alla modalità
    const where: {
        roleMantra?: { contains: string; mode: "insensitive" };
        roleClassic?: { equals: string; mode: "insensitive" };
        OR?: Array<
            | { name: { contains: string; mode: "insensitive" } }
            | { team: { contains: string; mode: "insensitive" } }
        >;
    } = {};

    if (role) {
        if (mode === "CLASSIC") {
            // Classic: match esatto ("P","D","C","A")
            where.roleClassic = { equals: role, mode: "insensitive" };
        } else {
            // Mantra: match “Por” dentro "Por/Dc" ecc.
            where.roleMantra = { contains: role, mode: "insensitive" };
        }
    }

    if (q) {
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { team: { contains: q, mode: "insensitive" } },
        ];
    }

    // ✅ modalità "all": per la pagina listone (senza paginazione)
    if (all) {
        const players = await prisma.player.findMany({
            where,
            orderBy: [{ name: "asc" }, { extId: "asc" }],
            take: 5000, // safety
            select: {
                id: true,
                extId: true,
                name: true,
                team: true,
                roleMantra: true,
                roleClassic: true,
                price: true,

                // ✅ nuovi campi listone avanzato
                group: true,
                rigorista: true,
                calciPiazzati: true,
                possibleSpend: true,
            },
        });

        return NextResponse.json({
            mode,
            all: true,
            total: players.length,
            players,
        });
    }

    // ✅ modalità paginata (come prima)
    const skip = (page - 1) * pageSize;

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

                // ✅ nuovi campi (non danno fastidio alla pagina vecchia)
                group: true,
                rigorista: true,
                calciPiazzati: true,
                possibleSpend: true,
            },
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
        mode,
        page,
        pageSize,
        total,
        totalPages,
        players,
    });
}
