import { FileEntry } from "../../data/mock-fs";
import { FileCode, FileText } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";

interface FileExplorerProps {
  jobs: FileEntry[];
  scripts: FileEntry[];
  selectedFile: string | null;
  onSelectFile: (fileName: string, type: 'job' | 'script') => void;
}

export function FileExplorer({ jobs, scripts, selectedFile, onSelectFile }: FileExplorerProps) {
  return (
    <div className="w-60 bg-muted/30 border-r border-border h-full flex flex-col">
      <div className="p-4 pb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Jobs</h3>
        <div className="space-y-1">
          {jobs.map((job) => (
            <button
              key={job.name}
              onClick={() => onSelectFile(job.name, 'job')}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground text-left group",
                selectedFile === job.name && "bg-accent text-accent-foreground shadow-sm"
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="truncate">{job.name}</span>
              </div>
              {selectedFile === job.name && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-auto">Run</Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pt-2 flex-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Scripts</h3>
        <div className="space-y-1">
          {scripts.map((script) => (
            <button
              key={script.name}
              onClick={() => onSelectFile(script.name, 'script')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                selectedFile === script.name && "bg-accent text-accent-foreground shadow-sm"
              )}
            >
              <FileCode className="h-4 w-4 shrink-0 text-yellow-500" />
              <span className="truncate">{script.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}