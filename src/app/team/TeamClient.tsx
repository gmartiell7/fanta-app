"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ShieldAlert, LogOut, Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { signOut } from "next-auth/react";

type Player = {
    id: string;
    extId: number; // chiave stabile dal CSV
    name: string;

    roleMantra: string;
    roleClassic?: string | null;

    team: string;
    pg?: number;
    mv?: number | null;
    fmv?: number | null;

    price: number | null;
};

type RosterItem = {
    id: string;
    player: Player;
};

function splitRoles(roleMantra: string) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function hasRole(roleMantra: string, baseRole: string) {
    return splitRoles(roleMantra).includes(baseRole);
}

const ROLE_ROWS = [
    ["Por"],
    ["Dd", "Dc", "Ds", "B", "M", "E"],
    ["C", "T", "W", "A", "Pc"],
] as const;

const ALL_ROLES_ORDERED = ROLE_ROWS.flat() as unknown as string[];

function rosterItemsFromPlayers(players: Player[]): RosterItem[] {
    // id di TeamPlayer non ce l’abbiamo in optimistic -> ne mettiamo uno finto
    // (serve solo per key/shape); quando arriva roster dal backend sostituisce tutto.
    return players.map((p) => ({ id: `optimistic-${p.extId}`, player: p }));
}

