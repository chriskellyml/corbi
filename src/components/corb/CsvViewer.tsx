import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { FileSpreadsheet, AlignLeft } from "lucide-react";
import { ScrollArea, ScrollBar } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";

interface CsvViewerProps {
    content: string;
    fileName: string;
}

export function CsvViewer({ content, fileName }: CsvViewerProps) {
    const [delimiter, setDelimiter] = useState("|");
    const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

    const parsedData = useMemo(() => {
        if (!content) return [];
        const lines = content.split('\n');
        return lines.map(line => line.split(delimiter)).filter(row => row.length > 0 && (row.length > 1 || row[0] !== ""));
    }, [content, delimiter]);

    const headers = parsedData.length > 0 ? parsedData[0] : [];
    const rows = parsedData.length > 1 ? parsedData.slice(1) : [];

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="px-4 py-2 border-b flex items-center justify-between gap-4 bg-muted/20">
                <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold">{fileName}</span>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="delim" className="text-xs whitespace-nowrap">Delimiter:</Label>
                        <Input 
                            id="delim" 
                            value={delimiter} 
                            onChange={(e) => setDelimiter(e.target.value)} 
                            className="w-10 h-7 text-center font-mono"
                            maxLength={1}
                        />
                    </div>
                    
                    <div className="flex items-center bg-muted/50 rounded-md p-0.5 border">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn("h-6 px-2 text-xs", viewMode === 'table' && "bg-white shadow-sm text-black")}
                            onClick={() => setViewMode('table')}
                        >
                            Table
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn("h-6 px-2 text-xs", viewMode === 'raw' && "bg-white shadow-sm text-black")}
                            onClick={() => setViewMode('raw')}
                        >
                            Raw
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'raw' ? (
                    <textarea 
                        readOnly 
                        className="w-full h-full resize-none p-4 font-mono text-xs focus:outline-none" 
                        value={content} 
                    />
                ) : (
                    <ScrollArea className="h-full w-full">
                        <div className="min-w-max p-4">
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            {headers.map((h, i) => (
                                                <TableHead key={i} className="whitespace-nowrap font-bold h-8 text-xs">{h}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.map((row, i) => (
                                            <TableRow key={i} className="hover:bg-muted/20">
                                                {row.map((cell, j) => (
                                                    <TableCell key={j} className="whitespace-nowrap py-1 text-xs font-mono">{cell}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                        {rows.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={headers.length || 1} className="h-24 text-center text-muted-foreground text-xs">
                                                    No data found or delimiter mismatch.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                )}
            </div>
        </div>
    );
}