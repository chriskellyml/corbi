import { useState, useEffect } from "react";
import { PropertiesEditor } from "./PropertiesEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ModuleTab } from "./ModuleTab";
import { Project } from "../../types";
import { cn } from "../../lib/utils";

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
        <div className="flex h-full w-full bg-background overflow-hidden">
            {/* Left Pane: Properties (Always Visible) */}
            <div className="w-1/2 flex flex-col border-r border-border min-w-[300px]">
                 <div className="px-4 py-2 border-b border-border bg-muted/10 h-10 flex items-center">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Job Definition</h3>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    <PropertiesEditor 
                        content={content}
                        onChange={onChange}
                        title={jobName}
                    />
                </div>
                <div className="p-4 border-t bg-muted/20 shrink-0">
                     <button 
                        className="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                        onClick={onRunJob}
                     >
                        Configure & Run Job
                    </button>
                </div>
            </div>

            {/* Right Pane: Module Tabs */}
            <div className="w-1/2 flex flex-col min-w-[300px] bg-muted/5">
                <Tabs defaultValue="uris" className="flex flex-col h-full w-full">
                    <div className="px-4 border-b bg-background shrink-0 h-10 flex items-center">
                        <TabsList className="h-full w-full justify-start p-0 bg-transparent gap-6">
                            <TabsTrigger 
                                value="uris" 
                                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground shadow-none"
                            >
                                URIS
                            </TabsTrigger>
                            <TabsTrigger 
                                value="process" 
                                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground shadow-none"
                            >
                                PROCESS
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="uris" className="flex-1 p-0 m-0 overflow-hidden relative h-full">
                        <ModuleTab 
                            type="uris"
                            currentValue={getProperty('URIS-MODULE') || getProperty('URIS_MODULE')}
                            onChange={(val) => setProperty('URIS-MODULE', val)}
                            project={project}
                        />
                    </TabsContent>

                    <TabsContent value="process" className="flex-1 p-0 m-0 overflow-hidden relative h-full">
                         <ModuleTab 
                            type="process"
                            currentValue={getProperty('PROCESS-MODULE') || getProperty('PROCESS_MODULE')}
                            onChange={(val) => setProperty('PROCESS-MODULE', val)}
                            project={project}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}