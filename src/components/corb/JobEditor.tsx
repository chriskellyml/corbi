import { useState, useEffect } from "react";
import { PropertiesEditor } from "./PropertiesEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ModuleTab } from "./ModuleTab";
import { Project } from "../../types";

interface JobEditorProps {
    jobName: string;
    content: string;
    onChange: (newContent: string) => void;
    project: Project;
    onRunJob: () => void;
}

export function JobEditor({ jobName, content, onChange, project, onRunJob }: JobEditorProps) {
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
             <div className="px-4 py-2 border-b border-border bg-muted/10 flex justify-between items-center">
                <h3 className="font-semibold text-sm">Job: {jobName.replace(/\.job$/, '')}</h3>
            </div>
            <Tabs defaultValue="properties" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-2">
                    <TabsList className="w-full justify-start">
                        <TabsTrigger value="properties">Properties</TabsTrigger>
                        <TabsTrigger value="uris">URIS</TabsTrigger>
                        <TabsTrigger value="process">Process</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="properties" className="flex-1 flex flex-col overflow-hidden mt-0 border-t border-border/50">
                    <PropertiesEditor 
                        content={content}
                        onChange={onChange}
                    />
                    <div className="p-4 border-t bg-muted/20">
                         <button 
                            className="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                            onClick={onRunJob}
                         >
                            Configure & Run Job
                        </button>
                    </div>
                </TabsContent>

                <TabsContent value="uris" className="flex-1 overflow-hidden mt-0 border-t border-border/50">
                    <ModuleTab 
                        type="uris"
                        currentValue={getProperty('URIS-MODULE') || getProperty('URIS_MODULE')}
                        onChange={(val) => setProperty('URIS-MODULE', val)}
                        project={project}
                    />
                </TabsContent>

                <TabsContent value="process" className="flex-1 overflow-hidden mt-0 border-t border-border/50">
                     <ModuleTab 
                        type="process"
                        currentValue={getProperty('PROCESS-MODULE') || getProperty('PROCESS_MODULE')}
                        onChange={(val) => setProperty('PROCESS-MODULE', val)}
                        project={project}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}