import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Play, PlayCircle, Lock, RefreshCcw, ArrowRight } from "lucide-react";
import { cn } from "../../lib/utils";

export interface RunOptions {
  limit: number | null;
  dryRun: boolean;
  threadCount: number;
  urisMode: 'default' | 'file' | 'custom';
  urisFile?: string;
  customUrisModule?: string;
  processMode: 'default' | 'custom';
  customProcessModule?: string;
}

export type RunAction = 'dry' | 'retry-dry' | 'wet';

interface RunFooterProps {
  jobName: string;
  onRun: (action: RunAction, options: RunOptions) => void;
  disabled?: boolean;
  hasLastRun: boolean;
}

export function RunFooter({ jobName, onRun, disabled, hasLastRun }: RunFooterProps) {
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("10");
  const [threadCount, setThreadCount] = useState("4");

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

  const handleStartDry = () => {
      onRun('dry', getOptions(true));
  };

  const handleRetryDry = () => {
      onRun('retry-dry', getOptions(true));
  };

  const handleWetRun = () => {
      onRun('wet', getOptions(false));
  };

  return (
    <div className={cn("border-t border-border bg-background p-4 flex items-center gap-6 shadow-up relative transition-all duration-300", disabled && "opacity-70 grayscale")}>
        {disabled && (
            <div className="absolute inset-0 z-10 bg-background/50 cursor-not-allowed flex items-center justify-center backdrop-blur-[1px]">
                 <div className="bg-background border rounded-full px-4 py-1.5 shadow-sm flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Lock className="h-3 w-3" /> Job Disabled
                 </div>
            </div>
        )}
        
        <div className="flex items-center gap-3">
            <Label htmlFor="limit" className="text-xs font-semibold text-muted-foreground uppercase">Limit</Label>
            <div className="flex items-center gap-2">
                <Input
                    id="limit"
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    disabled={noLimit || disabled}
                    className="w-20 h-8 text-sm"
                />
                <div className="flex items-center space-x-1.5">
                    <Checkbox 
                        id="no-limit" 
                        checked={noLimit} 
                        onCheckedChange={(c) => setNoLimit(!!c)} 
                        disabled={disabled}
                        className="h-4 w-4"
                    />
                    <Label htmlFor="no-limit" className="cursor-pointer text-xs font-normal">None</Label>
                </div>
            </div>
        </div>
        
        <div className="w-px h-8 bg-border" />

        <div className="flex items-center gap-3">
            <Label htmlFor="threads" className="text-xs font-semibold text-muted-foreground uppercase">Threads</Label>
            <Input
                id="threads"
                type="number"
                value={threadCount}
                onChange={(e) => setThreadCount(e.target.value)}
                disabled={disabled}
                className="w-16 h-8 text-sm"
            />
        </div>

        <div className="flex-1" />

        {!hasLastRun ? (
            <Button 
                onClick={handleStartDry} 
                size="sm"
                disabled={disabled}
                className="min-w-[140px] gap-2 font-semibold shadow-sm bg-amber-600 hover:bg-amber-700 text-white"
            >
                <PlayCircle className="h-4 w-4" />
                Start Dry Run
            </Button>
        ) : (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                <Button 
                    onClick={handleRetryDry} 
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    className="gap-2 font-semibold border-amber-200 hover:bg-amber-50 text-amber-700"
                >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Re-run Dry Run
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button 
                    onClick={handleWetRun} 
                    size="sm"
                    disabled={disabled}
                    className="min-w-[140px] gap-2 font-semibold shadow-sm bg-red-600 hover:bg-red-700 text-white hover:scale-105 transition-all"
                >
                    <Play className="h-4 w-4 fill-current" />
                    Execute Wet Run
                </Button>
            </div>
        )}
    </div>
  );
}