import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { fetchSupportUris, fetchSupportProcess, uploadFile } from "../../lib/api";
import { Upload, FileCode } from "lucide-react";
import { toast } from "sonner";

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

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobName: string;
  projectName: string;
  environment: string;
  onRun: (options: RunOptions) => void;
}

export function RunDialog({ open, onOpenChange, jobName, projectName, environment, onRun }: RunDialogProps) {
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(true);
  const [threadCount, setThreadCount] = useState("4");

  // New Options State
  const [urisMode, setUrisMode] = useState<'default' | 'file' | 'custom'>('default');
  const [uploadedUriPath, setUploadedUriPath] = useState<string>("");
  const [uploadedUriFilename, setUploadedUriFilename] = useState<string>("");
  const [customUrisModule, setCustomUrisModule] = useState<string>("");
  
  const [processMode, setProcessMode] = useState<'default' | 'custom'>('default');
  const [customProcessModule, setCustomProcessModule] = useState<string>("");

  const [urisFiles, setUrisFiles] = useState<string[]>([]);
  const [processFiles, setProcessFiles] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
        fetchSupportUris().then(setUrisFiles).catch(console.error);
        fetchSupportProcess().then(setProcessFiles).catch(console.error);
    }
  }, [open]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const result = await uploadFile(file);
          setUploadedUriPath(result.path);
          setUploadedUriFilename(result.filename);
          toast.success("File uploaded successfully");
      } catch (err) {
          toast.error("Failed to upload file");
      }
  };

  const handleRun = () => {
    onRun({
      limit: noLimit ? null : parseInt(limit) || 10,
      dryRun,
      threadCount: parseInt(threadCount) || 4,
      urisMode,
      urisFile: uploadedUriPath,
      customUrisModule,
      processMode,
      customProcessModule
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Configuration</DialogTitle>
          <DialogDescription>
            Configure <strong>{jobName}</strong> execution.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="uris">URIS Module</TabsTrigger>
                <TabsTrigger value="process">Process Module</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="py-4 space-y-4">
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="limit" className="text-right">Limit</Label>
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
                            <Label htmlFor="no-limit" className="cursor-pointer text-sm font-normal">No Limit</Label>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="threads" className="text-right">Threads</Label>
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
                        <Label htmlFor="dry-run" className="cursor-pointer font-medium">Dry Run (Read Only)</Label>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="uris" className="py-4">
                <RadioGroup value={urisMode} onValueChange={(v: any) => setUrisMode(v)} className="space-y-4">
                    <div className="flex items-start space-x-2">
                        <RadioGroupItem value="default" id="u-default" className="mt-1" />
                        <div>
                            <Label htmlFor="u-default" className="font-medium">Default (Defined in Job)</Label>
                            <p className="text-xs text-muted-foreground">Use the URIS-MODULE defined in the .job file.</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-2">
                        <RadioGroupItem value="file" id="u-file" className="mt-1" />
                        <div className="flex-1">
                            <Label htmlFor="u-file" className="font-medium">File (Override with URIS-FILE)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Upload a file containing URIs to process.</p>
                            {urisMode === 'file' && (
                                <div className="flex gap-2 items-center">
                                    <Input 
                                        type="file" 
                                        onChange={handleFileUpload} 
                                        className="text-xs h-9 cursor-pointer"
                                    />
                                    {uploadedUriFilename && <span className="text-xs text-green-600 font-bold">{uploadedUriFilename}</span>}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-start space-x-2">
                        <RadioGroupItem value="custom" id="u-custom" className="mt-1" />
                        <div className="flex-1">
                            <Label htmlFor="u-custom" className="font-medium">Custom (support/uris/)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Select a script from the shared uris folder.</p>
                            {urisMode === 'custom' && (
                                <Select value={customUrisModule} onValueChange={setCustomUrisModule}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select uri script..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {urisFiles.length === 0 ? (
                                            <div className="p-2 text-xs text-muted-foreground">No scripts found in support/uris</div>
                                        ) : (
                                            urisFiles.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                </RadioGroup>
            </TabsContent>

            <TabsContent value="process" className="py-4">
                <RadioGroup value={processMode} onValueChange={(v: any) => setProcessMode(v)} className="space-y-4">
                    <div className="flex items-start space-x-2">
                        <RadioGroupItem value="default" id="p-default" className="mt-1" />
                        <div>
                            <Label htmlFor="p-default" className="font-medium">Default (Defined in Job)</Label>
                            <p className="text-xs text-muted-foreground">Use the PROCESS-MODULE defined in the .job file.</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-2">
                        <RadioGroupItem value="custom" id="p-custom" className="mt-1" />
                        <div className="flex-1">
                            <Label htmlFor="p-custom" className="font-medium">Custom (support/process/)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Select a script from the shared process folder.</p>
                            {processMode === 'custom' && (
                                <Select value={customProcessModule} onValueChange={setCustomProcessModule}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select process script..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {processFiles.length === 0 ? (
                                            <div className="p-2 text-xs text-muted-foreground">No scripts found in support/process</div>
                                        ) : (
                                            processFiles.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                </RadioGroup>
            </TabsContent>
        </Tabs>
        
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