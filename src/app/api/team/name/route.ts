import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim();

    if (!name) return NextResponse.json({ error: "Nome squadra obbligatorio" }, { status: 400 });
    if (name.length > 40) return NextResponse.json({ error: "Nome troppo lungo (max 40)" }, { status: 400 });

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (!dbUser?.id) return NextResponse.json({ error: "Utente non presente nel DB" }, { status: 404 });

    const team = await prisma.team.upsert({
        where: { ownerId: dbUser.id },
        update: { name },
        create: { ownerId: dbUser.id, name },
        select: { id: true, name: true },
    });

    return NextResponse.json({ ok: true, team });
}
