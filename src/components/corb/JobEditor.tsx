import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ModuleTab } from "./ModuleTab";
import { Project } from "../../types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";

interface JobEditorProps {
    jobName: string;
    content: string;
    onChange: (newContent: string) => void;
    project: Project;
    onRefreshData?: () => void;
    currentEnv: string;
    availableEnvs: string[];
}

export function JobEditor({ jobName, content, onChange, project, onRefreshData, currentEnv, availableEnvs }: JobEditorProps) {
    const [envToToggle, setEnvToToggle] = useState<string | null>(null);

    // Parse key-values
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

    const isEnvEnabled = (env: string) => {
        const val = getProperty(`ENABLED_${env}`);
        return val === 'true';
    };

    const handleToggleConfirm = () => {
        if (!envToToggle) return;
        const isEnabled = isEnvEnabled(envToToggle);
        setProperty(`ENABLED_${envToToggle}`, isEnabled ? 'false' : 'true');
        setEnvToToggle(null);
    };

    return (
        <div className="flex flex-col h-full bg-background">
             <div className="px-4 py-2 border-b border-border bg-muted/10 flex justify-between items-center shrink-0 h-12">
                <h3 className="font-semibold text-sm">Job: {jobName.replace(/\.job$/, '')}</h3>
                
                {/* Environment Badges */}
                <div className="flex items-center gap-1.5">
                    {availableEnvs.map(env => {
                        const enabled = isEnvEnabled(env);
                        const isCurrent = currentEnv === env;
                        return (
                            <button
                                key={env}
                                onClick={() => setEnvToToggle(env)}
                                className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded border transition-all hover:scale-105 active:scale-95",
                                    enabled 
                                        ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" 
                                        : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 hover:text-gray-600",
                                    isCurrent && "ring-2 ring-primary ring-offset-1"
                                )}
                                title={`Click to ${enabled ? 'disable' : 'enable'} for ${env}`}
                            >
                                {env}
                            </button>
                        );
                    })}
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

            <AlertDialog open={!!envToToggle} onOpenChange={(open) => !open && setEnvToToggle(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {envToToggle && isEnvEnabled(envToToggle) ? `Disable Job in ${envToToggle}?` : `Enable Job in ${envToToggle}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to {envToToggle && isEnvEnabled(envToToggle) ? 'disable' : 'enable'} <strong>{jobName}</strong> for the <strong>{envToToggle}</strong> environment?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleToggleConfirm}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}