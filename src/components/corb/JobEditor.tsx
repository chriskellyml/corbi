import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ModuleTab } from "./ModuleTab";
import { Project } from "../../types";
import { Button } from "../../components/ui/button";
import { Play } from "lucide-react";

interface JobEditorProps {
    jobName: string;
    content: string;
    onChange: (newContent: string) => void;
    project: Project;
    onRefreshData?: () => void;
}

export function JobEditor({ jobName, content, onChange, project, onRefreshData }: JobEditorProps) {
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

    return (
        <div className="flex flex-col h-full bg-background">
             <div className="px-4 py-2 border-b border-border bg-muted/10 flex justify-between items-center shrink-0">
                <h3 className="font-semibold text-sm">Job: {jobName.replace(/\.job$/, '')}</h3>
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
        </div>
    );
}