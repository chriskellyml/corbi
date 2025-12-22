import { useState, useEffect, useRef } from "react";
import { Project } from "../../types";
import { fetchSupportUris, fetchSupportProcess, fetchSupportContent, saveFile } from "../../lib/api";
import { ScriptEditor } from "./ScriptEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { AlertTriangle, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";

interface ModuleTabProps {
    type: 'uris' | 'process';
    currentValue: string;
    onChange: (value: string) => void;
    project: Project;
}

type SourceType = 'project' | 'support' | 'txt';

export function ModuleTab({ type, currentValue, onChange, project }: ModuleTabProps) {
    const [sourceType, setSourceType] = useState<SourceType>('project');
    const [supportFiles, setSupportFiles] = useState<string[]>([]);
    const [content, setContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaveAlertOpen, setIsSaveAlertOpen] = useState(false);

    // Filter project scripts based on convention
    // Convention: URIS scripts are in scripts/uris/, PROCESS in scripts/process/
    // But we should also allow picking any script from project if needed?
    // The requirement says "choose a script from this project scripts/uris/*"
    const projectScripts = project.scripts.filter(s => {
        if (type === 'uris') return s.name.startsWith('uris/');
        if (type === 'process') return s.name.startsWith('process/');
        return false;
    }).filter(s => type === 'uris' ? true : !s.name.endsWith('.txt')); // Only allow .txt for URIS per req

    const txtFiles = type === 'uris' 
        ? project.scripts.filter(s => s.name.startsWith('uris/') && s.name.endsWith('.txt')) 
        : [];

    useEffect(() => {
        // Determine initial source type from currentValue
        if (!currentValue) {
            setSourceType('project');
        } else if (currentValue.startsWith('scripts/')) {
             if (currentValue.endsWith('.txt')) setSourceType('txt');
             else setSourceType('project');
        } else {
             setSourceType('support');
        }

        // Load support files list
        if (type === 'uris') fetchSupportUris().then(setSupportFiles);
        else fetchSupportProcess().then(setSupportFiles);

    }, [type, currentValue]);

    // Fetch content when currentValue or sourceType changes
    useEffect(() => {
        loadContent();
    }, [currentValue, sourceType, project]);

    const loadContent = async () => {
        setIsLoading(true);
        try {
            if (sourceType === 'project' || sourceType === 'txt') {
                 // Clean path from scripts/ prefix for matching if needed, 
                 // but mock-fs uses "uris/file.xqy" format for names inside scripts array
                 // while currentValue might be "scripts/uris/file.xqy"
                 const nameToFind = currentValue.replace(/^scripts\//, '');
                 const script = project.scripts.find(s => s.name === nameToFind);
                 if (script) {
                     setContent(script.content);
                     setOriginalContent(script.content);
                 } else {
                     setContent(""); 
                 }
            } else {
                 // Support
                 if (currentValue && !currentValue.startsWith('scripts/')) {
                     // Assume currentValue is the filename in support dir
                     const filename = currentValue.split('/').pop() || currentValue;
                     const text = await fetchSupportContent(type, filename);
                     setContent(text);
                     setOriginalContent(text);
                 } else {
                     setContent("");
                 }
            }
        } catch (e) {
            console.error(e);
            setContent("// Error loading content");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSourceTypeChange = (val: SourceType) => {
        setSourceType(val);
        // Reset selection when switching types
        if (val === 'project') {
             const first = projectScripts[0];
             if (first) onChange(`scripts/${first.name}`);
             else onChange("");
        } else if (val === 'txt') {
             const first = txtFiles[0];
             if (first) onChange(`scripts/${first.name}`);
             else onChange("");
        } else {
             const first = supportFiles[0];
             if (first) onChange(first); // Store just filename or we need full path? 
             // Based on server implementation for run, we probably store just the filename or we need to update run logic.
             // Actually, the previous implementation of RunDialog used customUrisModule which was just a filename.
             // If we write it to .job file, we might need to handle it in server run logic.
             // Let's store just the filename for support and rely on convention or updated server logic?
             // Actually, server `api/run` logic: if `options.customUrisModule` is set, it overrides `URIS-MODULE`.
             // But here we are editing the `URIS-MODULE` property itself.
             // If I put "my-collector.xqy" (support file) into `URIS-MODULE`, does CORB know where to find it?
             // Usually CORB expects a class path or file path.
             // If we use support files, we probably need to reference them by absolute path in the job file 
             // OR copy them to the run directory.
             // Given the constraints, let's assume we store the filename, and the `api/run` logic needs to be smart enough 
             // to look in support dir if it's not starting with scripts/? 
             // OR better: let's store `support/uris/filename`.
             if (first) onChange(`support/${type}/${first}`);
             else onChange("");
        }
    };

    const handleFileSelect = (val: string) => {
        // val is the name relative to category
        if (sourceType === 'project' || sourceType === 'txt') {
            onChange(`scripts/${val}`);
        } else {
            onChange(`support/${type}/${val}`);
        }
    };

    // Helper to extract clean name for Select
    const getCleanSelection = () => {
        if (!currentValue) return "";
        if (sourceType === 'project' || sourceType === 'txt') {
            return currentValue.replace(/^scripts\//, '');
        }
        return currentValue.replace(`support/${type}/`, '');
    };

    const handleSave = async () => {
        if (sourceType === 'support') {
            setIsSaveAlertOpen(true);
        } else {
            await doSave();
        }
    };

    const doSave = async () => {
        try {
            const fileName = getCleanSelection();
            if (sourceType === 'project' || sourceType === 'txt') {
                // Save to project
                // Note: saveFile expects fileName relative to project scripts dir if type is 'script'
                await saveFile(project.id, fileName, content, 'script');
            } else {
                // Save to support
                const supportType = type === 'uris' ? 'support-uris' : 'support-process';
                await saveFile(null, fileName, content, supportType);
            }
            toast.success("File saved successfully");
            setOriginalContent(content);
            setIsSaveAlertOpen(false);
        } catch (e) {
            toast.error("Failed to save file");
        }
    };

    const isDirty = content !== originalContent;

    return (
        <div className="flex flex-col h-full">
            <div className="bg-muted/10 border-b p-4 space-y-4">
                <RadioGroup value={sourceType} onValueChange={(v: any) => handleSourceTypeChange(v)} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="project" id="r-project" />
                        <Label htmlFor="r-project">Project Script</Label>
                    </div>
                    {type === 'uris' && (
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="txt" id="r-txt" />
                            <Label htmlFor="r-txt">URI List (.txt)</Label>
                        </div>
                    )}
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="support" id="r-support" />
                        <Label htmlFor="r-support">Support Script</Label>
                    </div>
                </RadioGroup>

                <div className="flex gap-2">
                    <div className="flex-1">
                        <Select value={getCleanSelection()} onValueChange={handleFileSelect}>
                            <SelectTrigger className="w-full bg-background">
                                <SelectValue placeholder="Select file..." />
                            </SelectTrigger>
                            <SelectContent>
                                {sourceType === 'project' && projectScripts.map(s => (
                                    <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                                ))}
                                {sourceType === 'txt' && txtFiles.map(s => (
                                    <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                                ))}
                                {sourceType === 'support' && supportFiles.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {isDirty && (
                        <Button onClick={handleSave} className="gap-2" variant={sourceType === 'support' ? "destructive" : "default"}>
                            <Save className="h-4 w-4" />
                            Save {sourceType === 'support' && "Global"} Changes
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative border-t border-border">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ScriptEditor 
                        fileName={getCleanSelection()} 
                        content={content} 
                        onChange={setContent}
                    />
                )}
            </div>

             <AlertDialog open={isSaveAlertOpen} onOpenChange={setIsSaveAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Global Change Warning
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            You are modifying a <strong>shared support file</strong>. 
                            This change will affect <strong>ALL users and projects</strong> that use this script.
                            <br/><br/>
                            Are you sure you want to proceed?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={doSave} className="bg-destructive hover:bg-destructive/90">
                            Yes, Overwrite Global File
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}