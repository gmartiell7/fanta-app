import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type PlayerGroup =
    | "TOP"
    | "SEMITOP"
    | "JOLLY"
    | "OTTIMO_TITOLARE"
    | "BUON_TITOLARE"
    | "DA_VOTO"
    | "EVITABILE";

type CertaintyLevel = "NONE" | "PROBABLE" | "SURE";

function jsonErr(message: string, status = 400, extra?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}
function jsonOk(data: Record<string, unknown>) {
    return NextResponse.json({ ok: true, ...data });
}

function norm(v: unknown) {
    return String(v ?? "").trim();
}

function toIntOrNull(v: unknown) {
    const s = norm(v);
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
}

function isCertainty(v: string): v is CertaintyLevel {
    return v === "NONE" || v === "PROBABLE" || v === "SURE";
}

function isGroup(v: string): v is PlayerGroup {
    return (
        v === "TOP" ||
        v === "SEMITOP" ||
        v === "JOLLY" ||
        v === "OTTIMO_TITOLARE" ||
        v === "BUON_TITOLARE" ||
        v === "DA_VOTO" ||
        v === "EVITABILE"
    );
}

// PATCH /api/admin/players/meta
// body: { extId: number, group?: PlayerGroup|null, rigorista?: CertaintyLevel, calciPiazzati?: CertaintyLevel, possibleSpend?: number|null }
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return jsonErr("Non autorizzato", 401);

    let body: any;
    try {
        body = await req.json();
    } catch {
        return jsonErr("Body JSON non valido", 400);
    }

    const extIdRaw = body?.extId;
    const extId = Number(extIdRaw);
    if (!Number.isFinite(extId) || extId <= 0) {
        return jsonErr("extId non valido", 400);
    }

    // accettiamo patch parziali
    const patch: Record<string, any> = {};

    if ("group" in body) {
        const g = body.group;
        if (g === null || g === "") {
            patch.group = null;
        } else {
            const s = norm(g);
            if (!isGroup(s)) return jsonErr("group non valido", 400);
            patch.group = s;
        }
    }

    if ("rigorista" in body) {
        const s = norm(body.rigorista);
        if (!isCertainty(s)) return jsonErr("rigorista non valido", 400);
        patch.rigorista = s;
    }

    if ("calciPiazzati" in body) {
        const s = norm(body.calciPiazzati);
        if (!isCertainty(s)) return jsonErr("calciPiazzati non valido", 400);
        patch.calciPiazzati = s;
    }

    if ("possibleSpend" in body) {
        const n = toIntOrNull(body.possibleSpend);
        // accettiamo null o numero >= 0
        if (n === null) {
            patch.possibleSpend = null;
        } else {
            if (n < 0) return jsonErr("possibleSpend non valido", 400);
            patch.possibleSpend = n;
        }
    }

    if (Object.keys(patch).length === 0) {
        return jsonErr("Nessun campo da aggiornare", 400);
    }

    try {
        const updated = await prisma.player.update({
            where: { extId: Math.trunc(extId) },
            data: patch as any,
            select: {
                extId: true,
                group: true,
                rigorista: true,
                calciPiazzati: true,
                possibleSpend: true,
            },
        });

        return jsonOk({ player: updated });
    } catch (e: any) {
        // prisma throws if not found
        const msg = String(e?.message ?? "");
        if (msg.toLowerCase().includes("record") && msg.toLowerCase().includes("not found")) {
            return jsonErr("Giocatore non trovato", 404);
        }
        return jsonErr("Errore aggiornamento", 500, { details: msg });
    }
}
