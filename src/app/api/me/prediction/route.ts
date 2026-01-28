import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const text = String(body?.text ?? "").trim();

    if (!text) return NextResponse.json({ error: "Inserisci la classifica" }, { status: 400 });
    if (text.length > 5000) return NextResponse.json({ error: "Testo troppo lungo (max 5000)" }, { status: 400 });

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!dbUser?.id) return NextResponse.json({ error: "Utente non presente nel DB" }, { status: 404 });

    const saved = await prisma.userPrediction.upsert({
        where: { userId: dbUser.id },
        update: { text },
        create: { userId: dbUser.id, text },
        select: { text: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, prediction: saved });
}
