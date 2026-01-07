import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ModuleTab } from "./ModuleTab";
import { Project } from "../../types";
import { Button } from "../../components/ui/button";
import { Play, AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";

interface JobEditorProps {
    jobName: string;
    content: string;
    onChange: (newContent: string) => void;
    project: Project;
    onRefreshData?: () => void;
    
    // New Props for permissions
    currentEnv: string;
    isEnabled: boolean;
    onToggleEnabled: () => void;
}

export function JobEditor({ jobName, content, onChange, project, onRefreshData, currentEnv, isEnabled, onToggleEnabled }: JobEditorProps) {
    const [isEnableAlertOpen, setIsEnableAlertOpen] = useState(false);

    // Parse key-values to find URIS-MODULE and PROCESS-MODULE
    const getProperty = (key: string) => {
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex !== -1) {
                const k = trimmed.substring(0, eqIndex).trim();
                if (k === key) return trimmed.substring(eqIndex + 1).trim();
            }
        }
        return "";
    };

    const setProperty = (key: string, value: string) => {
        const lines = content.split('\n');
        let found = false;
        const newLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('#') && trimmed.indexOf('=') !== -1) {
                const k = trimmed.split('=')[0].trim();
                if (k === key) {
                    found = true;
                    return `${key}=${value}`;
                }
            }
            return line;
        });
        
        if (!found) {
            // Append if not found
            if (newLines[newLines.length - 1] !== "") newLines.push("");
            newLines.push(`${key}=${value}`);
        }
        
        onChange(newLines.join('\n'));
    };
    
    const handleToggle = () => {
        if (!isEnabled) {
            // Enabling requires confirmation
            setIsEnableAlertOpen(true);
        } else {
            // Disabling - for now just do it, or maybe confirm? 
            // Prompt said: "Whichever way I enable the job... it should always come with a confirmtion"
            // Let's confirm for enabling only for now based on prompt, or maybe for both.
            // Prompt: "Whichever way I enable the job in teh environment it should always come with a confirmtion from the user."
            // Implies Enable action needs confirmation.
            onToggleEnabled();
        }
    };

    const confirmEnable = () => {
        onToggleEnabled();
        setIsEnableAlertOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-background">
             <div className="px-4 py-2 border-b border-border bg-muted/10 flex justify-between items-center shrink-0 min-h-[50px]">
                <div className="flex items-center gap-4 flex-1">
                    <h3 className="font-semibold text-sm">Job: {jobName.replace(/\.job$/, '')}</h3>
                    
                    {!isEnabled && (
                        <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-xs px-3 py-1.5 rounded-md border border-destructive/20 animate-in fade-in slide-in-from-top-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>
                                This job is not enabled in <Badge variant="destructive" className="h-5 px-1.5 ml-1 mr-1 text-[10px]">{currentEnv}</Badge>
                            </span>
                            <Button 
                                variant="link" 
                                className="h-auto p-0 text-destructive underline font-bold" 
                                onClick={handleToggle}
                            >
                                [Enable?]
                            </Button>
                        </div>
                    )}
                    
                    {isEnabled && (
                        <div className="flex items-center gap-2 bg-green-500/10 text-green-700 text-xs px-3 py-1.5 rounded-md border border-green-500/20">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Enabled in <span className="font-bold">{currentEnv}</span></span>
                            <Button 
                                variant="link" 
                                className="h-auto p-0 text-green-700/70 hover:text-green-800 ml-1" 
                                onClick={handleToggle}
                            >
                                (Disable)
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            
            <Tabs defaultValue="URIS" className="flex-1 flex flex-col min-h-0">
                <div className="px-4 pt-2 shrink-0">
                    <TabsList className="w-full justify-start">
                        <TabsTrigger value="URIS">URIS</TabsTrigger>
                        <TabsTrigger value="PROCESS">PROCESS</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="URIS" className="flex-1 flex flex-col min-h-0 mt-0 border-t border-border/50 data-[state=inactive]:hidden">
                    <ModuleTab 
                        type="uris"
                        currentValue={getProperty('URIS-MODULE') || getProperty('URIS_MODULE')}
                        onChange={(val) => setProperty('URIS-MODULE', val)}
                        project={project}
                        onRefreshData={onRefreshData}
                    />
                </TabsContent>

                <TabsContent value="PROCESS" className="flex-1 flex flex-col min-h-0 mt-0 border-t border-border/50 data-[state=inactive]:hidden">
                     <ModuleTab 
                        type="process"
                        currentValue={getProperty('PROCESS-MODULE') || getProperty('PROCESS_MODULE')}
                        onChange={(val) => setProperty('PROCESS-MODULE', val)}
                        project={project}
                        onRefreshData={onRefreshData}
                    />
                </TabsContent>
            </Tabs>

            <AlertDialog open={isEnableAlertOpen} onOpenChange={setIsEnableAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Enable Job in {currentEnv}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to enable <strong>{jobName}</strong> for the <strong>{currentEnv}</strong> environment?
                            <br/><br/>
                            This will allow execution of this job.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmEnable} className="bg-green-600 hover:bg-green-700">Yes, Enable Job</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}