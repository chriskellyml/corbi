import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

interface LogViewerProps {
    content: string;
    title: string;
    autoScroll?: boolean;
    extraActions?: React.ReactNode;
}

export function LogViewer({ content, title, autoScroll = true, extraActions }: LogViewerProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [content, autoScroll]);

    return (
        <div className="flex flex-col h-full bg-black text-white font-mono text-xs">
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
                <Terminal className="h-4 w-4 text-green-500" />
                <span className="font-semibold text-zinc-300 uppercase tracking-wider">{title}</span>
                {extraActions && (
                    <div className="ml-auto flex items-center gap-2">
                        {extraActions}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-1">
                <pre className="whitespace-pre-wrap break-all leading-relaxed opacity-90">
                    {content || <span className="text-zinc-500 italic">Waiting for output...</span>}
                </pre>
                <div ref={bottomRef} />
            </div>
        </div>
    );
}