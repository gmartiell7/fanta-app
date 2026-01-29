import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs"; // usa Buffer tranquillo

function toInt(v: any) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseVoteRaw(v: any): { voteRaw: string | null; vote: number | null } {
    const s = String(v ?? "").trim();
    if (!s) return { voteRaw: null, vote: null };
    if (s.includes("*")) return { voteRaw: s, vote: null }; // "6*"
    const n = Number(s.replace(",", "."));
    return { voteRaw: s, vote: Number.isFinite(n) ? n : null };
}

function splitLine(line: string): string[] {
    const parts = line.split(/\t|;/g).map((x) => x.trim());
    if (parts.length <= 1) {
        return line.split(/\s{2,}/g).map((x) => x.trim());
    }
    return parts;
}

function looksLikeHeader(line: string) {
    return /^Cod\.\s*/i.test(line.trim());
}

function looksLikeData(tokens: string[]) {
    return tokens.length >= 4 && /^\d+$/.test(tokens[0] ?? "");
}

function parseMatchdayFromText(text: string): number | null {
    const m = text.match(/(\d+)\s*[ªa]\s*giornat/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user as any)?.isAdmin === true;

    if (!session?.user || !isAdmin) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "File mancante o non valido" }, { status: 400 });
    }

    const matchdayFromForm = Number(String(formData.get("matchday") ?? "").trim());

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString("utf-8");

    const matchdayFromTitle = parseMatchdayFromText(text);
    const matchday =
        Number.isFinite(matchdayFromForm) && matchdayFromForm > 0
            ? matchdayFromForm
            : matchdayFromTitle;

    if (!matchday) {
        return NextResponse.json(
            {
                error:
                    "Giornata mancante. Inserisci matchday oppure usa un file che contenga '21ª giornata' nel testo.",
            },
            { status: 400 }
        );
    }

    // 🔒 CONTROLLO: giornata già caricata
    const alreadyExists = await prisma.matchdayStat.findFirst({
        where: { matchday },
        select: { id: true },
    });

    if (alreadyExists) {
        return NextResponse.json(
            { error: `La giornata ${matchday} risulta già caricata.` },
            { status: 409 }
        );
    }

    const lines = text.split(/\r?\n/).map((l) => l.trimEnd());

    const players = await prisma.player.findMany({
        select: { id: true, extId: true },
    });

    const byExtId = new Map<number, string>();
    for (const p of players) byExtId.set(p.extId, p.id);

    let headerFound = false;
    let parsed = 0;
    let notFoundPlayers = 0;

    const toCreate: any[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (!headerFound) {
            if (looksLikeHeader(line)) headerFound = true;
            continue;
        }

        const tokens = splitLine(line);
        if (!looksLikeData(tokens)) continue;

        parsed++;

        const cod = Number(tokens[0]);
        const { voteRaw, vote } = parseVoteRaw(tokens[3]);

        const playerId = byExtId.get(cod);
        if (!playerId) {
            notFoundPlayers++;
            continue;
        }

        toCreate.push({
            matchday,
            playerId,
            voteRaw,
            vote,
            gf: toInt(tokens[4]),
            gs: toInt(tokens[5]),
            rp: toInt(tokens[6]),
            rs: toInt(tokens[7]),
            rf: toInt(tokens[8]),
            au: toInt(tokens[9]),
            amm: toInt(tokens[10]),
            esp: toInt(tokens[11]),
            ass: toInt(tokens[12]),
        });
    }

    if (!headerFound) {
        return NextResponse.json(
            { error: "Header non trovato: mi aspettavo una riga che inizia con 'Cod.'." },
            { status: 400 }
        );
    }

    const result = await prisma.matchdayStat.createMany({
        data: toCreate,
        skipDuplicates: true,
    });

    return NextResponse.json({
        matchday,
        parsed,
        inserted: result.count,
        notFoundPlayers,
    });
}
