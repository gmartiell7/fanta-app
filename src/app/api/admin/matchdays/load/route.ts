import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// (opzionale ma consigliato su Vercel: più tempo per upload grossi)
// export const maxDuration = 60;

function jsonErr(message: string, status = 400, extra?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}
function jsonOk(data: Record<string, unknown>) {
    return NextResponse.json({ ok: true, ...data });
}

function isAdminEmail(email: string | null | undefined) {
    if (!email) return false;
    const admins = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return admins.includes(email.toLowerCase());
}

type Row = {
    playerExtId: number;
    voteRaw?: string | null;
    vote?: number | null;
    gf?: number;
    gs?: number;
    rp?: number;
    rs?: number;
    rf?: number;
    au?: number;
    amm?: number;
    esp?: number;
    ass?: number;
};

function toInt(v: unknown) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function toNumOrNull(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!session || !isAdminEmail(email)) {
        return jsonErr("Non autorizzato", 403, { email });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return jsonErr("JSON non valido", 400);
    }

    const matchday = toInt(body?.matchday);
    const rows = Array.isArray(body?.rows) ? (body.rows as Row[]) : null;

    if (!Number.isFinite(matchday) || matchday <= 0) {
        return jsonErr("matchday non valido (intero > 0)", 400);
    }
    if (!rows || rows.length === 0) {
        return jsonErr("rows mancante o vuoto", 400);
    }

    // ✅ extIds unici validi
    const extIds = Array.from(
        new Set(
            rows
                .map((r) => toInt(r?.playerExtId))
                .filter((n) => Number.isFinite(n) && n > 0)
        )
    ) as number[];

    if (!extIds.length) {
        return jsonErr("Nessun playerExtId valido nelle rows", 400);
    }

    // ✅ Mappa extId -> playerId
    const players = await prisma.player.findMany({
        where: { extId: { in: extIds } },
        select: { id: true, extId: true },
    });

    const extToId = new Map(players.map((p) => [p.extId, p.id]));
    const missingExtIds = extIds.filter((x) => !extToId.has(x));

    // ✅ prepara righe "pulite" (solo quelle con playerId esistente)
    const dataToInsert = rows
        .map((r) => {
            const extId = toInt(r?.playerExtId);
            if (!Number.isFinite(extId) || extId <= 0) return null;

            const playerId = extToId.get(extId);
            if (!playerId) return null;

            return {
                playerId,
                matchday,
                voteRaw: r.voteRaw ?? null,
                vote: toNumOrNull(r.vote),
                gf: toInt(r.gf ?? 0) || 0,
                gs: toInt(r.gs ?? 0) || 0,
                rp: toInt(r.rp ?? 0) || 0,
                rs: toInt(r.rs ?? 0) || 0,
                rf: toInt(r.rf ?? 0) || 0,
                au: toInt(r.au ?? 0) || 0,
                amm: toInt(r.amm ?? 0) || 0,
                esp: toInt(r.esp ?? 0) || 0,
                ass: toInt(r.ass ?? 0) || 0,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    if (!dataToInsert.length) {
        return jsonErr("Nessuna riga valida: tutti gli extId risultano mancanti nel listone Player", 400, {
            received: rows.length,
            playersFound: players.length,
            missingExtIdsCount: missingExtIds.length,
            missingExtIds: missingExtIds.slice(0, 50),
        });
    }

    // ✅ FIX SERVERLESS: niente interactive transaction
    // Strategia idempotente: cancello i voti di quei player per quel matchday e reinserisco tutto
    const playerIds = Array.from(new Set(dataToInsert.map((x) => x.playerId)));

    try {
        const [delRes, createRes] = await prisma.$transaction([
            prisma.matchdayStat.deleteMany({
                where: {
                    matchday,
                    playerId: { in: playerIds },
                },
            }),
            prisma.matchdayStat.createMany({
                data: dataToInsert,
                // non dovrebbe servire (perché abbiamo cancellato), ma è una safety extra
                skipDuplicates: true,
            }),
        ]);

        const skipped = rows.length - dataToInsert.length;

        return jsonOk({
            matchday,
            received: rows.length,
            deleted: delRes.count,
            inserted: createRes.count,
            upserted: createRes.count, // compatibilità con UI vecchia
            skipped,
            playersFound: players.length,
            missingExtIdsCount: missingExtIds.length,
            missingExtIds: missingExtIds.slice(0, 50),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Errore Prisma";
        return jsonErr("Errore interno upload voti", 500, { message: msg });
    }
}
