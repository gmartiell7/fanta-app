export type GameMode = "MANTRA" | "CLASSIC";

export type StatRow = {
    matchday: number;
    vote: number | null;
    gf: number;
    gs: number;
    rp: number;
    rs: number;
    rf: number;
    au: number;
    amm: number;
    esp: number;
    ass: number;
};

export type PlayerFromDB = {
    id: string;
    name: string;
    team: string;
    roleMantra: string | null;
    roleClassic?: string | null;
    stats?: StatRow[];
};
