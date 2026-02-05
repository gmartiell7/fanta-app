import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isAdminEmail } from "@/lib/admin";

export const authOptions: NextAuthOptions = {
    session: { strategy: "jwt" },
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const email = credentials.email.trim().toLowerCase();

                const user = await prisma.user.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true,
                        password: true,
                        emailVerified: true,
                    },
                });

                if (!user) return null;

                // if (!user.emailVerified) {
                //   throw new Error("EMAIL_NOT_VERIFIED");
                // }

                const ok = await bcrypt.compare(credentials.password, user.password);
                if (!ok) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                } as any;
            },
        }),
    ],

    callbacks: {
        async jwt({ token, user }) {
            // 1) dati base al login
            if (user) {
                token.id = (user as any).id;
                token.email = (user as any).email ?? token.email;
                token.role = (user as any).role;
            }

            // 2) ✅ RIALLINEA SEMPRE role DAL DB (così admin funziona anche senza logout/login)
            const email = (token.email as string | undefined)?.toLowerCase();
            if (email) {
                const dbUser = await prisma.user.findUnique({
                    where: { email },
                    select: { id: true, role: true },
                });

                if (dbUser) {
                    token.id = (token as any).id ?? dbUser.id;
                    token.role = dbUser.role; // ✅ aggiornamento “live”
                }
            }

            // 3) ✅ isAdmin: DB role ADMIN OR allowlist env
            const role = String((token as any).role ?? "");
            (token as any).isAdmin = role === "ADMIN" || isAdminEmail(email);

            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = (token as any).id;
                (session.user as any).role = (token as any).role;
                (session.user as any).isAdmin = Boolean((token as any).isAdmin);
            }
            return session;
        },
    },

    // pages: { signIn: "/login" },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
