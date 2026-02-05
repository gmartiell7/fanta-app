import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function IdealLineupCard() {
    return (
        <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
                <CardTitle>Formazione ideale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Scopri qual è la formazione ideale da inserire basandoci sulle statistiche dei tuoi giocatori.
                </p>

                <Button asChild variant="secondary" className="rounded-xl">
                    <Link href="/me/formazione-ideale">Visualizza formazione ideale</Link>
                </Button>
            </CardContent>
        </Card>
    );
}