export default function TeamPage() {
    const router = useRouter();
    const sp = useSearchParams();

    const [rosterTab, setRosterTab] = useState<string>("ALL");

    const [roster, setRoster] = useState<RosterItem[]>([]);
    const [loadingRoster, setLoadingRoster] = useState(true);

    const [availableRoles, setAvailableRoles] = useState<string[]>([]);
    const [role, setRole] = useState<string>("");
    const [search, setSearch] = useState<string>("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [players, setPlayers] = useState<Player[]>([]);
    const [playersTotalPages, setPlayersTotalPages] = useState(1);
    const [loadingPlayers, setLoadingPlayers] = useState(true);

    // Team name inline edit
    const [teamName, setTeamName] = useState("");
    const [teamNameDraft, setTeamNameDraft] = useState("");
    const [editingTeamName, setEditingTeamName] = useState(false);
    const [savingTeamName, setSavingTeamName] = useState(false);

    // lock per singolo playerExtId (anti doppio click)
    const [busyByExtId, setBusyByExtId] = useState<Record<number, boolean>>({});
    const setBusy = (extId: number, v: boolean) =>
        setBusyByExtId((prev) => ({ ...prev, [extId]: v }));

    const rosterPlayers = useMemo(() => roster.map((r) => r.player), [roster]);

    const rosterPlayerExtIds = useMemo(
        () => new Set(rosterPlayers.map((p) => Number(p.extId))),
        [rosterPlayers]
    );

    const porInRoster = useMemo(
        () => rosterPlayers.filter((p) => hasRole(p.roleMantra, "Por")).length,
        [rosterPlayers]
    );

    const rosterAllSorted = useMemo(() => {
        const roleIndex = new Map<string, number>();
        ALL_ROLES_ORDERED.forEach((r, i) => roleIndex.set(r, i));

        const getPrimaryRole = (roleMantra: string) => splitRoles(roleMantra)[0] ?? "";

        const list = [...rosterPlayers];
        list.sort((a, b) => {
            const ra = getPrimaryRole(a.roleMantra);
            const rb = getPrimaryRole(b.roleMantra);

            const ia = roleIndex.get(ra) ?? 999;
            const ib = roleIndex.get(rb) ?? 999;

            if (ia !== ib) return ia - ib;
            return a.name.localeCompare(b.name);
        });

        return list;
    }, [rosterPlayers]);

    const rosterByBaseRole = useMemo(() => {
        const map = new Map<string, Player[]>();
        const seenPerRole = new Map<string, Set<number>>();

        for (const p of rosterPlayers) {
            for (const base of splitRoles(p.roleMantra)) {
                if (!map.has(base)) map.set(base, []);
                if (!seenPerRole.has(base)) seenPerRole.set(base, new Set());

                const seen = seenPerRole.get(base)!;
                const key = Number(p.extId);
                if (!seen.has(key)) {
                    map.get(base)!.push(p);
                    seen.add(key);
                }
            }
        }

        for (const [k, list] of map.entries()) {
            list.sort((a, b) => a.name.localeCompare(b.name));
            map.set(k, list);
        }

        return map;
    }, [rosterPlayers]);

    const tabRoles = useMemo(() => {
        const base = (
            availableRoles?.length ? availableRoles : Array.from(rosterByBaseRole.keys())
        ).filter(Boolean);

        const extras = base
            .filter((r) => !ALL_ROLES_ORDERED.includes(r))
            .sort((a, b) => a.localeCompare(b));

        return [...ALL_ROLES_ORDERED, ...extras];
    }, [availableRoles, rosterByBaseRole]);

    const realTeamCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of rosterPlayers) m.set(p.team, (m.get(p.team) ?? 0) + 1);
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [rosterPlayers]);

    const playersQuery = useMemo(() => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (role) params.set("role", role);
        if (search.trim()) params.set("q", search.trim());
        return `?${params.toString()}`;
    }, [page, pageSize, role, search]);

    async function loadRoster() {
        setLoadingRoster(true);
        try {
            const res = await fetch("/api/team/players", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Errore caricamento rosa");

            setRoster(data.roster ?? []);
            const name = data.team?.name ?? "";
            setTeamName(name);
            setTeamNameDraft((prev) => (editingTeamName ? prev : name));
        } catch (e: any) {
            toast.error(e?.message ?? "Errore rosa");
        } finally {
            setLoadingRoster(false);
        }
    }

    async function loadRoles() {
        try {
            const res = await fetch("/api/player-roles", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) return;
            setAvailableRoles(data.roles ?? []);
        } catch {
            // ignore
        }
    }

    // Abort race conditions su mercato
    const playersAbortRef = useRef<AbortController | null>(null);

    async function loadPlayers() {
        playersAbortRef.current?.abort();
        const ac = new AbortController();
        playersAbortRef.current = ac;

        setLoadingPlayers(true);
        try {
            const res = await fetch(`/api/players${playersQuery}`, {
                cache: "no-store",
                signal: ac.signal,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Errore caricamento giocatori");

            setPlayers(data.players ?? []);
            setPlayersTotalPages(data.totalPages ?? 1);
        } catch (e: any) {
            if (e?.name === "AbortError") return; // cambio filtri -> ok
            toast.error(e?.message ?? "Errore mercato");
            setPlayers([]);
            setPlayersTotalPages(1);
        } finally {
            // se è stato abortito, può essere che finally parta comunque: controlliamo
            if (!ac.signal.aborted) setLoadingPlayers(false);
        }
    }

    // Init filtri da URL (una volta)
    useEffect(() => {
        const roleQ = sp.get("role") ?? "";
        const searchQ = sp.get("q") ?? "";
        const pageQ = Number(sp.get("page") ?? "1");
        const pageSizeQ = Number(sp.get("pageSize") ?? "20");

        setRole(roleQ);
        setSearch(searchQ);
        setPage(Number.isFinite(pageQ) && pageQ > 0 ? pageQ : 1);
        setPageSize(Number.isFinite(pageSizeQ) && pageSizeQ > 0 ? pageSizeQ : 20);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync filtri -> URL (debounce leggero)
    const urlTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current);

        urlTimerRef.current = window.setTimeout(() => {
            const params = new URLSearchParams();
            if (role) params.set("role", role);
            if (search.trim()) params.set("q", search.trim());
            if (page !== 1) params.set("page", String(page));
            if (pageSize !== 20) params.set("pageSize", String(pageSize));

            const qs = params.toString();
            router.replace(qs ? `/team?${qs}` : "/team");
        }, 120);

        return () => {
            if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current);
        };
    }, [role, search, page, pageSize, router]);

    useEffect(() => {
        loadRoster();
        loadRoles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadPlayers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playersQuery]);

    function startEditTeamName() {
        setTeamNameDraft(teamName);
        setEditingTeamName(true);
    }
    function cancelEditTeamName() {
        setTeamNameDraft(teamName);
        setEditingTeamName(false);
    }

    async function saveTeamName() {
        const name = teamNameDraft.trim();
        if (!name) {
            toast.error("Inserisci un nome squadra");
            return;
        }

        setSavingTeamName(true);
        try {
            const res = await fetch("/api/team/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Errore salvataggio squadra");

            setTeamName(data.team?.name ?? name);
            setEditingTeamName(false);
            toast.success("Nome squadra salvato");

            // qui ricarico SOLO per sicurezza di consistenza team + roster
            await loadRoster();
        } catch (e: any) {
            toast.error(e?.message ?? "Errore salvataggio");
        } finally {
            setSavingTeamName(false);
        }
    }

    // Optimistic helper
    function optimisticAdd(player: Player) {
        setRoster((prev) => {
            const already = prev.some((x) => Number(x.player.extId) === Number(player.extId));
            if (already) return prev;
            return [...prev, ...rosterItemsFromPlayers([player])];
        });
    }
    function optimisticRemove(playerExtId: number) {
        setRoster((prev) => prev.filter((x) => Number(x.player.extId) !== Number(playerExtId)));
    }

    async function addToRoster(playerExtId: number) {
        const extId = Number(playerExtId);
        if (!Number.isFinite(extId)) return;

        if (busyByExtId[extId]) return;

        // guardie veloci UI
        if (rosterPlayerExtIds.has(extId)) return;
        const p = players.find((x) => Number(x.extId) === extId);
        if (!p) {
            toast.error("Giocatore non trovato nella pagina corrente");
            return;
        }
        if (hasRole(p.roleMantra, "Por") && porInRoster >= 3) {
            toast.error("Max 3 portieri");
            return;
        }

        setBusy(extId, true);
        optimisticAdd(p);

        try {
            const res = await fetch("/api/team/players", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ playerExtId: extId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Errore aggiunta");

            // 🔥 backend ritorna roster aggiornato: lo usiamo, niente loadRoster()
            setRoster(data.roster ?? []);
            toast.success("Aggiunto in rosa");
        } catch (e: any) {
            // rollback
            optimisticRemove(extId);
            toast.error(e?.message ?? "Errore aggiunta");
        } finally {
            setBusy(extId, false);
        }
    }

    async function removeFromRoster(playerExtId: number) {
        const extId = Number(playerExtId);
        if (!Number.isFinite(extId)) return;

        if (busyByExtId[extId]) return;

        // snapshot per rollback
        const snapshot = roster;

        setBusy(extId, true);
        optimisticRemove(extId);

        try {
            const res = await fetch("/api/team/players", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ playerExtId: extId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Errore rimozione");

            setRoster(data.roster ?? []);
            toast.success("Rimosso dalla rosa");
        } catch (e: any) {
            setRoster(snapshot); // rollback
            toast.error(e?.message ?? "Errore rimozione");
        } finally {
            setBusy(extId, false);
        }
    }

    return (
        <div className="mx-auto w-full max-w-none p-6">
    {/* Header */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-2xl font-extrabold tracking-tight">La mia squadra</h1>

                    {/* Nome squadra inline */}
                    {!editingTeamName ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm text-muted-foreground">Nome:</div>
                            <Badge variant="secondary" className="text-sm">
                                {teamName?.trim() ? teamName : "Senza nome"}
                            </Badge>

                            <Button variant="ghost" size="sm" onClick={startEditTeamName} className="gap-2">
                                <Pencil className="h-4 w-4" />
                                Modifica
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                                value={teamNameDraft}
                                onChange={(e) => setTeamNameDraft(e.target.value)}
                                placeholder="Nome squadra (es. FC Raffy)"
                                className="sm:w-[280px]"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") saveTeamName();
                                    if (e.key === "Escape") cancelEditTeamName();
                                }}
                                autoFocus
                            />
                            <div className="flex items-center gap-2">
                                <Button onClick={saveTeamName} disabled={!teamNameDraft.trim() || savingTeamName}>
                                    {savingTeamName ? "Salvataggio…" : "Salva"}
                                </Button>
                                <Button variant="outline" onClick={cancelEditTeamName} disabled={savingTeamName}>
                                    Annulla
                                </Button>
                            </div>
                            <div className="text-xs text-muted-foreground">Invio per salvare • ESC per annullare</div>
                        </div>
                    )}

                    <p className="text-sm text-muted-foreground">Mantra style: movimento libero • Portieri max 3</p>
                </div>

                <div className="flex items-center gap-3">
                    <Badge variant={porInRoster >= 3 ? "destructive" : "secondary"}>Por {porInRoster}/3</Badge>

                    {porInRoster >= 3 && (
                        <div className="flex items-center gap-1 text-sm text-destructive">
                            <ShieldAlert className="h-4 w-4" />
                            Limite portieri raggiunto
                        </div>
                    )}

                    <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2">
                        <LogOut className="h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
    {/* ROSA */}
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            Rosa
                            <button type="button" onClick={() => setRosterTab("ALL")} className="focus:outline-none">
                                <Badge variant="outline" className="cursor-pointer hover:opacity-90">
                                    {roster.length} giocatori
                                </Badge>
                            </button>
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        {loadingRoster ? (
                            <div className="text-sm text-muted-foreground">Caricamento rosa…</div>
                        ) : roster.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Nessun giocatore in rosa.</div>
                        ) : (
                            <div className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">Totale: {roster.length}</Badge>
                                            <Badge variant={porInRoster >= 3 ? "destructive" : "secondary"}>Por {porInRoster}/3</Badge>
                                        </div>
                                <Tabs value={rosterTab} onValueChange={setRosterTab} className="w-full">
                                    <TabsList className="flex h-auto w-full flex-col items-center gap-3 bg-transparent p-0">
                                        {ROLE_ROWS.map((row, idx) => (
                                            <div
                                                key={idx}
                                                className={["flex w-full justify-center", idx === 1 ? "overflow-x-auto" : ""].join(" ")}
                                            >
                                                <div className={["flex justify-center gap-2", idx === 1 ? "flex-nowrap" : "flex-wrap"].join(" ")}>
                                                    {row.map((r) => {
                                                        const count = rosterByBaseRole.get(r)?.length ?? 0;
                                                        return (
                                                            <TabsTrigger
                                                                key={r}
                                                                value={r}
                                                                className="h-11 min-w-[74px] justify-between gap-2 rounded-xl px-3 text-sm font-semibold"
                                                            >
                                                                <span>{r}</span>
                                                                <Badge variant="secondary" className="h-6 px-2">
                                                                    {count}
                                                                </Badge>
                                                            </TabsTrigger>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </TabsList>

                                    <TabsContent value="ALL" className="mt-4">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Nome</TableHead>
                                                    <TableHead>Ruoli</TableHead>
                                                    <TableHead>Squadra</TableHead>
                                                    <TableHead>PG</TableHead>
                                                    <TableHead>Mv</TableHead>
                                                    <TableHead>FMv</TableHead>
                                                    <TableHead className="w-[80px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rosterAllSorted.map((p) => (
                                                    <TableRow key={p.extId}>
                                                        <TableCell className="font-medium">{p.name}</TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Badge
                                                                variant="secondary"
                                                                className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap"
                                                                title={p.roleMantra}
                                                            >
                                                                {p.roleMantra}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{p.team}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">{p.pg ?? 0}</TableCell>
                                                        <TableCell className="text-right">{p.mv == null ? "-" : p.mv.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right">{p.fmv == null ? "-" : p.fmv.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => removeFromRoster(p.extId)}
                                                                disabled={!!busyByExtId[p.extId]}
                                                                aria-label="Rimuovi"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TabsContent>

                                    {tabRoles.map((r) => {
                                        const list = rosterByBaseRole.get(r) ?? [];
                                        return (
                                            <TabsContent key={r} value={r} className="mt-4">
                                                {list.length === 0 ? (
                                                    <div className="text-sm text-muted-foreground">
                                                        Nessun giocatore per il ruolo <span className="font-semibold text-foreground">{r}</span>.
                                                    </div>
                                                ) : (
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Nome</TableHead>
                                                                <TableHead>Ruoli</TableHead>
                                                                <TableHead>Squadra</TableHead>
                                                                <TableHead>PG</TableHead>
                                                                <TableHead>Mv</TableHead>
                                                                <TableHead>FMv</TableHead>
                                                                <TableHead className="w-[80px]"></TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {list.map((p) => (
                                                                <TableRow key={p.extId}>
                                                                    <TableCell className="font-medium">{p.name}</TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="secondary">{p.roleMantra}</Badge>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="outline">{p.team}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{p.pg ?? 0}</TableCell>
                                                                    <TableCell className="text-right">{p.mv == null ? "-" : p.mv.toFixed(2)}</TableCell>
                                                                    <TableCell className="text-right">{p.fmv == null ? "-" : p.fmv.toFixed(2)}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => removeFromRoster(p.extId)}
                                                                            disabled={!!busyByExtId[p.extId]}
                                                                            aria-label="Rimuovi"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                )}
                                            </TabsContent>
                                        );
                                    })}
                                </Tabs>

                                <div className="rounded-xl border p-3">
                                    <div className="mb-2 text-sm font-semibold">Giocatori per squadra reale</div>
                                    <div className="flex flex-wrap gap-2">
                                        {realTeamCounts.map(([team, cnt]) => (
                                            <Badge key={team} variant="outline" className="gap-1">
                                                {team}
                                                <span className="opacity-70">·</span>
                                                {cnt}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* MERCATO */}
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Mercato</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                                <div className="mb-1 text-xs text-muted-foreground">Ruolo</div>
                                <Select
                                    value={role || "ALL"}
                                    onValueChange={(v) => {
                                        setPage(1);
                                        setRole(v === "ALL" ? "" : v);
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Tutti" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Tutti</SelectItem>
                                        {ALL_ROLES_ORDERED.map((r) => (
                                            <SelectItem key={r} value={r}>
                                                {r}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="sm:col-span-2">
                                <div className="mb-1 text-xs text-muted-foreground">Cerca</div>
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setPage(1);
                                        setSearch(e.target.value);
                                    }}
                                    placeholder="Nome o squadra…"
                                />
                            </div>
                        </div>

                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                                    Prev
                                </Button>
                                <div className="text-sm text-muted-foreground">
                                    Pagina <span className="font-semibold text-foreground">{page}</span> / {playersTotalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setPage((p) => Math.min(playersTotalPages, p + 1))}
                                    disabled={page >= playersTotalPages}
                                >
                                    Next
                                </Button>
                            </div>

                            <Select
                                value={String(pageSize)}
                                onValueChange={(v) => {
                                    setPage(1);
                                    setPageSize(Number(v));
                                }}
                            >
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["10", "20", "50", "100"].map((n) => (
                                        <SelectItem key={n} value={n}>
                                            {n} / pagina
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {loadingPlayers ? (
                            <div className="text-sm text-muted-foreground">Caricamento mercato…</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Ruolo</TableHead>
                                        <TableHead>Squadra</TableHead>
                                        <TableHead className="w-[110px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {players.map((p) => {
                                        const extId = Number(p.extId);
                                        const already = rosterPlayerExtIds.has(extId);

                                        const isPor = hasRole(p.roleMantra, "Por");
                                        const porLimitReached = isPor && porInRoster >= 3;

                                        const busy = !!busyByExtId[extId];
                                        const disabled = already || porLimitReached || busy;

                                        return (
                                            <TableRow key={p.extId} className={already ? "opacity-70" : ""}>
                                                <TableCell className="font-medium">{p.name}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary">{p.roleMantra}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{p.team}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant={already ? "secondary" : "default"}
                                                        disabled={disabled}
                                                        onClick={() => addToRoster(extId)}
                                                    >
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        {already ? "In rosa" : porLimitReached ? "Max 3 Por" : busy ? "..." : "Aggiungi"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {players.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-sm text-muted-foreground">
                                                Nessun giocatore trovato con questi filtri.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
