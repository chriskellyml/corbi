import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Environment } from "../../data/mock-fs";

// Mock data for support/collectors folder
const SUPPORT_SCRIPTS = [
  "universal-collector.xqy",
  "date-range-collector.xqy",
  "status-change-collector.xqy",
  "generic-process.xqy",
  "update-headers.xqy"
];

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobName: string;
  projectName: string;
  environment: Environment;
  onRun: (options: RunOptions) => void;
}

export interface RunOptions {
  limit: number | null;
  dryRun: boolean;
  threadCount: number;
  urisModule: {
    type: 'default' | 'file' | 'custom';
    value?: string; // filename for 'file' or script name for 'custom'
  };
  processModule: {
    type: 'default' | 'custom';
    value?: string;
  };
}

export function RunDialog({ open, onOpenChange, jobName, projectName, environment, onRun }: RunDialogProps) {
  // General Options
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(true);
  const [threadCount, setThreadCount] = useState("4");

  // Module Options
  const [urisType, setUrisType] = useState<'default' | 'file' | 'custom'>('default');
  const [urisValue, setUrisValue] = useState<string>("");
  
  const [processType, setProcessType] = useState<'default' | 'custom'>('default');
  const [processValue, setProcessValue] = useState<string>("");

  const handleRun = () => {
    onRun({
      limit: noLimit ? null : parseInt(limit) || 10,
      dryRun,
      threadCount: parseInt(threadCount) || 4,
      urisModule: {
        type: urisType,
        value: urisValue
      },
      processModule: {
        type: processType,
        value: processValue
      }
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Configuration</DialogTitle>
          <DialogDescription>
            Configure execution for <strong>{jobName}</strong> on <strong>{environment}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          
          {/* General Settings Section */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-sm text-foreground">General Settings</h3>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="limit" className="text-right text-xs uppercase text-muted-foreground font-semibold">Limit</Label>
              <div className="col-span-3 flex items-center gap-4">
                <Input
                  id="limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  disabled={noLimit}
                  className="w-24 h-8"
                />
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="no-limit" 
                    checked={noLimit} 
                    onCheckedChange={(c) => setNoLimit(!!c)} 
                  />
                  <Label htmlFor="no-limit" className="cursor-pointer text-sm font-normal">No Limit</Label>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="threads" className="text-right text-xs uppercase text-muted-foreground font-semibold">Threads</Label>
              <div className="col-span-3">
                <Input
                  id="threads"
                  type="number"
                  value={threadCount}
                  onChange={(e) => setThreadCount(e.target.value)}
                  className="w-24 h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right text-xs uppercase text-muted-foreground font-semibold">Mode</Label>
               <div className="col-span-3 flex items-center space-x-2">
                 <Checkbox 
                   id="dry-run" 
                   checked={dryRun} 
                   onCheckedChange={(c) => setDryRun(!!c)} 
                 />
                 <Label htmlFor="dry-run" className="cursor-pointer font-medium text-amber-600">Dry Run (Read Only)</Label>
               </div>
            </div>
          </div>

          {/* Module Overrides Section */}
          <div className="space-y-6">
            <h3 className="font-semibold text-sm text-foreground">Module Overrides</h3>

            {/* URIS MODULE */}
            <div className="space-y-3">
              <Label className="text-xs uppercase text-muted-foreground font-semibold">URIS Module / Selector</Label>
              <RadioGroup value={urisType} onValueChange={(v: any) => setUrisType(v)} className="flex flex-col gap-3">
                
                {/* Default */}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="default" id="uris-default" />
                  <Label htmlFor="uris-default" className="font-normal">Default (defined in job)</Label>
                </div>

                {/* File */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="file" id="uris-file" />
                    <Label htmlFor="uris-file" className="font-normal">Use URIS-FILE (Upload/Select)</Label>
                  </div>
                  {urisType === 'file' && (
                    <div className="ml-6">
                      <Input 
                        type="file" 
                        className="text-xs h-9 cursor-pointer" 
                        onChange={(e) => setUrisValue(e.target.files?.[0]?.name || "")}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">This will override URIS-MODULE.</p>
                    </div>
                  )}
                </div>

                {/* Custom */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="uris-custom" />
                    <Label htmlFor="uris-custom" className="font-normal">Custom (from support/collectors/)</Label>
                  </div>
                  {urisType === 'custom' && (
                    <div className="ml-6 w-full max-w-sm">
                      <Select value={urisValue} onValueChange={setUrisValue}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select a collector script..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORT_SCRIPTS.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </RadioGroup>
            </div>

            {/* PROCESS MODULE */}
            <div className="space-y-3 pt-2">
              <Label className="text-xs uppercase text-muted-foreground font-semibold">Process Module</Label>
              <RadioGroup value={processType} onValueChange={(v: any) => setProcessType(v)} className="flex flex-col gap-3">
                
                {/* Default */}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="default" id="process-default" />
                  <Label htmlFor="process-default" className="font-normal">Default (defined in job)</Label>
                </div>

                {/* Custom */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="process-custom" />
                    <Label htmlFor="process-custom" className="font-normal">Custom (from support/collectors/)</Label>
                  </div>
                  {processType === 'custom' && (
                    <div className="ml-6 w-full max-w-sm">
                       <Select value={processValue} onValueChange={setProcessValue}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select a process script..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORT_SCRIPTS.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </RadioGroup>
            </div>

          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleRun} className={dryRun ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"}>
            {dryRun ? "Start Dry Run" : "Execute Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}