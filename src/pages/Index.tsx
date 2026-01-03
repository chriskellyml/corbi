import { useState, useEffect, useRef, useMemo } from "react";
import { TopBar } from "../components/corb/TopBar";
import { ProjectSidebar, SelectionType } from "../components/corb/ProjectSidebar";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { JobEditor } from "../components/corb/JobEditor";
import { RunFooter, RunOptions } from "../components/corb/RunFooter";
import { PasswordDialog } from "../components/corb/PasswordDialog";
import { Project, ProjectRun } from "../types";
import { fetchProjects, fetchEnvFiles, saveFile, createRun, deleteRun, copyFile, renameFile, deleteFile } from "../lib/api";
import { Play, AlertTriangle, Save, Lock, Unlock, KeyRound, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { MadeWithDyad } from "../components/made-with-dyad";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { cn } from "../lib/utils";

export default function Index() {
  const [environment, setEnvironment] = useState<string>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [selection, setSelection] = useState<SelectionType | null>(null);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [envFiles, setEnvFiles] = useState<Record<string, string>>({});
  const [originalEnvFiles, setOriginalEnvFiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // UI State
  const [isEnvSaveDialogOpen, setIsEnvSaveDialogOpen] = useState(false);
  
  // File Ops State
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [nameDialogMode, setNameDialogMode] = useState<'create'|'rename'|'copy'>('create');
  const [nameDialogValue, setNameDialogValue] = useState("");
  const [fileOpContext, setFileOpContext] = useState<{ projectId: string, fileName?: string, type: 'job'|'script' } | null>(null);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Password Logic
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [sessionPasswords, setSessionPasswords] = useState<Record<string, string>>({}); 
  const [pendingRunOptions, setPendingRunOptions] = useState<RunOptions | null>(null);
  const [pendingRunJobName, setPendingRunJobName] = useState<string | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
        const [p, e] = await Promise.all([fetchProjects(), fetchEnvFiles()]);
        setProjects(p);
        setEnvFiles(e);
        setOriginalEnvFiles({ ...e });
        
        if (!e['LOC'] && Object.keys(e).length > 0) {
            setEnvironment(Object.keys(e)[0]);
        }
    } catch (err) {
        toast.error("Failed to load data. Is the server running?");
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const getCurrentEnvUser = () => {
    const content = envFiles[environment] || "";
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex !== -1) {
            const key = trimmed.substring(0, eqIndex).trim();
            if (key === 'XCC-USER') return trimmed.substring(eqIndex + 1).trim();
        }
    }
    return 'unknown';
  };

  const currentUserName = getCurrentEnvUser();
  const passwordKey = `${environment}:${currentUserName}`;
  const hasPassword = !!sessionPasswords[passwordKey];

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelection(null);
  };

  const handleCreateJob = (projectId: string) => {
    // Determine next number prefix
    const project = projects.find(p => p.id === projectId);
    let nextNum = 1;
    if (project) {
        project.jobs.forEach(j => {
            const match = j.name.match(/^(\d+)-/);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n >= nextNum) nextNum = n + 1;
            }
        });
    }
    const prefix = String(nextNum).padStart(2, '0');

    setFileOpContext({ projectId, type: 'job' });
    setNameDialogMode('create');
    setNameDialogValue(`${prefix}-`);
    setIsNameDialogOpen(true);
  };

  const handleCopyFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setNameDialogMode('copy');
    
    // Strip .job extension for display if type is job
    let displayValue = fileName;
    if (type === 'job') {
        displayValue = fileName.replace(/\.job$/, '');
        setNameDialogValue(`${displayValue}-copy`);
    } else {
        const parts = fileName.split('.');
        if (parts.length > 1) {
            const ext = parts.pop();
            setNameDialogValue(`${parts.join('.')}-copy.${ext}`);
        } else {
            setNameDialogValue(`${fileName}-copy`);
        }
    }
    
    setIsNameDialogOpen(true);
  };

  const handleRenameFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setNameDialogMode('rename');
    
    // Strip .job extension for display if type is job
    let displayValue = fileName;
    if (type === 'job') displayValue = fileName.replace(/\.job$/, '');
    
    setNameDialogValue(displayValue);
    setIsNameDialogOpen(true);
  };

  const handleDeleteFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setIsDeleteAlertOpen(true);
  };

  const handleMoveFile = async (projectId: string, fileName: string, direction: 'up' | 'down', type: 'job' | 'script') => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const getFiles = () => type === 'job' ? project.jobs : project.scripts;
    let files = getFiles();
    
    // Initial Sort
    let sorted = [...files].sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    // --- Normalization Logic ---
    const needsNormalization = sorted.some(f => !/^\d+-/.test(f.name));
    
    if (needsNormalization) {
        const tId = toast.loading("Normalizing file names for ordering...");
        try {
            // Rename all files to enforce "01-", "02-" prefix based on current order
            for (let i = 0; i < sorted.length; i++) {
                const f = sorted[i];
                // Strip existing numbers if any to get clean base
                const cleanName = f.name.replace(/^\d+-/, '');
                const prefix = String(i + 1).padStart(2, '0');
                const newName = `${prefix}-${cleanName}`;
                
                if (f.name !== newName) {
                    await renameFile(projectId, f.name, newName, type);
                }
            }
            
            // Reload data to ensure we have fresh names
            const [p] = await Promise.all([fetchProjects()]);
            setProjects(p);
            
            // Re-fetch local references
            const newProject = p.find(pp => pp.id === projectId);
            if (newProject) {
                const newFiles = type === 'job' ? newProject.jobs : newProject.scripts;
                sorted = [...newFiles].sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                
                // We need to update the `fileName` (which was the old name) to the new name 
                // so we can find the index for swapping.
                // Strategy: Find by fuzzy suffix match (the "clean name" part).
                const cleanOriginal = fileName.replace(/^\d+-/, '');
                const found = sorted.find(f => f.name === cleanOriginal || f.name.endsWith(`-${cleanOriginal}`));
                if (found) {
                    fileName = found.name;
                }
            }
            toast.dismiss(tId);
        } catch (e: any) {
            toast.dismiss(tId);
            toast.error("Failed to normalize file names: " + e.message);
            return;
        }
    }
    
    // --- Swap Logic ---
    const idx = sorted.findIndex(f => f.name === fileName);
    if (idx === -1) return;
    
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    
    const fileA = sorted[idx];
    const fileB = sorted[targetIdx];
    
    // Parse prefixes
    const regex = /^(\d+)-(.*)$/;
    const matchA = fileA.name.match(regex);
    const matchB = fileB.name.match(regex);
    
    if (!matchA || !matchB) {
        toast.error("Ordering error: Files must have numeric prefixes (e.g. 01-name).");
        return;
    }
    
    const prefixA = matchA[1];
    const bodyA = matchA[2];
    const prefixB = matchB[1];
    const bodyB = matchB[2];
    
    // Construct new names by swapping prefixes
    const newNameA = `${prefixB}-${bodyA}`; // A takes B's prefix
    const newNameB = `${prefixA}-${bodyB}`; // B takes A's prefix
    
    // Rename Sequence (A->Temp, B->NewB, Temp->NewA)
    const tempName = `${Date.now()}-move-temp.tmp`;
    
    try {
        await renameFile(projectId, fileA.name, tempName, type);
        await renameFile(projectId, fileB.name, newNameB, type);
        await renameFile(projectId, tempName, newNameA, type);
        
        await loadData();
        
        // If the moved file was selected, update selection to new name
        if (selection?.kind === 'source' && selection.name === fileA.name) {
             setSelection({ ...selection, name: newNameA });
        }
    } catch (e: any) {
        toast.error("Failed to move file: " + e.message);
    }
  };

  const submitFileOp = async () => {
    if (!fileOpContext || !nameDialogValue) return;
    const { projectId, fileName, type } = fileOpContext;
    
    try {
        let finalName = nameDialogValue;
        
        // Auto-append .job if missing for jobs
        if (type === 'job' && !finalName.endsWith('.job')) {
            finalName += '.job';
        }

        if (nameDialogMode === 'create') {
            await saveFile(projectId, finalName, "", 'job');
            toast.success("Job created");
        } else if (nameDialogMode === 'copy' && fileName) {
            await copyFile(projectId, fileName, finalName, type);
            toast.success("File duplicated");
        } else if (nameDialogMode === 'rename' && fileName) {
            await renameFile(projectId, fileName, finalName, type);
            toast.success("File renamed");
            // Update selection if we renamed the selected file
            if (selection?.kind === 'source' && selection.name === fileName) {
                setSelection({ ...selection, name: finalName });
            }
        }
        await loadData();
        setIsNameDialogOpen(false);
    } catch (err: any) {
        toast.error(err.message || "Operation failed");
    }
  };

  const submitDelete = async () => {
      if (!fileOpContext || !fileOpContext.fileName) return;
      try {
          await deleteFile(fileOpContext.projectId, fileOpContext.fileName, fileOpContext.type);
          toast.success("File deleted");
          if (selection?.kind === 'source' && selection.name === fileOpContext.fileName) {
              setSelection(null);
          }
          await loadData();
      } catch (err) {
          toast.error("Delete failed");
      } finally {
          setIsDeleteAlertOpen(false);
      }
  };

  const handleRunJobFromSidebar = (jobName: string) => {
     if (selection?.kind !== 'source' || selection.name !== jobName) {
         setSelection({ kind: 'source', type: 'job', name: jobName });
     }
  };

  const handleDeleteRun = async (projectId: string, runId: string) => {
    try {
        await deleteRun(projectId, runId);
        setProjects(prev => prev.map(p => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            runs: p.runs.filter(r => r.id !== runId)
          };
        }));
        toast.success("Run deleted successfully");
        if (selection?.kind === 'run' && selection.runId === runId) {
          setSelection(null);
        }
    } catch (err) {
        toast.error("Failed to delete run");
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!selectedProject || !selection || selection.kind === 'run') return;

    const newProjects = projects.map(p => {
      if (p.id !== selectedProjectId) return p;
      if (selection.type === 'job') {
        return {
          ...p,
          jobs: p.jobs.map(j => j.name === selection.name ? { ...j, content: newContent } : j)
        };
      } else {
        return {
          ...p,
          scripts: p.scripts.map(s => s.name === selection.name ? { ...s, content: newContent } : s)
        };
      }
    });
    setProjects(newProjects);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        saveFile(selectedProjectId, selection.name, newContent, selection.type)
            .then(() => {})
            .catch(() => toast.error("Failed to save changes"));
    }, 1000);
  };

  const handleEnvFileChange = (newContent: string) => {
    setEnvFiles(prev => ({ ...prev, [environment]: newContent }));
  };

  const handleResetEnv = () => {
    setEnvFiles(prev => ({ ...prev, [environment]: originalEnvFiles[environment] }));
    toast.info("Environment changes discarded");
  };

  const handleSaveEnv = async () => {
      try {
          await saveFile(null, `${environment}.props`, envFiles[environment], 'env');
          setOriginalEnvFiles(prev => ({ ...prev, [environment]: envFiles[environment] }));
          toast.success("Environment saved successfully");
          setIsEnvSaveDialogOpen(false);
      } catch (e) {
          toast.error("Failed to save environment file");
      }
  };

  const getCurrentFileContent = () => {
    if (!selectedProject || !selection) return "";
    if (selection.kind === 'source') {
      if (selection.type === 'job') {
        return selectedProject.jobs.find(j => j.name === selection.name)?.content || "";
      }
      return selectedProject.scripts.find(s => s.name === selection.name)?.content || "";
    } else {
      const run = selectedProject.runs.find(r => r.id === selection.runId);
      const env = run?.environments.find(e => e.name === selection.envName);
      if (!env) return "Error: Environment not found";
      if (selection.category === 'root') {
        if (selection.fileName === 'job.options') return env.options;
        if (selection.fileName === 'export.csv') return env.export;
      }
      if (selection.category === 'logs') return env.logs.find(f => f.name === selection.fileName)?.content || "";
      if (selection.category === 'scripts') return env.scripts.find(f => f.name === selection.fileName)?.content || "";
    }
    return "";
  };

  const executeRun = async (projectId: string, jobName: string, options: RunOptions) => {
    try {
        const runId = await createRun(projectId, jobName, environment, options);
        // await loadData(); // Full refresh to get new run
        // Optimization: just fetch projects
        const p = await fetchProjects();
        setProjects(p);

        toast.success("Job Started", {
          description: `Run created: ${runId}`,
          duration: 3000,
        });
    } catch (e) {
        toast.error("Failed to start run");
    } finally {
        setPendingRunOptions(null);
        setPendingRunJobName(null);
    }
  };

  const handleRunRequest = async (options: RunOptions) => {
    if (!selectedProjectId) return;
    
    let jobName = '';
    if (selection?.kind === 'source' && selection.type === 'job') {
        jobName = selection.name;
    } else {
        jobName = (pendingRunJobName || ""); // Fallback
    }
    
    // Check Password
    if (!hasPassword) {
        setPendingRunOptions(options);
        setPendingRunJobName(jobName);
        setIsPasswordDialogOpen(true);
    } else {
        const finalOptions = { ...options, password: sessionPasswords[passwordKey] };
        await executeRun(selectedProjectId, jobName, finalOptions);
    }
  };

  const handlePasswordConfirm = (password: string, remember: boolean) => {
    if (remember) {
        setSessionPasswords(prev => ({ ...prev, [passwordKey]: password }));
    }
    if (pendingRunOptions && pendingRunJobName && selectedProjectId) {
        const finalOptions = { ...pendingRunOptions, password };
        executeRun(selectedProjectId, pendingRunJobName, finalOptions);
    } else {
        toast.success("Password updated in memory");
    }
  };

  const isJob = selection?.kind === 'source' && selection.type === 'job';
  const isRunOptions = selection?.kind === 'run' && selection.fileName === 'job.options';
  const isScript = (selection?.kind === 'source' && selection.type === 'script') || (selection?.kind === 'run' && selection.category === 'scripts');
  const isReadOnly = selection?.kind === 'run';
  const isLogOrCsv = selection?.kind === 'run' && (selection.category === 'logs' || selection.fileName === 'export.csv');
  const isEnvDirty = envFiles[environment] !== originalEnvFiles[environment];

  if (loading) {
      return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading projects...</div>;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <TopBar 
        currentEnv={environment} 
        environments={Object.keys(envFiles)}
        onEnvChange={setEnvironment} 
      />
      
      <div className="flex-1 flex overflow-hidden">
        <ProjectSidebar 
          projects={projects} 
          selectedProjectId={selectedProjectId} 
          onSelectProject={handleSelectProject}
          selection={selection}
          onSelectFile={setSelection}
          onDeleteRun={handleDeleteRun}
          onCreateJob={handleCreateJob}
          onRunJob={handleRunJobFromSidebar}
          onCopyFile={handleCopyFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          onMoveFile={handleMoveFile}
        />

        {selectedProject ? (
          <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
            {selection ? (
              <div className="flex-1 flex flex-col overflow-hidden relative">
                <div className="flex-1 flex flex-col overflow-hidden">
                    {isJob && (
                    <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                        <div className="flex-1 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                        <JobEditor 
                            jobName={selection.name}
                            content={getCurrentFileContent()}
                            onChange={handleContentChange}
                            project={selectedProject}
                            onRefreshData={loadData}
                        />
                        </div>

                        {!isReadOnly && (
                        <div className="w-1/3 flex flex-col gap-4">
                            <div className="flex-1 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                                    <PropertiesEditor 
                                        title={`Environment: ${environment}.props`}
                                        content={envFiles[environment] || ""}
                                        onChange={handleEnvFileChange}
                                        originalContent={originalEnvFiles[environment]}
                                    />
                                    {isEnvDirty && (
                                        <div className="p-4 border-t bg-amber-50/80 space-y-3 shrink-0">
                                            <div className="text-xs text-amber-800 flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold">Unsaved Changes</div>
                                                    <div className="opacity-90">Changes must be saved to take effect.</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button 
                                                    onClick={handleResetEnv} 
                                                    size="sm" 
                                                    variant="outline"
                                                    className="flex-1 border-amber-300 text-amber-900 hover:bg-amber-100"
                                                >
                                                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                                                </Button>
                                                <Button 
                                                    onClick={() => setIsEnvSaveDialogOpen(true)} 
                                                    size="sm" 
                                                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                                                >
                                                    <Save className="mr-2 h-4 w-4" /> Save
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                            </div>

                            <div className="border rounded-lg shadow-sm bg-background p-4 shrink-0">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-sm flex items-center gap-2">
                                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                                            Authentication
                                        </h3>
                                        <div className={cn(
                                            "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border",
                                            hasPassword ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"
                                        )}>
                                            {hasPassword ? "Authorized" : "Unauthorized"}
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-3">
                                        User: <span className="font-mono font-semibold text-foreground">{currentUserName}</span>
                                        <br/>
                                        {hasPassword 
                                            ? "Password stored in session memory." 
                                            : "No password currently stored for this session."
                                        }
                                    </div>
                                    <Button 
                                        variant={hasPassword ? "outline" : "secondary"} 
                                        size="sm" 
                                        className="w-full"
                                        onClick={() => {
                                            setPendingRunOptions(null); 
                                            setIsPasswordDialogOpen(true);
                                        }}
                                    >
                                        {hasPassword ? (
                                            <><Unlock className="mr-2 h-3 w-3" /> Update Password</>
                                        ) : (
                                            <><Lock className="mr-2 h-3 w-3" /> Enter Password</>
                                        )}
                                    </Button>
                            </div>
                        </div>
                        )}
                    </div>
                    )}
                    
                    {/* Fallback for Run Options (Read Only) */}
                    {isRunOptions && (
                        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                            <div className="flex-1 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                                <PropertiesEditor 
                                    title={`Run Snapshot: ${selection.fileName}`}
                                    content={getCurrentFileContent()} 
                                    onChange={() => {}}
                                    readOnly={true}
                                />
                            </div>
                        </div>
                    )}

                    {isScript && (
                    <div className="flex-1 border-l border-border relative">
                        <ScriptEditor 
                        fileName={selection.kind === 'source' ? selection.name : selection.fileName} 
                        content={getCurrentFileContent()} 
                        onChange={handleContentChange} 
                        readOnly={isReadOnly}
                        />
                    </div>
                    )}
                    {isLogOrCsv && (
                    <div className="flex-1 flex flex-col bg-background">
                        <div className="p-3 border-b text-xs font-medium text-muted-foreground flex justify-between items-center">
                            <span>{selection.fileName}</span>
                            <span className="uppercase">{selection.kind} / {selection.category}</span>
                        </div>
                        <Textarea 
                            readOnly 
                            className="flex-1 resize-none border-0 font-mono text-xs p-4 focus-visible:ring-0 leading-relaxed" 
                            value={getCurrentFileContent()} 
                        />
                    </div>
                    )}
                </div>

                {isJob && !isReadOnly && (
                    <RunFooter 
                        jobName={selection.name}
                        onRun={handleRunRequest}
                    />
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <div className="max-w-md">
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {selectedProject.name}
                  </h3>
                  <p className="mb-4 text-sm">Select a source file to edit or a run artifact to inspect.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/5">
             <div className="text-center max-w-lg">
                <MadeWithDyad />
             </div>
          </div>
        )}
      </div>
      
      <PasswordDialog 
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
            setIsPasswordDialogOpen(open);
            if (!open && pendingRunOptions) {
                setPendingRunOptions(null);
            }
        }}
        envName={environment}
        userName={currentUserName}
        onConfirm={handlePasswordConfirm}
      />

      <AlertDialog open={isEnvSaveDialogOpen} onOpenChange={setIsEnvSaveDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Save Environment Changes?</AlertDialogTitle>
                <AlertDialogDescription>
                    You are about to modify the <strong>{environment}</strong> environment configuration.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSaveEnv}>Yes, Save Changes</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Name Input Dialog for Create/Rename/Copy */}
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>
                      {nameDialogMode === 'create' && 'Create New Job'}
                      {nameDialogMode === 'copy' && 'Duplicate File'}
                      {nameDialogMode === 'rename' && 'Rename / Re-order File'}
                  </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                  <Input 
                    value={nameDialogValue} 
                    onChange={(e) => setNameDialogValue(e.target.value)} 
                    placeholder="Enter file name..."
                    autoFocus
                  />
                  {nameDialogMode === 'rename' && (
                      <p className="text-xs text-muted-foreground mt-2">
                          Tip: Use prefixes like <code>01-</code>, <code>02-</code> to re-order files.
                      </p>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNameDialogOpen(false)}>Cancel</Button>
                  <Button onClick={submitFileOp}>Confirm</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete <strong>{fileOpContext?.fileName}</strong>. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={submitDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}