import { Suspense } from "react";
import TeamClient from "./TeamClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TeamPage() {
    return (
        <Suspense fallback={<div className="p-6">Caricamento...</div>}>
            <TeamClient />
        </Suspense>
    );
}
