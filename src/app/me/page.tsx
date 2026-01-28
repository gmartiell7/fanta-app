import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import MeClient from "./MeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MePage() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!email) redirect("/");

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
    });

    if (!dbUser?.id) {
        return (
            <main className="mx-auto max-w-6xl p-6">
                <h1 className="text-2xl font-bold">Profilo</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Sessione trovata ma utente non presente nel database.
                </p>
            </main>
        );
    }

    const team = await prisma.team.findUnique({
        where: { ownerId: dbUser.id },
        select: { id: true, name: true },
    });

    const prediction = await prisma.userPrediction.findUnique({
        where: { userId: dbUser.id },
        select: { text: true },
    });

    // ✅ Squadre esistenti nel listone (CSV -> tabella player)
    const listoneTeamsRaw = await prisma.player.findMany({
        distinct: ["team"],
        where: { team: { not: "" } },
        select: { team: true },
        orderBy: { team: "asc" },
    });

    const listoneTeams = listoneTeamsRaw
        .map((r) => r.team)
        .filter((t): t is string => !!t && t.trim().length > 0);

    // prendiamo i player e stats per calcolare la formazione ideale
    const fullTeam = await prisma.team.findUnique({
        where: { ownerId: dbUser.id },
        include: {
            players: {
                include: {
                    player: {
                        include: {
                            stats: {
                                select: {
                                    matchday: true,
                                    vote: true,
                                    gf: true,
                                    gs: true,
                                    rp: true,
                                    rs: true,
                                    rf: true,
                                    au: true,
                                    amm: true,
                                    esp: true,
                                    ass: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const players = (fullTeam?.players ?? []).map((tp) => tp.player);

    return (
        <main className="mx-auto max-w-6xl px-4 py-6">
            <MeClient
                email={dbUser.email}
                teamName={team?.name ?? ""}
                players={players as any}
                initialPrediction={prediction?.text ?? ""}
                listoneTeams={listoneTeams}
            />
        </main>
    );
}
