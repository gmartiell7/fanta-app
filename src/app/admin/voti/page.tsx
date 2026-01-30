"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type UserWithRole = {
    role?: string;
};

const TOTAL_MATCHDAYS = 38;

export default function AdminPage() {
    const { data: session, status } = useSession();
    const [file, setFile] = useState<File | null>(null);

    const [loadedDays, setLoadedDays] = useState<number[]>([]);
    const [loadingDays, setLoadingDays] = useState(false);

    if (status === "loading") return <p>Caricamento...</p>;

    const role = (session?.user as UserWithRole | undefined)?.role;
    if (!session || role !== "ADMIN") {
        return <p>Accesso negato</p>;
    }

    async function fetchLoadedDays() {
        setLoadingDays(true);
        try {
            const res = await fetch("/api/admin/matchdays/loaded", { cache: "no-store" });
            const data = await res.json();
            setLoadedDays(Array.isArray(data.loaded) ? data.loaded : []);
        } finally {
            setLoadingDays(false);
        }
    }

    useEffect(() => {
        fetchLoadedDays();
    }, []);

    const loadedSet = useMemo(() => new Set(loadedDays), [loadedDays]);

    const upload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/admin/players/upload", {
            method: "POST",
            body: formData,
        });

        const data = await res.json();
        alert(`Inseriti ${data.inserted} giocatori`);

        // ✅ se stai caricando i voti, aggiorna subito il verde
        await fetchLoadedDays();
    };

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">Admin – Carica voto</h1>

            <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <button
                className="bg-black text-white px-4 py-2 rounded"
                onClick={upload}
            >
                Carica voto
            </button>

            {/* ✅ SOTTO AL PULSANTE: GIORNATE */}
            <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                    <p className="font-semibold">Giornate (1–{TOTAL_MATCHDAYS})</p>

                    <button
                        className="text-sm underline"
                        onClick={fetchLoadedDays}
                        disabled={loadingDays}
                    >
                        {loadingDays ? "Aggiorno..." : "Aggiorna"}
                    </button>
                </div>

                <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-14 gap-2">
                    {Array.from({ length: TOTAL_MATCHDAYS }, (_, i) => i + 1).map((day) => {
                        const isLoaded = loadedSet.has(day);
                        return (
                            <div
                                key={day}
                                className={[
                                    "rounded-md border px-2 py-1 text-center text-sm font-medium",
                                    isLoaded
                                        ? "border-green-600 bg-green-100 text-green-800"
                                        : "border-gray-200 bg-white text-gray-500",
                                ].join(" ")}
                                title={isLoaded ? "Voti caricati" : "Non caricata"}
                            >
                                {day}
                            </div>
                        );
                    })}
                </div>

                <p className="text-sm text-gray-500">
                    Caricate: <span className="font-semibold">{loadedDays.length}</span> /{" "}
                    {TOTAL_MATCHDAYS}
                </p>
            </div>
        </main>
    );
}
