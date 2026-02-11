import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(message: string, status = 400, extra?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}
function jsonOk(data: Record<string, unknown>) {
    return NextResponse.json({ ok: true, ...data });
}

function stripBom(s: string) {
    return s.replace(/^\uFEFF/, "");
}

function norm(v: unknown) {
    return stripBom(String(v ?? ""))
        .replace(/\u00A0/g, " ")
        .replace(/\u200B/g, "")
        .trim()
        .replace(/\s+/g, " ");
}

function toIntOrNull(v: unknown) {
    const s = norm(v);
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeKey(k: string) {
    return norm(k).toLowerCase();
}

function splitBySep(line: string, sep: string) {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === sep && !inQuotes) {
            out.push(cur.trim());
            cur = "";
            continue;
        }

        cur += ch;
    }

    out.push(cur.trim());
    return out;
}

function findHeader(lines: string[]) {
    const required = ["id", "rm", "nome", "squadra", "fvm"];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw) continue;

        const sep = raw.includes("\t") ? "\t" : raw.includes(";") ? ";" : null;
        if (!sep) continue;

        const cols = splitBySep(raw, sep).map(normalizeKey).filter(Boolean);
        if (required.every((r) => cols.includes(r))) {
            return {
                headerIndex: i,
                sep,
                headerCols: splitBySep(raw, sep).map((c) => stripBom(c).trim()),
            };
        }
    }
    return null;
}

function sessionIsAdmin(session: any) {
    const email = (session?.user?.email as string | undefined)?.toLowerCase();
    const role = String(session?.user?.role ?? "");
    const flag = Boolean(session?.user?.isAdmin);

    // ✅ isAdminEmail safe: se email è undefined → false
    const allow = email ? isAdminEmail(email) : false;

    return flag || role === "ADMIN" || allow;
}

type ParsedPlayer = {
    extId: number;
    name: string;
    team: string;
    price: number;
    roleMantra: string;
    roleClassic?: string;
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !sessionIsAdmin(session)) {
            return jsonErr("Non autorizzato", 403, { email: session?.user?.email ?? null });
        }

        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return jsonErr("FormData non valido", 400);
        }

        const file = formData.get("file");
        if (!(file instanceof File)) {
            return jsonErr("File mancante o non valido", 400);
        }

        // ⚠️ Nota Vercel: spesso il limite reale della request è più basso (puoi beccare 413 / body tronco).
        const MAX_MB = 15;
        if (file.size > MAX_MB * 1024 * 1024) {
            return jsonErr(`File troppo grande (max ${MAX_MB}MB)`, 413);
        }

        let buffer: Buffer;
        try {
            buffer = Buffer.from(await file.arrayBuffer());
        } catch {
            return jsonErr("Impossibile leggere il file", 400);
        }

        const text = buffer.toString("utf-8");
        const lines = text.split(/\r?\n/).map((l) => l.replace(/\r/g, ""));

        const headerInfo = findHeader(lines);
        if (!headerInfo) {
            return jsonErr(
                "Header non trovato (attesi: Id, RM, Nome, Squadra, FVM) separati da TAB o ';'.",
                400
            );
        }

        const { headerIndex, sep, headerCols } = headerInfo;
        const headerNorm = headerCols.map(normalizeKey);
        const idx = (name: string) => headerNorm.indexOf(normalizeKey(name));

        // ✅ usa nomi normalizzati (Id/RM/Nome...)
        const iId = idx("id");
        const iRM = idx("rm");
        const iNome = idx("nome");
        const iSquadra = idx("squadra");
        const iFvm = idx("fvm");
        const iR = idx("r"); // opzionale

        if ([iId, iRM, iNome, iSquadra, iFvm].some((x) => x < 0)) {
            return jsonErr("Header trovato ma colonne richieste mancanti.", 400, {
                headerCols,
                sep: sep === "\t" ? "TAB" : ";",
            });
        }

        const parsed: ParsedPlayer[] = [];
        let skipped = 0;

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            if (!line.includes(sep)) continue;

            const parts = splitBySep(line, sep);

            const extId = toIntOrNull(parts[iId]);
            const roleMantra = norm(parts[iRM]);
            const name = norm(parts[iNome]);
            const team = norm(parts[iSquadra]);
            const price = toIntOrNull(parts[iFvm]);

            const roleClassic = iR >= 0 ? norm(parts[iR]).toUpperCase() : "";

            if (!extId || !name || !team || !roleMantra) {
                skipped++;
                continue;
            }

            parsed.push({
                extId,
                name,
                team,
                price: price ?? 0,
                roleMantra,
                ...(roleClassic ? { roleClassic } : {}),
            });
        }

        if (!parsed.length) {
            return jsonErr("Nessuna riga dati valida trovata dopo l'header.", 400, {
                parsedRows: 0,
                skipped,
            });
        }

        // unique by extId (ultima occorrenza vince)
        const map = new Map<number, ParsedPlayer>();
        for (const r of parsed) map.set(r.extId, r);
        const unique = Array.from(map.values());

        const CHUNK = 800;

        const existingExtIds = new Set<number>();
        for (let i = 0; i < unique.length; i += CHUNK) {
            const chunk = unique.slice(i, i + CHUNK);
            const ids = chunk.map((c) => c.extId);

            const existing = await prisma.player.findMany({
                where: { extId: { in: ids } },
                select: { extId: true },
            });

            for (const e of existing) existingExtIds.add(e.extId);
        }

        const toCreate = unique.filter((p) => !existingExtIds.has(p.extId));
        const toUpdate = unique.filter((p) => existingExtIds.has(p.extId));

        if (toCreate.length) {
            await prisma.player.createMany({
                data: toCreate.map((p) => ({
                    extId: p.extId,
                    name: p.name,
                    team: p.team,
                    price: p.price,
                    roleMantra: p.roleMantra,
                    roleClassic: p.roleClassic ?? null,
                })),
                skipDuplicates: true,
            });
        }

        // ⚠️ contatore "updated" più stabile (no race)
        let updated = 0;
        for (let i = 0; i < toUpdate.length; i += 300) {
            const chunk = toUpdate.slice(i, i + 300);

            await Promise.all(
                chunk.map(async (p) => {
                    await prisma.player.update({
                        where: { extId: p.extId },
                        data: {
                            name: p.name,
                            team: p.team,
                            price: p.price,
                            roleMantra: p.roleMantra,
                            roleClassic: p.roleClassic ?? null,
                        },
                    });
                })
            );

            updated += chunk.length;
        }

        return jsonOk({
            headerIndex,
            separator: sep === "\t" ? "TAB" : ";",
            parsedRows: parsed.length,
            skippedRows: skipped,
            uniqueByExtId: unique.length,
            inserted: toCreate.length,
            updated,
        });
    } catch (e: any) {
        console.error("UPLOAD LISTONE FATAL:", e);
        // ✅ qui “salvi” il frontend: ritorna SEMPRE JSON anche su crash
        return jsonErr(e?.message ?? "Errore interno", 500);
    }
}
