// lib/fantaConfig.ts
export type GameMode = "MANTRA" | "CLASSIC";

export const MANTRA_ROLES = ["Por", "Dc", "Dd", "Ds", "E", "M", "C", "W", "T", "A", "Pc"] as const;
export const CLASSIC_ROLES = ["P", "D", "C", "A"] as const;

export const CLASSIC_MODULES = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"] as const;

export function rolesFor(mode: GameMode) {
    return mode === "CLASSIC" ? CLASSIC_ROLES : MANTRA_ROLES;
}

export type VoteStatLike = {
    vote: number | null;
    gf?: number | null;
    gs?: number | null;
    rp?: number | null;
    rs?: number | null;
    rf?: number | null;
    au?: number | null;
    amm?: number | null;
    esp?: number | null;
    ass?: number | null;
};

// ✅ FORMULA IDENTICA A MeClient
export function calcFmvMeClient(s: VoteStatLike): number | null {
    if (s.vote == null) return null;

    const gf = Number(s.gf ?? 0);
    const gs = Number(s.gs ?? 0);
    const rp = Number(s.rp ?? 0);
    const rs = Number(s.rs ?? 0);
    const rf = Number(s.rf ?? 0);
    const au = Number(s.au ?? 0);
    const amm = Number(s.amm ?? 0);
    const esp = Number(s.esp ?? 0);
    const ass = Number(s.ass ?? 0);

    return (
        s.vote +
        gf * 3 -
        gs * 1 +
        rp * 3 -
        rs * 3 +
        rf * 3 -
        au * 2 -
        amm * 0.5 -
        esp * 1 +
        ass * 1
    );
}
