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
                });
                if (!user) return null;

                const ok = await bcrypt.compare(credentials.password, user.password);
                if (!ok) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role, // lo teniamo comunque se ti serve
                } as any;
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            // Porta dentro token i dati dell'utente quando fa login
            if (user) {
                token.id = (user as any).id;
                token.email = (user as any).email ?? token.email;
                token.role = (user as any).role;
            }

            // ✅ Admin sempre calcolato da ENV (robusto anche in produzione)
            const email = (token.email as string | undefined) ?? undefined;
            (token as any).isAdmin = isAdminEmail(email);

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = (token as any).id;
                (session.user as any).role = (token as any).role;

                // ✅ flag pronto per navbar / pagine protette
                (session.user as any).isAdmin = Boolean((token as any).isAdmin);
            }
            return session;
        },
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
