import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen items-center justify-center p-6">
                    <div className="w-full max-w-md rounded-xl border bg-white p-6 text-center shadow">
                        <h1 className="mb-2 text-xl font-semibold">Verifica email…</h1>
                        <p className="text-sm text-gray-600">Attendi qualche secondo.</p>
                    </div>
                </main>
            }
        >
            <VerifyEmailClient />
        </Suspense>
    );
}
