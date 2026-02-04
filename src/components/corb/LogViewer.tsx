import { useEffect, useRef, useState, useMemo } from "react";
import { Terminal, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface LogViewerProps {
    content: string;
    title: string;
    autoScroll?: boolean;
    extraActions?: React.ReactNode;
}

const HIGHLIGHT_RULES = [
    { regex: /\b(error|severe|fatal|fail|failure)\b/gi, className: "bg-red-600 text-white px-0.5 rounded-sm font-bold" },
    { regex: /\b(warn|warning|problem)\b/gi, className: "bg-orange-300 text-black px-0.5 rounded-sm font-bold" },
    { regex: /\b(success|successful|pass)\b/gi, className: "bg-emerald-700 text-white px-0.5 rounded-sm font-bold" },
];

export function LogViewer({ content, title, autoScroll = true, extraActions }: LogViewerProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isFilterMode, setIsFilterMode] = useState(false);

    // Reset scroll when new content arrives if autoScroll is on
    useEffect(() => {
        if (autoScroll && bottomRef.current && !searchTerm) {
            // Use a small timeout to ensure rendering is complete
            const timer = setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [content, autoScroll, searchTerm]);

    const lines = useMemo(() => {
        return content ? content.split('\n') : [];
    }, [content]);

    const displayLines = useMemo(() => {
        if (!searchTerm || !isFilterMode) return lines;
        const term = searchTerm.toLowerCase();
        return lines.filter(line => line.toLowerCase().includes(term));
    }, [lines, searchTerm, isFilterMode]);

    const renderLine = (line: string, index: number) => {
        if (!line) return <div key={index} className="h-4" />;

        // Prepare match ranges
        type Range = { start: number, end: number, className: string };
        const ranges: Range[] = [];

        // 1. Keyword Highlights
        HIGHLIGHT_RULES.forEach(rule => {
             const regex = new RegExp(rule.regex); 
             let match;
             while ((match = regex.exec(line)) !== null) {
                 ranges.push({
                     start: match.index,
                     end: regex.lastIndex,
                     className: rule.className
                 });
             }
        });

        // 2. Search Term Highlight
        if (searchTerm) {
            const lowerLine = line.toLowerCase();
            const lowerTerm = searchTerm.toLowerCase();
            let idx = lowerLine.indexOf(lowerTerm);
            while (idx !== -1) {
                ranges.push({
                    start: idx,
                    end: idx + lowerTerm.length,
                    className: "bg-yellow-600 text-white font-bold px-0.5 rounded-sm"
                });
                idx = lowerLine.indexOf(lowerTerm, idx + 1);
            }
        }

        if (ranges.length === 0) {
            return <div key={index} className="break-all whitespace-pre-wrap">{line}</div>;
        }

        // Handle Overlaps: Sort by start index
        ranges.sort((a, b) => a.start - b.start);

        const segments: React.ReactNode[] = [];
        let cursor = 0;

        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            
            // Skip if completely contained in previous (simplified overlap handling)
            if (range.start < cursor) continue; 

            // Add text before match
            if (range.start > cursor) {
                segments.push(line.substring(cursor, range.start));
            }

            // Add match
            segments.push(
                <span key={`${index}-m-${i}`} className={range.className}>
                    {line.substring(range.start, range.end)}
                </span>
            );
            
            cursor = range.end;
        }

        // Remaining text
        if (cursor < line.length) {
            segments.push(line.substring(cursor));
        }

        return <div key={index} className="break-all whitespace-pre-wrap">{segments}</div>;
    };

    return (
        <div className="flex flex-col h-full bg-black text-zinc-300 font-mono text-xs [color-scheme:dark]">
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
                <Terminal className="h-4 w-4 text-green-500 shrink-0" />
                <span className="font-semibold text-zinc-100 uppercase tracking-wider mr-4 truncate" title={title}>{title}</span>
                
                <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md ml-auto sm:ml-0">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 group-focus-within:text-zinc-300" />
                        <Input 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Find..."
                            className="h-7 pl-8 bg-zinc-950 border-zinc-800 text-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-700 focus-visible:border-zinc-700 text-xs shadow-inner placeholder:text-zinc-600"
                        />
                    </div>
                    <Toggle 
                        pressed={isFilterMode} 
                        onPressedChange={setIsFilterMode}
                        size="sm"
                        className={cn(
                            "h-7 px-2 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300",
                            isFilterMode ? "bg-zinc-700 text-zinc-100 border-zinc-600" : "bg-zinc-950 text-zinc-500"
                        )}
                        title="Filter mode: Only show matching lines"
                    >
                        <Filter className="h-3.5 w-3.5" />
                    </Toggle>
                </div>

                {extraActions && (
                    <div className="flex items-center gap-2 pl-2 border-l border-zinc-800 ml-2">
                        {extraActions}
                    </div>
                )}
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-0.5">
                 {lines.length === 0 ? (
                    <span className="text-zinc-600 italic">No logs available.</span>
                ) : (
                    <>
                        {displayLines.length === 0 && searchTerm ? (
                            <div className="text-zinc-500 italic px-2">No lines match "{searchTerm}"</div>
                        ) : (
                            displayLines.map((line, i) => renderLine(line, i))
                        )}
                    </>
                )}
                <div ref={bottomRef} className="h-px w-full" />
            </div>
        </div>
    );
}