import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import ClassificaTeoricaClient from "./ClassificaTeoricaClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClassificaTeoricaPage() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) redirect("/");

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
    });
    if (!dbUser?.id) redirect("/me");

    const prediction = await prisma.userPrediction.findUnique({
        where: { userId: dbUser.id },
        select: { text: true },
    });

    const listoneTeamsRaw = await prisma.player.findMany({
        distinct: ["team"],
        where: { team: { not: "" } },
        select: { team: true },
        orderBy: { team: "asc" },
    });

    const listoneTeams = listoneTeamsRaw
        .map((r) => r.team)
        .filter((t): t is string => !!t && t.trim().length > 0);

    return (
        <main className="mx-auto max-w-6xl px-4 py-6">
            <ClassificaTeoricaClient
                email={dbUser.email}
                initialPrediction={prediction?.text ?? ""}
                listoneTeams={listoneTeams}
            />
        </main>
    );
}
