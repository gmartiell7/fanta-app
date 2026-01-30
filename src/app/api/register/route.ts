import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { registerRatelimit } from "@/lib/ratelimit";
import { resend } from "@/lib/mail";

function getClientIp(req: Request) {
    // Su Vercel: request headers disponibili, inclusi forwarded headers. :contentReference[oaicite:3]{index=3}
    const vercelFwd = req.headers.get("x-vercel-forwarded-for");
    const fwd = req.headers.get("x-forwarded-for");
    const ip = (vercelFwd ?? fwd ?? "").split(",")[0]?.trim();
    return ip || "unknown";
}

function isEmailValid(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordPolicy(pw: string) {
    const minLen = 10;
    return (
        pw.length >= minLen &&
        /[a-z]/.test(pw) &&
        /[A-Z]/.test(pw) &&
        /\d/.test(pw) &&
        /[^A-Za-z0-9]/.test(pw)
    );
}

function sha256(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
    try {
        const ip = getClientIp(req);

        const { success } = await registerRatelimit.limit(`register:${ip}`);
        if (!success) {
            return NextResponse.json(
                { error: "Troppe richieste. Riprova tra poco." },
                { status: 429 }
            );
        }

        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ error: "Body non valido" }, { status: 400 });
        }

        let { email, password, name, website } = body as {
            email?: string;
            password?: string;
            name?: string;
            website?: string; // honeypot
        };

        // honeypot anti-bot
        if (website && String(website).trim() !== "") {
            return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
        }

        email = (email ?? "").trim().toLowerCase();
        name = (name ?? "").trim();
        password = String(password ?? "");

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email e password obbligatorie" },
                { status: 400 }
            );
        }

        if (!isEmailValid(email)) {
            return NextResponse.json({ error: "Email non valida" }, { status: 400 });
        }

        if (!passwordPolicy(password)) {
            return NextResponse.json(
                { error: "Password troppo debole." },
                { status: 400 }
            );
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json({ error: "Email già registrata" }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: name || null,
                emailVerified: false,
            },
            select: { id: true, email: true },
        });

        // crea token verifica
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = sha256(rawToken);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

        await prisma.emailVerificationToken.create({
            data: {
                tokenHash,
                email,
                expiresAt,
            },
        });

        const verifyUrl = `${process.env.APP_URL}/verify-email?token=${rawToken}`;

        // invia email
        await resend.emails.send({
            from: "gmartiell7@gmail.com",
            to: email,
            subject: "Verifica la tua email",
            html: `
        <p>Clicca per verificare la tua email:</p>
        <p><a href="${verifyUrl}">Verifica email</a></p>
        <p>Se non sei stato tu, ignora questa email.</p>
      `,
        });

        return NextResponse.json(
            { id: user.id, email: user.email, emailVerified: false },
            { status: 201 }
        );
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "Email già registrata" }, { status: 409 });
        }
        console.error("REGISTER_ERROR:", error);
        return NextResponse.json({ error: "Errore interno" }, { status: 500 });
    }
}
