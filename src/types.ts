export type FileType = 'job' | 'script';

export interface FileEntry {
  name: string;
  type: FileType;
  content: string;
}

export interface RunFile {
  name: string;
  content: string;
}

export interface RunEnvironment {
  name: string;
  options: string;
  export: string;
  logs: RunFile[];
  scripts: RunFile[];
}

export interface ProjectRun {
  id: string;
  timestamp: string;
  isDryRun: boolean;
  environments: RunEnvironment[];
}

export interface Project {
  id: string;
  name: string;
  jobs: FileEntry[];
  scripts: FileEntry[];
  runs: ProjectRun[];
}

export type Environment = string; 

// Permissions: ProjectID -> JobName -> EnvName -> boolean
export type PermissionMap = Record<string, Record<string, Record<string, boolean>>>;