"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function Home() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // LOGIN
    const [loginEmail, setLoginEmail] = useState("test2@fanta.it");
    const [loginPassword, setLoginPassword] = useState("password123");

    // REGISTER
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regPassword2, setRegPassword2] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);

    // Redirect dopo login
    useEffect(() => {
        if (session) {
            const timer = setTimeout(() => {
                router.push("/me");
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [session, router]);

    if (status === "loading") {
        return <p className="p-6">Caricamento...</p>;
    }

    async function handleRegister() {
        if (!regEmail.trim() || !regPassword) {
            toast.error("Inserisci email e password.");
            return;
        }
        if (regPassword.length < 6) {
            toast.error("Password troppo corta (min 6 caratteri).");
            return;
        }
        if (regPassword !== regPassword2) {
            toast.error("Le password non coincidono.");
            return;
        }

        try {
            setIsRegistering(true);

            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: regEmail, password: regPassword }),
            });

            let data: any = null;
            try {
                data = await res.json();
            } catch { }

            if (!res.ok) {
                toast.error(data?.error ?? "Registrazione fallita.");
                return;
            }

            toast.success("Registrazione completata! Ora fai login.");

            // Precompilo il login con i dati appena registrati
            setLoginEmail(regEmail);
            setLoginPassword(regPassword);

            // Reset registrazione
            setRegEmail("");
            setRegPassword("");
            setRegPassword2("");
        } catch (e: any) {
            toast.error(e?.message ?? "Errore di rete.");
        } finally {
            setIsRegistering(false);
        }
    }

    async function handleLogin() {
        const res = await signIn("credentials", {
            email: loginEmail,
            password: loginPassword,
            redirect: false,
        });

        if (res?.ok) toast.success("Login OK");
        else toast.error(`Login KO: ${res?.error ?? "errore"}`);
    }

    const cardClass = `
    relative border rounded-2xl p-6 bg-white
    shadow-sm
    transition-all duration-300 ease-out
    hover:-translate-y-1 hover:shadow-2xl
    hover:border-black/20
    focus-within:ring-2 focus-within:ring-black/10
  `;

    const inputClass = `
    border rounded px-3 py-2 w-full
    transition
    focus:outline-none focus:ring-2 focus:ring-black/15 focus:border-black/30
  `;

    return (
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
            <div className="w-full max-w-6xl space-y-6">
                <h1 className="text-3xl font-bold text-center">Fanta WebApp</h1>

                {!session ? (
                    <div className="flex gap-6 justify-center items-start">
                        {/* CARD REGISTRAZIONE */}
                        <section className={`${cardClass} w-full max-w-md`}>
                            <h2 className="text-xl font-semibold mb-4">Registrazione</h2>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm mb-1">Email</label>
                                    <input
                                        className={inputClass}
                                        value={regEmail}
                                        onChange={(e) => setRegEmail(e.target.value)}
                                        placeholder="es: mario@fanta.it"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm mb-1">Password</label>
                                    <input
                                        className={inputClass}
                                        type="password"
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                        placeholder="min 6 caratteri"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm mb-1">Ripeti password</label>
                                    <input
                                        className={inputClass}
                                        type="password"
                                        value={regPassword2}
                                        onChange={(e) => setRegPassword2(e.target.value)}
                                    />
                                </div>

                                <button
                                    className="bg-black text-white rounded px-4 py-2 w-full disabled:opacity-60"
                                    onClick={handleRegister}
                                    disabled={isRegistering}
                                >
                                    {isRegistering ? "Registrazione..." : "Crea account"}
                                </button>

                                <p className="text-xs text-gray-500">
                                    La registrazione chiama <code>/api/register</code>.
                                </p>
                            </div>
                        </section>

                        {/* CARD LOGIN */}
                        <section className={`${cardClass} w-full max-w-md`}>
                            <h2 className="text-xl font-semibold mb-4">Login</h2>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm mb-1">Email</label>
                                    <input
                                        className={inputClass}
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm mb-1">Password</label>
                                    <input
                                        className={inputClass}
                                        type="password"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                    />
                                </div>

                                <button
                                    className="bg-black text-white rounded px-4 py-2 w-full"
                                    onClick={handleLogin}
                                >
                                    Login
                                </button>
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="max-w-xl mx-auto border rounded-2xl p-6 bg-white shadow-sm text-center space-y-2">
                        <p className="text-gray-700">
                            Login effettuato come <span className="font-semibold">{session.user?.email}</span>
                        </p>
                        <p className="text-gray-500 text-sm">
                            Reindirizzamento in corso a <span className="font-mono">/team</span>…
                        </p>

                        <button
                            className="mt-3 bg-gray-200 rounded px-4 py-2"
                            onClick={() => signOut({ redirect: false })}
                        >
                            Logout
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
