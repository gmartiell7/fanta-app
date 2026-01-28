"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
    id: string;
    name: string;
    role: string;
    team: string;
    price: number | null;
};

export default function AdminPlayersPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [role, setRole] = useState<string>("");
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);


    const canPrev = page > 1;
    const canNext = page < totalPages;

    const query = useMemo(() => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (role) params.set("role", role);
        return `?${params.toString()}`;
    }, [page, pageSize, role]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch("/api/admin/player-roles");
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? "Errore caricamento ruoli");

                if (!cancelled) setAvailableRoles(data.roles ?? []);
            } catch (e) {
                // se fallisce, non blocchiamo la pagina
                console.error(e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);


    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/admin/players${query}`);
                const data = await res.json();

                if (!res.ok) throw new Error(data?.error ?? "Errore caricamento players");

                if (!cancelled) {
                    setPlayers(data.players ?? []);
                    setTotal(data.total ?? 0);
                    setTotalPages(data.totalPages ?? 1);
                }
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? "Errore");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [query]);

    function labelRole(r: string) {
        // etichette “umane” per i codici RM più comuni
        const map: Record<string, string> = {
            Por: "Portiere",
            Dc: "Difensore centrale",
            Ter: "Terzino",
            B: "Braccetto",
            E: "Esterno",
            M: "Mezzala",
            C: "Centrocampista",
            T: "Trequartista",
            W: "Ala (W)",
            A: "Attaccante",
            Pc: "Punta centrale",
        };

        return map[r] ? `${map[r]} (${r})` : r; // fallback: mostra il codice
    }


    return (
        <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Admin · Players</h1>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <div>
                    <strong>Totale:</strong> {total}
                </div>

                <label style={{ marginLeft: "auto" }}>
                    Page size:&nbsp;
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPage(1);
                            setPageSize(Number(e.target.value));
                        }}
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Ruolo:&nbsp;
                    <select
                        value={role}
                        onChange={(e) => {
                            setPage(1);
                            setRole(e.target.value);
                        }}
                    >
                        <option value="">Tutti</option>
                        {availableRoles.map((r) => (
                            <option key={r} value={r}>
                                {labelRole(r)}
                            </option>
                        ))}
                    </select>
                </label>


                <button onClick={() => canPrev && setPage((p) => p - 1)} disabled={!canPrev}>
                    ← Prev
                </button>
                <div>
                    Pagina <strong>{page}</strong> / {totalPages}
                </div>
                <button onClick={() => canNext && setPage((p) => p + 1)} disabled={!canNext}>
                    Next →
                </button>
            </div>

            {loading && <p>Caricamento...</p>}
            {error && <p style={{ color: "crimson" }}>{error}</p>}

            {!loading && !error && (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                {["Nome", "Ruolo", "Squadra", "Prezzo"].map((h) => (
                                    <th
                                        key={h}
                                        style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p) => (
                                <tr key={p.id}>
                                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f0f0f0" }}>{p.name}</td>
                                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f0f0f0" }}>{p.role}</td>
                                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f0f0f0" }}>{p.team}</td>
                                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f0f0f0" }}>
                                        {p.price ?? "-"}
                                    </td>
                                </tr>
                            ))}
                            {players.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: "10px 6px" }}>
                                        Nessun player trovato.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
