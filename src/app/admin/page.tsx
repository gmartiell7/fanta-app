"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

type UserWithRole = {
    role?: string;
};

export default function AdminPage() {
    const { data: session, status } = useSession();
    const [file, setFile] = useState<File | null>(null);

    if (status === "loading") return <p>Caricamento...</p>;

    const role = (session?.user as UserWithRole | undefined)?.role;
    if (!session || role !== "ADMIN") {
        return <p>Accesso negato</p>;
    }

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
    };

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">Admin – Upload Listone</h1>

            <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <button
                className="bg-black text-white px-4 py-2 rounded"
                onClick={upload}
            >
                Upload CSV
            </button>
        </main>
    );
}
