import { useState } from "react";
import { TopBar } from "../components/corb/TopBar";
import { ProjectSidebar } from "../components/corb/ProjectSidebar";
import { FileExplorer } from "../components/corb/FileExplorer";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { RunDialog, RunOptions } from "../components/corb/RunDialog";
import { Environment, MOCK_PROJECTS, MOCK_ENV_FILES } from "../data/mock-fs";
import { Play } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { MadeWithDyad } from "../components/made-with-dyad";

export default function Index() {
  const [environment, setEnvironment] = useState<Environment>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // File selection state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<'job' | 'script' | null>(null);

  // Editable content state
  const [projects, setProjects] = useState(MOCK_PROJECTS);
  const [envFiles, setEnvFiles] = useState(MOCK_ENV_FILES);

  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleFileSelect = (fileName: string, type: 'job' | 'script') => {
    setSelectedFile(fileName);
    setSelectedFileType(type);
  };

  const handleContentChange = (newContent: string) => {
    if (!selectedProject || !selectedFile) return;

    const newProjects = projects.map(p => {
      if (p.id !== selectedProjectId) return p;
      
      if (selectedFileType === 'job') {
        return {
          ...p,
          jobs: p.jobs.map(j => j.name === selectedFile ? { ...j, content: newContent } : j)
        };
      } else {
        return {
          ...p,
          scripts: p.scripts.map(s => s.name === selectedFile ? { ...s, content: newContent } : s)
        };
      }
    });

    setProjects(newProjects);
  };

  const handleEnvFileChange = (newContent: string) => {
    setEnvFiles(prev => ({ ...prev, [environment]: newContent }));
  };

  const getCurrentFileContent = () => {
    if (!selectedProject || !selectedFile) return "";
    if (selectedFileType === 'job') {
      return selectedProject.jobs.find(j => j.name === selectedFile)?.content || "";
    }
    return selectedProject.scripts.find(s => s.name === selectedFile)?.content || "";
  };

  const handleRunExecution = (options: RunOptions) => {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const runPath = `runs/${selectedProject?.name}/${timestamp}`;
    
    console.log("Creating run at:", runPath);
    console.log("Options:", options);
    console.log("Env Props:", envFiles[environment]);
    console.log("Job Props:", getCurrentFileContent());

    toast.success("Job Started", {
      description: `Output directory: ${runPath}\nLimit: ${options.limit ?? 'None'}, Dry Run: ${options.dryRun}`,
      duration: 5000,
    });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <TopBar currentEnv={environment} onEnvChange={setEnvironment} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ProjectSidebar 
          projects={projects} 
          selectedProjectId={selectedProjectId} 
          onSelectProject={(id) => {
            setSelectedProjectId(id);
            setSelectedFile(null);
          }} 
        />

        {selectedProject ? (
          <>
            {/* File Explorer (Inner Sidebar) */}
            <FileExplorer 
              jobs={selectedProject.jobs} 
              scripts={selectedProject.scripts}
              selectedFile={selectedFile}
              onSelectFile={handleFileSelect}
            />

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
              {selectedFile ? (
                <>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedFileType === 'job' ? (
                      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                        {/* Job Properties Editor */}
                        <div className="flex-1 border rounded-lg overflow-hidden shadow-sm bg-background flex flex-col">
                          <PropertiesEditor 
                            title={`Job Properties: ${selectedFile}`}
                            content={getCurrentFileContent()} 
                            onChange={handleContentChange} 
                          />
                          <div className="p-4 border-t bg-muted/20">
                             <Button className="w-full" onClick={() => setIsRunDialogOpen(true)}>
                               <Play className="mr-2 h-4 w-4" /> Configure & Run Job
                             </Button>
                          </div>
                        </div>

                        {/* Environment Properties (Contextual) */}
                        <div className="w-1/3 border rounded-lg overflow-hidden shadow-sm bg-background">
                          <PropertiesEditor 
                            title={`Environment: ${environment}.props`}
                            content={envFiles[environment]}
                            onChange={handleEnvFileChange}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 border-l border-border">
                        <ScriptEditor 
                          fileName={selectedFile} 
                          content={getCurrentFileContent()} 
                          onChange={handleContentChange} 
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <div className="max-w-md">
                    <h3 className="text-xl font-semibold mb-2 text-foreground">No File Selected</h3>
                    <p className="mb-8">Select a job or script from the list to view and edit its contents.</p>
                    <div className="grid grid-cols-2 gap-4 text-sm text-left bg-card p-6 rounded-lg border">
                       <div>
                         <strong className="block mb-1 text-foreground">Jobs</strong>
                         Contains configuration for the CORB run (URIs module, Process module, threads, etc).
                       </div>
                       <div>
                         <strong className="block mb-1 text-foreground">Scripts</strong>
                         The actual XQuery/JS code that will be executed on the MarkLogic server.
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-foreground">Select a Project</h2>
              <p>Choose a project from the sidebar to manage its jobs and scripts.</p>
              <div className="mt-8">
                <MadeWithDyad />
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedProject && selectedFile && selectedFileType === 'job' && (
        <RunDialog 
          open={isRunDialogOpen} 
          onOpenChange={setIsRunDialogOpen}
          jobName={selectedFile}
          projectName={selectedProject.name}
          environment={environment}
          onRun={handleRunExecution}
        />
      )}
    </div>
  );
}