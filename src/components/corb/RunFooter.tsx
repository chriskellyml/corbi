import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Play, PlayCircle } from "lucide-react";
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

interface RunFooterProps {
  jobName: string;
  onRun: (options: RunOptions) => void;
}

export function RunFooter({ jobName, onRun }: RunFooterProps) {
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(true);
  const [threadCount, setThreadCount] = useState("4");

  const handleRun = () => {
    onRun({
      limit: noLimit ? null : parseInt(limit) || 10,
      dryRun,
      threadCount: parseInt(threadCount) || 4,
      urisMode: 'default',
      urisFile: "",
      customUrisModule: "",
      processMode: 'default',
      customProcessModule: ""
    });
  };

  return (
    <div className="border-t border-border bg-background p-4 flex items-center gap-6 shadow-up">
        <div className="flex items-center gap-3">
            <Label htmlFor="limit" className="text-xs font-semibold text-muted-foreground uppercase">Limit</Label>
            <div className="flex items-center gap-2">
                <Input
                    id="limit"
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    disabled={noLimit}
                    className="w-20 h-8 text-sm"
                />
                <div className="flex items-center space-x-1.5">
                    <Checkbox 
                        id="no-limit" 
                        checked={noLimit} 
                        onCheckedChange={(c) => setNoLimit(!!c)} 
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
                className="w-16 h-8 text-sm"
            />
        </div>

        <div className="w-px h-8 bg-border" />

        <div className="flex items-center gap-2">
            <Checkbox 
                id="dry-run" 
                checked={dryRun} 
                onCheckedChange={(c) => setDryRun(!!c)} 
            />
            <Label htmlFor="dry-run" className="cursor-pointer text-sm font-medium">Dry Run</Label>
        </div>

        <div className="flex-1" />

        <Button 
            onClick={handleRun} 
            size="sm"
            className={cn(
                "min-w-[140px] gap-2 font-semibold shadow-sm transition-all",
                dryRun 
                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                    : "bg-red-600 hover:bg-red-700 text-white hover:scale-105"
            )}
        >
            {dryRun ? <PlayCircle className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            {dryRun ? "Start Dry Run" : "Execute Job"}
        </Button>
    </div>
  );
}