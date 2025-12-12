import { useState, useEffect, useRef } from "react";
import { TopBar } from "../components/corb/TopBar";
import { ProjectSidebar, SelectionType } from "../components/corb/ProjectSidebar";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { RunDialog, RunOptions } from "../components/corb/RunDialog";
import { Project, ProjectRun } from "../types";
import { fetchProjects, fetchEnvFiles, saveFile, createRun, deleteRun } from "../lib/api";
import { Play, AlertTriangle, Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { MadeWithDyad } from "../components/made-with-dyad";
import { Textarea } from "../components/ui/textarea";
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

export default function Index() {
  const [environment, setEnvironment] = useState<string>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // New unified selection state
  const [selection, setSelection] = useState<SelectionType | null>(null);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [envFiles, setEnvFiles] = useState<Record<string, string>>({});
  const [originalEnvFiles, setOriginalEnvFiles] = useState<Record<string, string>>({}); // Track original state
  const [loading, setLoading] = useState(true);

  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [isEnvSaveDialogOpen, setIsEnvSaveDialogOpen] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadData = async () => {
        try {
            const [p, e] = await Promise.all([fetchProjects(), fetchEnvFiles()]);
            setProjects(p);
            setEnvFiles(e);
            setOriginalEnvFiles({ ...e }); // Clone for comparison
            
            // Set default environment if LOC not present
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
    loadData();
  }, []);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelection(null);
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
    if (!selectedProject || !selection || selection.kind === 'run') return; // Cannot edit run files

    // Update local state immediately for UI responsiveness
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

    // Debounce Save to API
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        saveFile(selectedProjectId, selection.name, newContent, selection.type)
            .then(() => {
                // Optional: show small saved indicator
            })
            .catch(() => toast.error("Failed to save changes"));
    }, 1000);
  };

  const handleEnvFileChange = (newContent: string) => {
    // Only update local state, NO auto-save
    setEnvFiles(prev => ({ ...prev, [environment]: newContent }));
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
      // Find run content
      const run = selectedProject.runs.find(r => r.id === selection.runId);
      const env = run?.environments.find(e => e.name === selection.envName);
      if (!env) return "Error: Environment not found";

      if (selection.category === 'root') {
        if (selection.fileName === 'job.options') return env.options;
        if (selection.fileName === 'export.csv') return env.export;
      }
      if (selection.category === 'logs') {
        return env.logs.find(f => f.name === selection.fileName)?.content || "";
      }
      if (selection.category === 'scripts') {
        return env.scripts.find(f => f.name === selection.fileName)?.content || "";
      }
    }
    return "";
  };

  const handleRunExecution = async (options: RunOptions) => {
    if (!selectedProjectId) return;
    
    // Check if we have a selected job
    let jobName = '';
    if (selection?.kind === 'source' && selection.type === 'job') {
        jobName = selection.name;
    } else {
        jobName = (selection as any).name; 
    }

    try {
        const runId = await createRun(selectedProjectId, jobName, environment, options);
        
        // Optimistically add run or fetch? Fetching is safer to get full structure.
        const updatedProjects = await fetchProjects();
        setProjects(updatedProjects);

        toast.success("Job Started", {
          description: `Run created: ${runId}`,
          duration: 3000,
        });
    } catch (e) {
        toast.error("Failed to start run");
    }
  };

  // Determine what type of editor/viewer to show
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
        {/* Unified Sidebar */}
        <ProjectSidebar 
          projects={projects} 
          selectedProjectId={selectedProjectId} 
          onSelectProject={handleSelectProject}
          selection={selection}
          onSelectFile={setSelection}
          onDeleteRun={handleDeleteRun}
        />

        {selectedProject ? (
          <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
            {selection ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* CASE 1: JOB (Source or Run Options) */}
                {(isJob || isRunOptions) && (
                   <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                     {/* Job Properties Editor */}
                     <div className="flex-1 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                       <PropertiesEditor 
                         title={isReadOnly ? `Run Snapshot: ${selection.fileName}` : `Job Properties: ${selection.name}`}
                         content={getCurrentFileContent()} 
                         onChange={handleContentChange}
                         readOnly={isReadOnly}
                       />
                       {!isReadOnly && (
                         <div className="p-4 border-t bg-muted/20">
                            <Button className="w-full" onClick={() => setIsRunDialogOpen(true)}>
                              <Play className="mr-2 h-4 w-4" /> Configure & Run Job
                            </Button>
                         </div>
                       )}
                     </div>

                     {/* Environment Properties (Only for Source Jobs, contextually) */}
                     {!isReadOnly && (
                       <div className="w-1/3 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                         <PropertiesEditor 
                           title={`Environment: ${environment}.props`}
                           content={envFiles[environment] || ""}
                           onChange={handleEnvFileChange}
                         />
                         {isEnvDirty && (
                             <div className="p-4 border-t bg-amber-50/80 space-y-3">
                                <div className="text-xs text-amber-800 flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <div>
                                        <div className="font-semibold">Unsaved Changes</div>
                                        <div className="opacity-90">Saves to environment must be saved to come into affect.</div>
                                    </div>
                                </div>
                                <Button 
                                    onClick={() => setIsEnvSaveDialogOpen(true)} 
                                    size="sm" 
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                                >
                                    <Save className="mr-2 h-4 w-4" /> Save Environment
                                </Button>
                             </div>
                         )}
                       </div>
                     )}
                   </div>
                )}

                {/* CASE 2: SCRIPT (Source or Run Snapshot) */}
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

                {/* CASE 3: LOGS or CSV */}
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
            ) : (
              // Empty State
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
          // No Project Selected State
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/5">
             <div className="text-center max-w-lg">
                <MadeWithDyad />
             </div>
          </div>
        )}
      </div>

      {selectedProject && selection?.kind === 'source' && selection.type === 'job' && (
        <RunDialog 
          open={isRunDialogOpen} 
          onOpenChange={setIsRunDialogOpen}
          jobName={selection.name}
          projectName={selectedProject.name}
          environment={environment}
          onRun={handleRunExecution}
        />
      )}

      <AlertDialog open={isEnvSaveDialogOpen} onOpenChange={setIsEnvSaveDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Save Environment Changes?</AlertDialogTitle>
                <AlertDialogDescription>
                    You are about to modify the <strong>{environment}</strong> environment configuration.
                    <br/><br/>
                    This change will affect <strong>all future runs</strong> that use this environment.
                    Please confirm that you want to persist these changes.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSaveEnv}>Yes, Save Changes</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}