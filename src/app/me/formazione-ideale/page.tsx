import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import FormazioneIdealeClient from "./FormazioneIdealeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FormazioneIdealePage() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) redirect("/");

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, gameMode: true },
    });
    if (!dbUser?.id) redirect("/me");

    const fullTeam = await prisma.team.findUnique({
        where: { ownerId: dbUser.id },
        include: {
            players: {
                include: {
                    player: {
                        select: {
                            id: true,
                            name: true,
                            team: true,
                            roleMantra: true,
                            roleClassic: true,
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
            <FormazioneIdealeClient email={dbUser.email} players={players} initialGameMode={dbUser.gameMode} />
        </main>
    );
}
