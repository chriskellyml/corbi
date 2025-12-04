import { Project, ProjectRun } from "../../data/mock-fs";
import { FolderGit2, Search, ArrowLeft, History, FileText, FileCode, PlayCircle, Folder, File, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Badge } from "../../components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";

// Define the selection structure shared with parent
export type SelectionType = 
  | { kind: 'source'; type: 'job' | 'script'; name: string }
  | { kind: 'run'; runId: string; envName: string; category: 'root' | 'logs' | 'scripts'; fileName: string };

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  selection: SelectionType | null;
  onSelectFile: (selection: SelectionType) => void;
  onDeleteRun: (projectId: string, runId: string) => void;
}

export function ProjectSidebar({ 
  projects, 
  selectedProjectId, 
  onSelectProject, 
  selection,
  onSelectFile,
  onDeleteRun
}: ProjectSidebarProps) {

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // PROJECT LIST VIEW
  if (!selectedProject) {
    return (
      <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Projects</h2>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter projects..." className="pl-8 h-9 text-sm" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-left"
              >
                <FolderGit2 className="h-4 w-4 shrink-0" />
                <span className="truncate font-medium">{project.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // PROJECT DETAIL VIEW
  return (
    <div className="w-72 bg-sidebar border-r border-border h-full flex flex-col animate-in slide-in-from-left-4 duration-200">
      {/* Header with Back Button */}
      <div className="p-4 border-b border-border bg-sidebar-accent/10">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onSelectProject(null)}
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground p-0 h-auto hover:bg-transparent"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Projects
        </Button>
        <h2 className="font-bold text-lg flex items-center gap-2 truncate" title={selectedProject.name}>
          <FolderGit2 className="h-5 w-5 text-primary" />
          {selectedProject.name}
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <Accordion type="multiple" defaultValue={["runs", "source"]} className="w-full">
          
          {/* RUNS SECTION */}
          <AccordionItem value="runs" className="border-b-0">
            <AccordionTrigger className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm font-semibold uppercase text-muted-foreground">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" /> Runs
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-4">
              {selectedProject.runs.length === 0 ? (
                <div className="px-8 py-2 text-xs text-muted-foreground italic">No runs recorded.</div>
              ) : (
                <div className="space-y-1">
                  {selectedProject.runs.map((run) => (
                    <RunItem 
                      key={run.id} 
                      run={run} 
                      projectId={selectedProject.id}
                      selection={selection}
                      onSelectFile={onSelectFile}
                      onDeleteRun={onDeleteRun}
                    />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* SOURCE SECTION */}
          <AccordionItem value="source" className="border-b-0">
            <AccordionTrigger className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm font-semibold uppercase text-muted-foreground">
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" /> Source Code
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-4">
               {/* Jobs */}
               <div className="px-4 py-1 text-xs font-semibold text-muted-foreground/70 mt-2 mb-1">JOBS</div>
               {selectedProject.jobs.map(job => (
                 <FileItem
                   key={job.name}
                   name={job.name}
                   icon={FileText}
                   iconColor="text-blue-500"
                   isSelected={selection?.kind === 'source' && selection.name === job.name}
                   onClick={() => onSelectFile({ kind: 'source', type: 'job', name: job.name })}
                 />
               ))}

               {/* Scripts */}
               <div className="px-4 py-1 text-xs font-semibold text-muted-foreground/70 mt-3 mb-1">SCRIPTS</div>
               {selectedProject.scripts.map(script => (
                 <FileItem
                   key={script.name}
                   name={script.name}
                   icon={FileCode}
                   iconColor="text-yellow-500"
                   isSelected={selection?.kind === 'source' && selection.name === script.name}
                   onClick={() => onSelectFile({ kind: 'source', type: 'script', name: script.name })}
                 />
               ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
    </div>
  );
}

// Helper Components

function FileItem({ name, icon: Icon, iconColor, isSelected, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-6 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-left border-l-2 border-transparent",
        isSelected && "bg-accent text-accent-foreground border-primary"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <span className="truncate">{name}</span>
    </button>
  );
}

function RunItem({ run, projectId, selection, onSelectFile, onDeleteRun }: { 
  run: ProjectRun, 
  projectId: string,
  selection: SelectionType | null, 
  onSelectFile: (s: SelectionType) => void,
  onDeleteRun: (pid: string, rid: string) => void
}) {
  return (
    <div className="px-2">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value={run.id} className="border-0">
          <div className="flex items-center group">
             <AccordionTrigger className="flex-1 px-2 py-1.5 hover:no-underline hover:bg-muted/50 rounded-md text-sm group-data-[state=open]:bg-muted/50">
                <div className="flex items-center gap-2 overflow-hidden">
                  <PlayCircle className={cn("h-4 w-4 shrink-0", run.isDryRun ? "text-amber-500" : "text-green-600")} />
                  <span className="truncate font-mono text-xs">{run.timestamp}</span>
                  {run.isDryRun && <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 ml-1">DRY</Badge>}
                </div>
             </AccordionTrigger>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -ml-8 mr-2 z-10">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Run?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the run artifacts for <strong>{run.timestamp}</strong>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => onDeleteRun(projectId, run.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
             </AlertDialog>
          </div>
          
          <AccordionContent className="pl-4 pt-1 pb-1">
            {/* Environments */}
            {run.environments.map(env => (
               <div key={env.name} className="pl-2 border-l border-border ml-1.5">
                  <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 flex items-center gap-1">
                    <Folder className="h-3 w-3" /> {env.name}
                  </div>
                  
                  {/* Root Files */}
                  <RunFileRow 
                    name="job.options" 
                    icon={FileText} 
                    isSelected={selection?.kind === 'run' && selection.runId === run.id && selection.fileName === 'job.options'}
                    onClick={() => onSelectFile({ kind: 'run', runId: run.id, envName: env.name, category: 'root', fileName: 'job.options' })}
                  />
                  <RunFileRow 
                    name="export.csv" 
                    icon={File} 
                    isSelected={selection?.kind === 'run' && selection.runId === run.id && selection.fileName === 'export.csv'}
                    onClick={() => onSelectFile({ kind: 'run', runId: run.id, envName: env.name, category: 'root', fileName: 'export.csv' })}
                  />

                  {/* Logs Folder */}
                  <div className="mt-1">
                    <div className="text-[10px] font-semibold text-muted-foreground/70 px-2 py-0.5 flex items-center gap-1">
                       <Folder className="h-3 w-3" /> logs
                    </div>
                    {env.logs.map(log => (
                      <RunFileRow 
                        key={log.name}
                        name={log.name} 
                        icon={FileText} 
                        indent
                        isSelected={selection?.kind === 'run' && selection.runId === run.id && selection.category === 'logs' && selection.fileName === log.name}
                        onClick={() => onSelectFile({ kind: 'run', runId: run.id, envName: env.name, category: 'logs', fileName: log.name })}
                      />
                    ))}
                  </div>

                  {/* Scripts Folder */}
                  <div className="mt-1">
                    <div className="text-[10px] font-semibold text-muted-foreground/70 px-2 py-0.5 flex items-center gap-1">
                       <Folder className="h-3 w-3" /> scripts
                    </div>
                    {env.scripts.map(script => (
                      <RunFileRow 
                        key={script.name}
                        name={script.name} 
                        icon={FileCode} 
                        indent
                        isSelected={selection?.kind === 'run' && selection.runId === run.id && selection.category === 'scripts' && selection.fileName === script.name}
                        onClick={() => onSelectFile({ kind: 'run', runId: run.id, envName: env.name, category: 'scripts', fileName: script.name })}
                      />
                    ))}
                  </div>
               </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function RunFileRow({ name, icon: Icon, isSelected, onClick, indent }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-left rounded-sm",
        isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        indent && "pl-4"
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate">{name}</span>
    </button>
  );
}