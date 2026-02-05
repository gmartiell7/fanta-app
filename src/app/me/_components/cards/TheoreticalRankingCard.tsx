import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TheoreticalRankingCard() {
    return (
        <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
                <CardTitle>Classifica teorica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Impostando la tua Classifica Teorica di fine anno, sarà generata una classifica che individuerà quali squadre
                    hanno più partite &quot;favorevoli&quot; sulla base delle giornate del calendario non ancora giocate e
                    colorerà squadre e giocatori nelle tabelle. Utile soprattutto per il mercato di riparazione.
                </p>

                <Button asChild className="rounded-xl">
                    <Link href="/me/classifica-teorica">Imposta classifica teorica</Link>
                </Button>
            </CardContent>
        </Card>
    );
}
