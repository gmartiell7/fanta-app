import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const name = (body?.name ?? "").trim();

    if (!name) {
        return NextResponse.json({ error: "Nome squadra obbligatorio" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

    // crea se non esiste, altrimenti ritorna quella esistente
    const team = await prisma.team.upsert({
        where: { ownerId: user.id },
        update: { name },
        create: { name, ownerId: user.id },
        select: { id: true, name: true },
    });

    return NextResponse.json({ team });
}
