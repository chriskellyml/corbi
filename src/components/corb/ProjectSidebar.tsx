import { Project } from "../../data/mock-fs";
import { FolderGit2, Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "../../components/ui/input";

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

export function ProjectSidebar({ projects, selectedProjectId, onSelectProject }: ProjectSidebarProps) {
  return (
    <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Projects</h2>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter projects..." className="pl-8 h-9 text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-left",
              selectedProjectId === project.id && "bg-sidebar-accent text-sidebar-accent-foreground border-r-2 border-primary"
            )}
          >
            <FolderGit2 className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium">{project.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}