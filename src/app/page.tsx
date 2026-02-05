"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function Home() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // LOGIN
    const [loginEmail, setLoginEmail] = useState("esempio@fanta.it");
    const [loginPassword, setLoginPassword] = useState("password123");

    // REGISTER
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regPassword2, setRegPassword2] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);

    // Honeypot (campo che deve rimanere vuoto)
    const [website, setWebsite] = useState("");

    // Redirect dopo login (con refresh per aggiornare Server Components come NavbarServer)
    useEffect(() => {
        if (!session) return;

        const timer = setTimeout(() => {
            router.refresh(); // ✅ forza aggiornamento sessione lato server
            router.replace("/me"); // o "/team" se preferisci
        }, 300);

        return () => clearTimeout(timer);
    }, [session, router]);

    if (status === "loading") {
        return <p className="p-6">Caricamento...</p>;
    }

    function isEmailValid(email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
    }

    function passwordPolicy(pw: string) {
        // Allineata al server: min 10 + (lower/upper/number/symbol)
        const minLen = 10;
        return (
            pw.length >= minLen &&
            /[a-z]/.test(pw) &&
            /[A-Z]/.test(pw) &&
            /\d/.test(pw) &&
            /[^A-Za-z0-9]/.test(pw)
        );
    }

    async function handleRegister() {
        const email = regEmail.trim().toLowerCase();
        const pw = regPassword;

        if (!email || !pw) {
            toast.error("Inserisci email e password.");
            return;
        }

        if (!isEmailValid(email)) {
            toast.error("Email non valida.");
            return;
        }

        if (!passwordPolicy(pw)) {
            toast.error(
                "Password troppo debole: min 10 caratteri con maiuscola, minuscola, numero e simbolo."
            );
            return;
        }

        if (pw !== regPassword2) {
            toast.error("Le password non coincidono.");
            return;
        }

        try {
            setIsRegistering(true);

            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password: pw,
                    website, // honeypot (deve restare vuoto)
                }),
            });

            let data: any = null;
            try {
                data = await res.json();
            } catch { }


            {
                toast.error(data?.error ?? "Registrazione fallita.");
                return;
            }

            toast.success("Registrazione completata! Controlla l'email per verificare l'account.");

            // Precompila login
            setLoginEmail(email);
            setLoginPassword(pw);

            // reset form
            setRegEmail("");
            setRegPassword("");
            setRegPassword2("");
            setWebsite("");
        } catch (e: any) {
            toast.error(e?.message ?? "Errore di rete.");
        } finally {
            setIsRegistering(false);
        }
    }

    async function handleLogin() {
        const email = loginEmail.trim().toLowerCase();

        const res = await signIn("credentials", {
            email,
            password: loginPassword,
            redirect: false,
        });

        if (res?.ok) {
            toast.success("Login OK");
            router.replace("/me");
            setTimeout(() => router.refresh(), 0); // ✅ refresh dopo la navigazione
            return;
        }

        // ✅ messaggi migliori in base al codice errore
      //  if (res?.error === "EMAIL_NOT_VERIFIED") {
      //      toast.error("Devi verificare l'email prima di accedere. Controlla la posta.");
      //      return;
      //  }

        // NextAuth spesso restituisce "CredentialsSignin" se authorize ritorna null
        if (res?.error === "CredentialsSignin") {
            toast.error("Credenziali non valide.");
            return;
        }

        toast.error(`Login KO: ${res?.error ?? "errore"}`);
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
                                        placeholder="min 10, maiuscola/minuscola/numero/simbolo"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Min 10 caratteri, con maiuscola, minuscola, numero e simbolo.
                                    </p>
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

                                {/* Honeypot: nascosto ma presente (bot spesso lo compila) */}
                                <div className="hidden">
                                    <label className="block text-sm mb-1">Website</label>
                                    <input
                                        className={inputClass}
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                        autoComplete="off"
                                        tabIndex={-1}
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
                                    La registrazione chiama <code>/api/register</code> e invia la mail di verifica.
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

                                <p className="text-xs text-gray-500">
                                    Se non hai verificato l’email, il login verrà bloccato.
                                </p>
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="max-w-xl mx-auto border rounded-2xl p-6 bg-white shadow-sm text-center space-y-2">
                        <p className="text-gray-700">
                            Login effettuato come{" "}
                            <span className="font-semibold">{session.user?.email}</span>
                        </p>
                        <p className="text-gray-500 text-sm">
                            Reindirizzamento in corso a <span className="font-mono">/me</span>…
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
