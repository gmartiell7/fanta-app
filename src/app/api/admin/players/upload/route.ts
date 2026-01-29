import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs"; // usa Buffer tranquillo

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

function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.toLowerCase());
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
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  // ✅ Admin check robusto (non dipende da session.user.role)
  if (!session || !isAdminEmail(email)) {
    return jsonErr("Non autorizzato", 403, { email });
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

  const MAX_MB = 15;
  if (file.size > MAX_MB * 1024 * 1024) {
    return jsonErr(`File troppo grande (max ${MAX_MB}MB)`, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
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

  const iId = idx("Id");
  const iRM = idx("RM");
  const iNome = idx("Nome");
  const iSquadra = idx("Squadra");
  const iFvm = idx("FVM");
  const iR = idx("R"); // opzionale

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

  const map = new Map<number, ParsedPlayer>();
  for (const r of parsed) map.set(r.extId, r);
  const unique = Array.from(map.values());

  const CHUNK = 500;

  await prisma.player.createMany({
    data: unique.map((p) => ({
      extId: p.extId,
      name: p.name,
      team: p.team,
      price: p.price,
      roleMantra: p.roleMantra,
      roleClassic: p.roleClassic ?? null,
    })),
    skipDuplicates: true,
  });

  let updated = 0;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);

    const ids = chunk.map((c) => c.extId);
    const existing = await prisma.player.findMany({
      where: { extId: { in: ids } },
      select: { extId: true },
    });
    const existingSet = new Set(existing.map((x) => x.extId));

    await Promise.all(
      chunk
        .filter((p) => existingSet.has(p.extId))
        .map(async (p) => {
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
          updated++;
        })
    );
  }

  return jsonOk({
    headerIndex,
    separator: sep === "\t" ? "TAB" : ";",
    parsedRows: parsed.length,
    skippedRows: skipped,
    uniqueByExtId: unique.length,
    updatedOrInserted: updated,
  });
}
