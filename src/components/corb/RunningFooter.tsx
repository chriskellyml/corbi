import { useState } from "react";
import { Button } from "../../components/ui/button";
import { CheckCircle, Loader2, Square, PlayCircle, Play, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { cn } from "../../lib/utils";
import type { RunOptions } from "./RunFooter";

interface RunningFooterProps {
    status: 'running' | 'completed' | 'error';
    runType: 'dry' | 'wet';
    
    // Actions
    onReview: () => void;
    onStop?: () => void;
    onDiscard?: (keepData: boolean) => void;
    onRunAgain?: (options: RunOptions) => void;
    onExecuteWet?: (options: RunOptions) => void;
}

export function RunningFooter({ 
    status, 
    runType,
    onReview, 
    onStop,
    onDiscard,
    onRunAgain,
    onExecuteWet
}: RunningFooterProps) {
    // Local state for re-run options
    const [limit, setLimit] = useState("10");
    const [noLimit, setNoLimit] = useState(false);
    const [threadCount, setThreadCount] = useState("4");
    const [keepData, setKeepData] = useState(false);

    const getOptions = (isDry: boolean): RunOptions => ({
        limit: noLimit ? null : parseInt(limit) || 10,
        dryRun: isDry,
        threadCount: parseInt(threadCount) || 4,
        urisMode: 'default',
        urisFile: "",
        customUrisModule: "",
        processMode: 'default',
        customProcessModule: ""
    });

    const isDryFinished = runType === 'dry' && (status === 'completed' || status === 'error');
    const isWetFinished = runType === 'wet' && (status === 'completed' || status === 'error');

    return (
        <div className="border-t border-border bg-background p-4 flex items-center justify-between shadow-up min-h-[72px]">
            {/* Left Side: Status or Inputs */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    {status === 'running' && (
                        <div className="flex items-center gap-2 text-blue-600 font-medium animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {runType === 'dry' ? 'Dry Run in progress...' : 'Executing Wet Run...'}
                        </div>
                    )}
                    {status === 'completed' && (
                        <div className="flex items-center gap-2 text-green-600 font-medium">
                            <CheckCircle className="h-4 w-4" />
                            {runType === 'dry' ? 'Dry Run Completed' : 'Execution Completed'}
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2 text-destructive font-medium">
                            <AlertCircle className="h-4 w-4" />
                            {runType === 'dry' ? 'Dry Run Failed' : 'Execution Failed'}
                        </div>
                    )}
                </div>

                {/* Adjustment Inputs (Only for Dry Run Finished) */}
                {isDryFinished && (
                    <div className="flex items-center gap-4 border-l pl-6 border-border animate-in fade-in slide-in-from-left-4">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="rf-limit" className="text-xs font-semibold text-muted-foreground uppercase">Limit</Label>
                            <Input
                                id="rf-limit"
                                type="number"
                                value={limit}
                                onChange={(e) => setLimit(e.target.value)}
                                disabled={noLimit}
                                className="w-16 h-7 text-xs"
                            />
                            <div className="flex items-center space-x-1.5">
                                <Checkbox 
                                    id="rf-no-limit" 
                                    checked={noLimit} 
                                    onCheckedChange={(c) => setNoLimit(!!c)} 
                                    className="h-3.5 w-3.5"
                                />
                                <Label htmlFor="rf-no-limit" className="cursor-pointer text-xs font-normal">None</Label>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Label htmlFor="rf-threads" className="text-xs font-semibold text-muted-foreground uppercase">Threads</Label>
                            <Input
                                id="rf-threads"
                                type="number"
                                value={threadCount}
                                onChange={(e) => setThreadCount(e.target.value)}
                                className="w-14 h-7 text-xs"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Right Side: Actions */}
            <div className="flex items-center gap-2">
                {status === 'running' && onStop && (
                    <Button 
                        onClick={onStop}
                        variant="destructive"
                        className="gap-2 font-semibold shadow-sm min-w-[100px]"
                    >
                        <Square className="h-4 w-4 fill-current" />
                        Stop
                    </Button>
                )}
                
                {/* Dry Run Actions */}
                {isDryFinished && (
                    <div className="flex items-center gap-3">
                         <div className="flex items-center gap-2 mr-2">
                            <Checkbox 
                                id="keep-data" 
                                checked={keepData} 
                                onCheckedChange={(c) => setKeepData(!!c)}
                            />
                            <Label htmlFor="keep-data" className="text-xs text-muted-foreground cursor-pointer">Keep logs</Label>
                         </div>
                         
                         <Button 
                            variant="secondary"
                            onClick={() => onDiscard?.(keepData)}
                            className="text-muted-foreground hover:text-destructive"
                         >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Discard
                         </Button>

                         <div className="w-px h-6 bg-border mx-1" />

                         <Button 
                            variant="outline"
                            onClick={() => onRunAgain?.(getOptions(true))}
                            className="border-amber-200 text-amber-700 hover:bg-amber-50"
                         >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Run Again
                         </Button>

                         <Button 
                            onClick={() => onExecuteWet?.(getOptions(false))}
                            className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
                         >
                            <Play className="h-4 w-4 mr-2 fill-current" />
                            Start Wet Run
                         </Button>
                    </div>
                )}

                {/* Wet Run Actions */}
                {isWetFinished && (
                    <Button 
                        onClick={onReview}
                        className="gap-2 font-semibold shadow-sm text-white min-w-[140px] bg-zinc-700 hover:bg-zinc-800"
                    >
                        Review Complete
                    </Button>
                )}
            </div>
        </div>
    );
}