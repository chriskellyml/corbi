import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Environment } from "../../data/mock-fs";

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
}

export function RunDialog({ open, onOpenChange, jobName, projectName, environment, onRun }: RunDialogProps) {
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(true);
  const [threadCount, setThreadCount] = useState("4");

  const handleRun = () => {
    onRun({
      limit: noLimit ? null : parseInt(limit) || 10,
      dryRun,
      threadCount: parseInt(threadCount) || 4
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Run Configuration</DialogTitle>
          <DialogDescription>
            Configure the execution parameters for <strong>{jobName}</strong> in <strong>{projectName}</strong> on <strong>{environment}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="limit" className="text-right">
              Limit
            </Label>
            <div className="col-span-3 flex items-center gap-4">
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                disabled={noLimit}
                className="w-24"
              />
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="no-limit" 
                  checked={noLimit} 
                  onCheckedChange={(c) => setNoLimit(!!c)} 
                />
                <Label htmlFor="no-limit" className="cursor-pointer text-sm font-normal">
                  No Limit
                </Label>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="threads" className="text-right">
              Threads
            </Label>
            <div className="col-span-3">
              <Input
                id="threads"
                type="number"
                value={threadCount}
                onChange={(e) => setThreadCount(e.target.value)}
                className="w-24"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Mode</Label>
            <div className="col-span-3 flex items-center space-x-2">
              <Checkbox 
                id="dry-run" 
                checked={dryRun} 
                onCheckedChange={(c) => setDryRun(!!c)} 
              />
              <Label htmlFor="dry-run" className="cursor-pointer font-medium">
                Dry Run (Read Only)
              </Label>
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