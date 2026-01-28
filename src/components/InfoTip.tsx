"use client";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export default function InfoTip({ text }: { text: string }) {
    return (
        <TooltipProvider delayDuration={120}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="
              inline-flex items-center justify-center
              h-6 w-6 rounded-full
              bg-slate-900/5 hover:bg-slate-900/10
              text-slate-700
              border border-slate-200
              transition
              active:scale-[0.98]
            "
                        aria-label="Info"
                    >
                        i
                    </button>
                </TooltipTrigger>

                <TooltipContent className="max-w-[360px]">
                    <p className="text-sm">{text}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
