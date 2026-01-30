"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Status = "loading" | "success" | "error";

export default function VerifyEmailClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [status, setStatus] = useState<Status>("loading");
    const [message, setMessage] = useState<string>("");

    const calledRef = useRef(false);

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setMessage("Token mancante o non valido.");
            return;
        }

        // evita doppia chiamata in StrictMode
        if (calledRef.current) return;
        calledRef.current = true;

        async function verify() {
            try {
                const res = await fetch("/api/verify-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });

                const data = await res.json().catch(() => null);

                if (!res.ok) {
                    throw new Error(data?.error || "Verifica fallita");
                }

                setStatus("success");
                setMessage("Email verificata con successo 🎉");

                setTimeout(() => {
                    router.push("/"); // se non hai /login, cambia con "/"
                }, 3000);
            } catch (err: any) {
                setStatus("error");
                setMessage(err?.message || "Errore durante la verifica.");
            }
        }

        verify();
    }, [token, router]);

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-md rounded-xl border bg-white p-6 text-center shadow">
                {status === "loading" && (
                    <>
                        <h1 className="mb-2 text-xl font-semibold">
                            Verifica email in corso…
                        </h1>
                        <p className="text-sm text-gray-600">Attendi qualche secondo.</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <h1 className="mb-2 text-xl font-semibold text-green-600">
                            Email verificata ✅
                        </h1>
                        <p className="text-sm text-gray-700">
                            Il tuo account è ora attivo.
                            <br />
                            Verrai reindirizzato al login tra pochi secondi.
                        </p>
                    </>
                )}

                {status === "error" && (
                    <>
                        <h1 className="mb-2 text-xl font-semibold text-red-600">
                            Verifica non riuscita ❌
                        </h1>
                        <p className="mb-4 text-sm text-gray-700">
                            {message || "Il link potrebbe essere scaduto o non valido."}
                        </p>

                        <button
                            onClick={() => router.push("/")}
                            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                        >
                            Torna alla home
                        </button>
                    </>
                )}
            </div>
        </main>
    );
}
