import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, message }, { status });
}

// GET -> ritorna mappa { [playerKey:number]: note:string }
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return jsonError("Unauthorized", 401);

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user?.id) return jsonError("User not found", 404);

    const rows = await prisma.freeAgentNote.findMany({
        where: { userId: user.id },
        select: { playerKey: true, note: true },
    });

    const notes: Record<number, string> = {};
    for (const r of rows) notes[r.playerKey] = r.note;

    return NextResponse.json({ ok: true, notes });
}

// PUT -> salva/aggiorna nota. Se nota vuota -> cancella record.
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return jsonError("Unauthorized", 401);

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user?.id) return jsonError("User not found", 404);

    let body: any = null;
    try {
        body = await req.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const playerKey = Number(body?.playerKey);
    const noteRaw = String(body?.note ?? "");
    const note = noteRaw.trim();

    if (!Number.isFinite(playerKey)) return jsonError("playerKey non valido", 400);

    if (note.length === 0) {
        // se vuota: elimino la nota
        await prisma.freeAgentNote.deleteMany({
            where: { userId: user.id, playerKey },
        });
        return NextResponse.json({ ok: true, deleted: true, playerKey });
    }

    const saved = await prisma.freeAgentNote.upsert({
        where: { userId_playerKey: { userId: user.id, playerKey } },
        create: { userId: user.id, playerKey, note },
        update: { note },
        select: { playerKey: true, note: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, saved });
}
