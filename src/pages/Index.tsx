import { useState } from "react";
import { TopBar } from "../components/corb/TopBar";
import { ProjectSidebar, SelectionType } from "../components/corb/ProjectSidebar";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { RunDialog, RunOptions } from "../components/corb/RunDialog";
import { Environment, ENVIRONMENTS, MOCK_PROJECTS, MOCK_ENV_FILES, ProjectRun } from "../data/mock-fs";
import { Play } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { MadeWithDyad } from "../components/made-with-dyad";
import { Textarea } from "../components/ui/textarea";

export default function Index() {
  const [environment, setEnvironment] = useState<Environment>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // New unified selection state
  const [selection, setSelection] = useState<SelectionType | null>(null);

  // Data state
  const [projects, setProjects] = useState(MOCK_PROJECTS);
  const [envFiles, setEnvFiles] = useState(MOCK_ENV_FILES);

  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelection(null);
  };

  const handleDeleteRun = (projectId: string, runId: string) => {
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
  };

  const handleContentChange = (newContent: string) => {
    if (!selectedProject || !selection || selection.kind === 'run') return; // Cannot edit run files

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
  };

  const handleEnvFileChange = (newContent: string) => {
    setEnvFiles(prev => ({ ...prev, [environment]: newContent }));
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

  const handleRunExecution = (options: RunOptions) => {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    
    // Construct Options String showing overrides
    let optionsStr = `# Generated Options\nLIMIT=${options.limit || 'NONE'}\nTHREADS=${options.threadCount}`;
    
    if (options.urisModule.type === 'file') {
      optionsStr += `\nURIS-FILE=${options.urisModule.value} (User File)`;
    } else if (options.urisModule.type === 'custom') {
      optionsStr += `\nURIS-MODULE=support/collectors/${options.urisModule.value}`;
    }

    if (options.processModule.type === 'custom') {
      optionsStr += `\nPROCESS-MODULE=support/collectors/${options.processModule.value}`;
    }

    // In a real app we'd construct the actual run artifacts here.
    const newRun: ProjectRun = {
      id: timestamp,
      timestamp,
      isDryRun: options.dryRun,
      environments: [
        {
          name: environment,
          options: optionsStr,
          export: 'id,status\n1,processed',
          logs: [{ name: 'corb.log', content: 'Run started...' }],
          scripts: selectedProject?.scripts.map(s => ({ name: s.name, content: s.content })) || []
        }
      ]
    };

    setProjects(prev => prev.map(p => {
      if (p.id !== selectedProjectId) return p;
      return { ...p, runs: [newRun, ...p.runs] };
    }));

    toast.success("Job Started", {
      description: `Run ${timestamp} initiated.`,
      duration: 3000,
    });
  };

  // Determine what type of editor/viewer to show
  const isJob = selection?.kind === 'source' && selection.type === 'job';
  const isRunOptions = selection?.kind === 'run' && selection.fileName === 'job.options';
  const isScript = (selection?.kind === 'source' && selection.type === 'script') || (selection?.kind === 'run' && selection.category === 'scripts');
  const isReadOnly = selection?.kind === 'run';
  const isLogOrCsv = selection?.kind === 'run' && (selection.category === 'logs' || selection.fileName === 'export.csv');

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <TopBar 
        currentEnv={environment} 
        environments={ENVIRONMENTS}
        onEnvChange={(env) => setEnvironment(env as Environment)} 
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
                       <div className="w-1/3 border rounded-lg overflow-hidden shadow-sm bg-background">
                         <PropertiesEditor 
                           title={`Environment: ${environment}.props`}
                           content={envFiles[environment]}
                           onChange={handleEnvFileChange}
                         />
                       </div>
                     )}
                   </div>
                )}

                {/* CASE 2: SCRIPT (Source or Run Snapshot) */}
                {isScript && (
                   <div className="flex-1 border-l border-border relative">
                     {isReadOnly && (
                       <div className="absolute top-0 right-0 z-10 p-2">
                         <div className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded border border-amber-200 font-medium">
                           Read Only (Run Snapshot)
                         </div>
                       </div>
                     )}
                     <ScriptEditor 
                       fileName={selection.kind === 'source' ? selection.name : selection.fileName} 
                       content={getCurrentFileContent()} 
                       onChange={handleContentChange} 
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
    </div>
  );
}