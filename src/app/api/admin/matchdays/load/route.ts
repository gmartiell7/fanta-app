import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return admins.includes(String(email).toLowerCase());
}

type Row = {
    playerExtId: number;
    voteRaw?: string | null;
    vote?: number | null;

    gf?: number | string | null;
    gs?: number | string | null;
    rp?: number | string | null;
    rs?: number | string | null;
    rf?: number | string | null;
    au?: number | string | null;
    amm?: number | string | null;
    esp?: number | string | null;
    ass?: number | string | null;
};

function toIntSafe(v: unknown, fallback = 0) {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    if (!s) return fallback;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toFloatOrNull(v: unknown) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export async function POST(req: NextRequest) {
    try {
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
            return jsonErr("matchday non valido (intero > 0)", 400, { matchday: body?.matchday });
        }
        if (!rows || rows.length === 0) {
            return jsonErr("rows mancante o vuoto", 400);
        }

        // ✅ extIds validi
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

        const players = await prisma.player.findMany({
            where: { extId: { in: extIds } },
            select: { id: true, extId: true },
        });

        const extToId = new Map(players.map((p) => [p.extId, p.id]));
        const missingExtIds = extIds.filter((x) => !extToId.has(x));

        let upserted = 0;
        let skipped = 0;

        // ✅ transazione unica (ok). Se dovesse essere lenta, si può chunkare dopo.
        await prisma.$transaction(async (tx) => {
            for (const r of rows) {
                const extId = toInt(r?.playerExtId);
                if (!Number.isFinite(extId) || extId <= 0) {
                    skipped++;
                    continue;
                }

                const playerId = extToId.get(extId);
                if (!playerId) {
                    skipped++;
                    continue;
                }

                const voteRaw = r.voteRaw == null ? null : String(r.voteRaw);
                const vote = toFloatOrNull(r.vote);

                const data = {
                    voteRaw,
                    vote,

                    gf: toIntSafe(r.gf, 0),
                    gs: toIntSafe(r.gs, 0),
                    rp: toIntSafe(r.rp, 0),
                    rs: toIntSafe(r.rs, 0),
                    rf: toIntSafe(r.rf, 0),
                    au: toIntSafe(r.au, 0),
                    amm: toIntSafe(r.amm, 0),
                    esp: toIntSafe(r.esp, 0),
                    ass: toIntSafe(r.ass, 0),
                };

                await tx.matchdayStat.upsert({
                    where: {
                        playerId_matchday: { playerId, matchday },
                    },
                    create: { playerId, matchday, ...data },
                    update: { ...data },
                });

                upserted++;
            }
        });

        return jsonOk({
            matchday,
            received: rows.length,
            upserted,
            skipped,
            playersFound: players.length,
            missingExtIdsCount: missingExtIds.length,
            missingExtIds: missingExtIds.slice(0, 50),
        });
    } catch (e: unknown) {
        // ✅ così dal client vedrai il vero motivo del 500
        const message = e instanceof Error ? e.message : "Errore server";
        return jsonErr("Errore interno upload voti", 500, { message });
    }
}
