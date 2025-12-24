import { useState, useEffect } from "react";
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

    // Filter project scripts
    const projectScripts = project.scripts.filter(s => {
        if (type === 'uris') return s.name.startsWith('uris/');
        if (type === 'process') return s.name.startsWith('process/');
        return false;
    }).filter(s => type === 'uris' ? true : !s.name.endsWith('.txt'));

    const txtFiles = type === 'uris' 
        ? project.scripts.filter(s => s.name.startsWith('uris/') && s.name.endsWith('.txt')) 
        : [];

    useEffect(() => {
        if (!currentValue) {
            setSourceType('project');
        } else if (currentValue.startsWith('scripts/')) {
             if (currentValue.endsWith('.txt')) setSourceType('txt');
             else setSourceType('project');
        } else {
             setSourceType('support');
        }

        if (type === 'uris') fetchSupportUris().then(setSupportFiles);
        else fetchSupportProcess().then(setSupportFiles);

    }, [type, currentValue]);

    useEffect(() => {
        loadContent();
    }, [currentValue, sourceType, project]);

    const loadContent = async () => {
        setIsLoading(true);
        try {
            if (sourceType === 'project' || sourceType === 'txt') {
                 const nameToFind = currentValue.replace(/^scripts\//, '');
                 const script = project.scripts.find(s => s.name === nameToFind);
                 if (script) {
                     setContent(script.content);
                     setOriginalContent(script.content);
                 } else {
                     setContent(""); 
                 }
            } else {
                 if (currentValue && !currentValue.startsWith('scripts/')) {
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
        if (val === 'project') {
             const first = projectScripts[0];
             onChange(first ? `scripts/${first.name}` : "");
        } else if (val === 'txt') {
             const first = txtFiles[0];
             onChange(first ? `scripts/${first.name}` : "");
        } else {
             const first = supportFiles[0];
             onChange(first ? `support/${type}/${first}` : "");
        }
    };

    const handleFileSelect = (val: string) => {
        if (sourceType === 'project' || sourceType === 'txt') {
            onChange(`scripts/${val}`);
        } else {
            onChange(`support/${type}/${val}`);
        }
    };

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
                await saveFile(project.id, fileName, content, 'script');
            } else {
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
        <div className="flex flex-col h-full w-full bg-background">
            <div className="bg-muted/10 border-b p-4 space-y-4 shrink-0">
                <RadioGroup value={sourceType} onValueChange={(v: any) => handleSourceTypeChange(v)} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="project" id={`r-project-${type}`} />
                        <Label htmlFor={`r-project-${type}`} className="text-xs font-medium cursor-pointer">Project Script</Label>
                    </div>
                    {type === 'uris' && (
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="txt" id={`r-txt-${type}`} />
                            <Label htmlFor={`r-txt-${type}`} className="text-xs font-medium cursor-pointer">URI List (.txt)</Label>
                        </div>
                    )}
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="support" id={`r-support-${type}`} />
                        <Label htmlFor={`r-support-${type}`} className="text-xs font-medium cursor-pointer">Support Script</Label>
                    </div>
                </RadioGroup>

                <div className="flex gap-2">
                    <div className="flex-1">
                        <Select value={getCleanSelection()} onValueChange={handleFileSelect}>
                            <SelectTrigger className="w-full h-8 text-xs bg-background">
                                <SelectValue placeholder="Select file..." />
                            </SelectTrigger>
                            <SelectContent>
                                {sourceType === 'project' && projectScripts.map(s => (
                                    <SelectItem key={s.name} value={s.name} className="text-xs">{s.name}</SelectItem>
                                ))}
                                {sourceType === 'txt' && txtFiles.map(s => (
                                    <SelectItem key={s.name} value={s.name} className="text-xs">{s.name}</SelectItem>
                                ))}
                                {sourceType === 'support' && supportFiles.map(s => (
                                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {isDirty && (
                        <Button onClick={handleSave} size="sm" className="h-8 gap-2 text-xs" variant={sourceType === 'support' ? "destructive" : "default"}>
                            <Save className="h-3 w-3" />
                            Save
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
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