import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReportViewerProps {
    content: string;
    fileName: string;
    fullPath?: string;
    extraActions?: React.ReactNode;
}

export function ReportViewer({ content, fileName, fullPath, extraActions }: ReportViewerProps) {
    const [viewMode, setViewMode] = useState<'text' | 'csv'>('text');
    const [delimiter, setDelimiter] = useState("|");

    const parseCSV = (text: string, delim: string) => {
        return text.split('\n').filter(l => l.trim()).map(line => line.split(delim));
    };

    const parsedData = viewMode === 'csv' ? parseCSV(content, delimiter) : [];
    const headers = parsedData.length > 0 ? parsedData[0] : [];
    const rows = parsedData.length > 1 ? parsedData.slice(1) : [];

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20 shrink-0">
                <div className="flex items-center gap-2">
                    {viewMode === 'csv' ? <FileSpreadsheet className="h-4 w-4 text-green-600" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <TooltipProvider>
                        <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                                <span className="font-semibold text-sm cursor-help decoration-dotted underline underline-offset-2 decoration-muted-foreground/50">
                                    {fileName}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p className="font-mono text-xs">{fullPath || fileName}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                
                <div className="flex items-center gap-4">
                     {viewMode === 'csv' && (
                         <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                            <Label htmlFor="delim" className="text-xs">Delimiter:</Label>
                            <Input 
                                id="delim"
                                value={delimiter} 
                                onChange={(e) => setDelimiter(e.target.value)} 
                                className="w-12 h-7 text-center font-mono"
                                maxLength={1}
                            />
                         </div>
                     )}
                     <div className="flex items-center space-x-2 border-l pl-4 border-border">
                        <Label htmlFor="view-mode" className="text-xs font-medium cursor-pointer">View as CSV</Label>
                        <Switch 
                            id="view-mode" 
                            checked={viewMode === 'csv'} 
                            onCheckedChange={(c) => setViewMode(c ? 'csv' : 'text')} 
                        />
                    </div>
                    {extraActions && (
                        <div className="flex items-center gap-2 border-l pl-4 border-border">
                            {extraActions}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'text' ? (
                     <Textarea 
                        readOnly 
                        className="w-full h-full resize-none border-0 font-mono text-xs p-4 focus-visible:ring-0 leading-relaxed bg-transparent" 
                        value={content} 
                    />
                ) : (
                    <div className="h-full overflow-auto">
                        {parsedData.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                Empty file or invalid content.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        {headers.map((h, i) => (
                                            <TableHead key={i} className="font-bold text-xs whitespace-nowrap px-4 py-2 h-9 border-b border-r last:border-r-0">{h}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row, idx) => (
                                        <TableRow key={idx} className="hover:bg-muted/10">
                                            {row.map((cell, cIdx) => (
                                                <TableCell key={cIdx} className="text-xs whitespace-nowrap px-4 py-2 border-r last:border-r-0">{cell}</TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                    {rows.length === 0 && headers.length > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={headers.length} className="text-center py-8 text-muted-foreground">No data rows found.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}