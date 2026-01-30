import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function sha256(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
    try {
        const { token } = (await req.json()) as { token?: string };
        if (!token) return NextResponse.json({ error: "Token mancante" }, { status: 400 });

        const tokenHash = sha256(token);

        const row = await prisma.emailVerificationToken.findUnique({
            where: { tokenHash },
        });

        if (!row) return NextResponse.json({ error: "Token non valido" }, { status: 400 });
        if (row.expiresAt < new Date())
            return NextResponse.json({ error: "Token scaduto" }, { status: 400 });

        await prisma.user.update({
            where: { email: row.email },
            data: { emailVerified: true },
        });

        await prisma.emailVerificationToken.delete({
            where: { tokenHash },
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("VERIFY_EMAIL_ERROR:", e);
        return NextResponse.json({ error: "Errore interno" }, { status: 500 });
    }
}
