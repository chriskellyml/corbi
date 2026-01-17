import { useState, useEffect, useRef } from "react";
import { Project } from "../../types";
import { fetchSupportUris, fetchSupportProcess, fetchSupportContent, saveFile } from "../../lib/api";
import { ScriptEditor } from "./ScriptEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { AlertTriangle, Save, RefreshCw, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";

interface ModuleTabProps {
    type: 'uris' | 'process';
    currentValue: string;
    onChange: (value: string) => void;
    project: Project;
    onRefreshData?: () => void;
}

type SourceType = 'project' | 'support' | 'txt' | 'server';

export function ModuleTab({ type, currentValue, onChange, project, onRefreshData }: ModuleTabProps) {
    const [sourceType, setSourceType] = useState<SourceType>('project');
    const [supportFiles, setSupportFiles] = useState<string[]>([]);
    const [content, setContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaveAlertOpen, setIsSaveAlertOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Create File State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newFileName, setNewFileName] = useState("");

    // Filter project scripts based on convention
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
        const cleanVal = currentValue?.replace('|ADHOC', '') || '';

        if (!cleanVal) {
            setSourceType('project');
        } else if (cleanVal.startsWith('scripts/')) {
             if (cleanVal.endsWith('.txt')) setSourceType('txt');
             else setSourceType('project');
        } else if (cleanVal.startsWith('support/')) {
             setSourceType('support');
        } else {
             setSourceType('server');
        }

        loadSupportFiles();
    }, [type]); // Re-run when type changes

    // Watch currentValue to update source type if changed externally (e.g. initial load)
    useEffect(() => {
        if (!currentValue) return;
        const cleanVal = currentValue.replace('|ADHOC', '');
        
        if (cleanVal.startsWith('scripts/')) {
             if (cleanVal.endsWith('.txt') && sourceType !== 'txt') setSourceType('txt');
             else if (!cleanVal.endsWith('.txt') && sourceType !== 'project') setSourceType('project');
        } else if (cleanVal.startsWith('support/')) {
             if (sourceType !== 'support') setSourceType('support');
        } else {
             if (sourceType !== 'server') setSourceType('server');
        }
    }, [currentValue]);

    const loadSupportFiles = () => {
        if (type === 'uris') fetchSupportUris().then(setSupportFiles);
        else fetchSupportProcess().then(setSupportFiles);
    };

    // Fetch content when currentValue or sourceType changes
    // Removed 'project' dependency to prevent overwriting local changes during auto-save cycle
    useEffect(() => {
        loadContent();
    }, [currentValue, sourceType]); 

    const loadContent = async () => {
        if (sourceType === 'server') {
            setContent("");
            return;
        }

        setIsLoading(true);
        try {
            const cleanVal = currentValue?.replace('|ADHOC', '') || '';

            if (sourceType === 'project' || sourceType === 'txt') {
                 const nameToFind = cleanVal.replace(/^scripts\//, '');
                 const script = project.scripts.find(s => s.name === nameToFind);
                 if (script) {
                     setContent(script.content);
                     setOriginalContent(script.content);
                 } else {
                     setContent(""); 
                 }
            } else {
                 // Support
                 if (cleanVal && !cleanVal.startsWith('scripts/')) {
                     const filename = cleanVal.split('/').pop() || cleanVal;
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

    const getCleanSelection = () => {
        if (!currentValue) return "";
        let val = currentValue.replace('|ADHOC', '');
        
        if (sourceType === 'server') return val;

        if (val.startsWith('scripts/')) {
            return val.replace(/^scripts\//, '');
        }
        return val.replace(`support/${type}/`, '');
    };

    const isDirty = content !== originalContent;

    // Auto-save Effect for Project Files
    useEffect(() => {
        if (sourceType === 'support' || sourceType === 'server') return;
        if (!isDirty) return;

        const timer = setTimeout(async () => {
            await performAutoSave();
        }, 1000);

        return () => clearTimeout(timer);
    }, [content, isDirty, sourceType, currentValue]);

    const performAutoSave = async () => {
        const fileName = getCleanSelection();
        if (!fileName) return;

        setIsSaving(true);
        try {
            await saveFile(project.id, fileName, content, 'script');
            setOriginalContent(content);
            onRefreshData?.();
        } catch (e) {
            console.error("Auto-save failed", e);
            toast.error("Auto-save failed");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSourceTypeChange = async (val: SourceType) => {
        // Force save if leaving a dirty project file
        if (isDirty && (sourceType === 'project' || sourceType === 'txt')) {
             await performAutoSave();
        }

        setSourceType(val);
        // Reset to first available item or empty when switching tabs
        if (val === 'project') {
             const first = projectScripts[0];
             if (first) onChange(`scripts/${first.name}|ADHOC`);
             else onChange("");
        } else if (val === 'txt') {
             const first = txtFiles[0];
             if (first) onChange(`scripts/${first.name}|ADHOC`);
             else onChange("");
        } else if (val === 'support') {
             const first = supportFiles[0];
             if (first) onChange(`support/${type}/${first}|ADHOC`);
             else onChange("");
        } else {
             // Server - default to empty or keep previous if it looked like a server path?
             onChange("");
        }
    };

    const handleFileSelect = async (val: string) => {
        // Force save if leaving a dirty project file
        if (isDirty && (sourceType === 'project' || sourceType === 'txt')) {
             await performAutoSave();
        }

        // val is the name relative to category
        if (sourceType === 'project' || sourceType === 'txt') {
            onChange(`scripts/${val}|ADHOC`);
        } else if (sourceType === 'support') {
            onChange(`support/${type}/${val}|ADHOC`);
        } else {
            // Server - val is the full path typed by user
            onChange(val);
        }
    };

    const handleManualSave = async () => {
        if (sourceType === 'support') {
            setIsSaveAlertOpen(true);
        } else {
            await doManualSave();
        }
    };

    const doManualSave = async () => {
        try {
            setIsSaving(true);
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
            onRefreshData?.();
        } catch (e) {
            toast.error("Failed to save file");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateNew = async () => {
        if (!newFileName) return;
        
        // Basic validation
        const lower = newFileName.toLowerCase();
        
        if (sourceType === 'txt' && !lower.endsWith('.txt')) {
            toast.error("File name must end with .txt");
            return;
        }
        if ((sourceType === 'project' || sourceType === 'support') && 
            !lower.endsWith('.xqy') && !lower.endsWith('.sjs') && !lower.endsWith('.js')) {
            toast.error("File name must end with .xqy, .sjs, or .js");
            return;
        }

        try {
            let relativePath = newFileName;
            // For projects, prefix with uris/ or process/ folder
            if (sourceType === 'project' || sourceType === 'txt') {
                 relativePath = `${type}/${newFileName}`;
                 await saveFile(project.id, relativePath, "", 'script');
                 if (onRefreshData) onRefreshData(); // Refresh project data
                 
                 // Select it
                 onChange(`scripts/${relativePath}|ADHOC`);
            } else {
                 // Support
                 const supportType = type === 'uris' ? 'support-uris' : 'support-process';
                 await saveFile(null, newFileName, "", supportType);
                 loadSupportFiles(); // Refresh support list
                 
                 // Select it
                 onChange(`support/${type}/${newFileName}|ADHOC`);
            }
            
            toast.success("File created");
            setIsCreateDialogOpen(false);
            setNewFileName("");
        } catch (e) {
            toast.error("Failed to create file");
        }
    };

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
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="server" id="r-server" />
                        <Label htmlFor="r-server">Server Script</Label>
                    </div>
                </RadioGroup>

                <div className="flex gap-2 items-center">
                    <div className="flex-1 flex gap-2">
                        {sourceType === 'server' ? (
                            <Input 
                                placeholder="Enter server module path (e.g. /marklogic.rest.transform/my-lib/test.xqy)"
                                value={currentValue}
                                onChange={(e) => handleFileSelect(e.target.value)}
                                className="font-mono text-xs bg-background"
                            />
                        ) : (
                            <>
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
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    onClick={() => setIsCreateDialogOpen(true)} 
                                    title="Create New File"
                                    className="shrink-0"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                    
                    {/* Saving Indicator */}
                    {isSaving && (
                        <div className="text-xs text-muted-foreground animate-pulse flex items-center gap-1 mr-2">
                            <RefreshCw className="h-3 w-3 animate-spin" /> Saving...
                        </div>
                    )}

                    {/* Auto-save Status Check (visible when clean) */}
                    {!isDirty && !isSaving && (sourceType === 'project' || sourceType === 'txt') && content.length > 0 && (
                        <div className="text-xs text-muted-foreground/50 flex items-center gap-1 mr-2" title="All changes saved">
                             <Check className="h-3 w-3" /> Saved
                        </div>
                    )}

                    {/* Manual Save Button - Only for Support Files */}
                    {isDirty && sourceType === 'support' && (
                        <Button onClick={handleManualSave} className="gap-2" variant="destructive">
                            <Save className="h-4 w-4" />
                            Save Global Changes
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
                    sourceType === 'server' ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                            Server scripts cannot be previewed.
                        </div>
                    ) : (
                        <ScriptEditor 
                            fileName={getCleanSelection()} 
                            content={content} 
                            onChange={setContent}
                        />
                    )
                )}
            </div>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New File</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>File Name</Label>
                            <Input 
                                value={newFileName} 
                                onChange={(e) => setNewFileName(e.target.value)} 
                                placeholder={
                                    sourceType === 'txt' ? "my-list.txt" : 
                                    "my-script.xqy"
                                }
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                {sourceType === 'project' && `Will be created in scripts/${type}/`}
                                {sourceType === 'txt' && `Will be created in scripts/${type}/`}
                                {sourceType === 'support' && `Will be created in support/${type}/`}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateNew}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                        <AlertDialogAction onClick={doManualSave} className="bg-destructive hover:bg-destructive/90">
                            Yes, Overwrite Global File
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}