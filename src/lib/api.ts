import { Project, PermissionMap, EnvData, DataDirectoryConfig } from "../types";

// Detect if we're running inside a Wails WebView.
// Wails injects window.go with bound methods.
function isWails(): boolean {
  return !!(window as any).go?.main?.App;
}

function wailsApp(): any {
  return (window as any).go.main.App;
}

// --- Fetch-based helpers (web/dev mode) ---

const API_BASE = "/api";

async function readJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    let message = fallbackMessage;
    try {
      const error = await res.json();
      message = error.error || fallbackMessage;
    } catch {
      // Ignore JSON parsing errors and keep the fallback message.
    }
    throw new Error(message);
  }

  return res.json();
}

// --- Data Directory ---

export async function fetchDataDirectoryConfig(): Promise<DataDirectoryConfig> {
  if (isWails()) {
    return wailsApp().GetDataDirectory();
  }
  const res = await fetch(`${API_BASE}/config/data-dir`);
  return readJsonOrThrow<DataDirectoryConfig>(res, "Failed to fetch data directory");
}

export async function setDataDirectory(dataDir: string): Promise<DataDirectoryConfig> {
  if (isWails()) {
    return wailsApp().SetDataDirectory(dataDir);
  }
  const res = await fetch(`${API_BASE}/config/data-dir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataDir }),
  });

  return readJsonOrThrow<DataDirectoryConfig>(res, "Failed to update data directory");
}

export async function browseDataDirectory(): Promise<DataDirectoryConfig> {
  if (isWails()) {
    return wailsApp().BrowseDataDirectory();
  }
  const res = await fetch(`${API_BASE}/config/data-dir/browse`, {
    method: "POST",
  });

  return readJsonOrThrow<DataDirectoryConfig>(res, "Failed to browse for a data directory");
}

// --- Projects ---

export async function fetchProjects(): Promise<Project[]> {
  if (isWails()) {
    return wailsApp().GetProjects();
  }
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(name: string): Promise<{ id: string; name: string }> {
  if (isWails()) {
    return wailsApp().CreateProject(name);
  }
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  return readJsonOrThrow<{ id: string; name: string }>(res, "Failed to create project");
}

// --- Environments ---

export async function fetchEnvFiles(): Promise<{ data: Record<string, EnvData>, order: string[] }> {
  if (isWails()) {
    return wailsApp().GetEnvFiles();
  }
  const res = await fetch(`${API_BASE}/envs`);
  if (!res.ok) throw new Error("Failed to fetch envs");
  return res.json();
}

export async function saveEnvOrder(order: string[]): Promise<void> {
    if (isWails()) {
        return wailsApp().SaveEnvOrder(order);
    }
    const res = await fetch(`${API_BASE}/envs/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
    });
    if (!res.ok) throw new Error("Failed to save environment order");
}

// --- Permissions ---

export async function fetchPermissions(): Promise<PermissionMap> {
    if (isWails()) {
        return wailsApp().GetPermissions();
    }
    const res = await fetch(`${API_BASE}/permissions`);
    if (!res.ok) throw new Error("Failed to fetch permissions");
    return res.json();
}

export async function savePermissions(permissions: PermissionMap): Promise<void> {
    if (isWails()) {
        return wailsApp().SavePermissions(permissions);
    }
    const res = await fetch(`${API_BASE}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissions)
    });
    if (!res.ok) throw new Error("Failed to save permissions");
}

// --- Support Files ---

export async function fetchSupportUris(): Promise<string[]> {
    if (isWails()) {
        return wailsApp().GetSupportUris();
    }
    const res = await fetch(`${API_BASE}/support/uris`);
    if (!res.ok) throw new Error("Failed to fetch support uris");
    return res.json();
}

export async function fetchSupportProcess(): Promise<string[]> {
    if (isWails()) {
        return wailsApp().GetSupportProcess();
    }
    const res = await fetch(`${API_BASE}/support/process`);
    if (!res.ok) throw new Error("Failed to fetch support process scripts");
    return res.json();
}

export async function fetchSupportContent(type: 'uris' | 'process', filename: string): Promise<string> {
    if (isWails()) {
        return wailsApp().GetSupportContent(type, filename);
    }
    const res = await fetch(`${API_BASE}/support-content/${type}/${filename}`);
    if (!res.ok) throw new Error("Failed to fetch support content");
    const data = await res.json();
    return data.content;
}

// --- File Operations ---

export async function uploadFile(file: File): Promise<{ path: string, filename: string }> {
    if (isWails()) {
        // In Wails mode, use native file dialog instead of browser file upload
        return wailsApp().UploadFile();
    }
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!res.ok) throw new Error("Failed to upload file");
    return res.json();
}

export async function saveFile(
  projectId: string | null, 
  fileName: string, 
  content: string, 
  type: 'job' | 'script' | 'env' | 'support-uris' | 'support-process'
): Promise<void> {
  if (isWails()) {
    return wailsApp().SaveFile({ projectId, fileName, content, type });
  }
  const res = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, fileName, content, type })
  });
  if (!res.ok) throw new Error("Failed to save file");
}

export async function copyFile(
    projectId: string,
    sourceName: string,
    targetName: string,
    type: 'job' | 'script'
): Promise<void> {
    if (isWails()) {
        return wailsApp().CopyFile({ projectId, sourceName, targetName, type });
    }
    const res = await fetch(`${API_BASE}/files/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceName, targetName, type })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to copy file");
    }
}

export async function renameFile(
    projectId: string | null,
    oldName: string,
    newName: string,
    type: 'job' | 'script' | 'env'
): Promise<void> {
    if (isWails()) {
        return wailsApp().RenameFile({ projectId, oldName, newName, type });
    }
    const res = await fetch(`${API_BASE}/files/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, oldName, newName, type })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to rename file");
    }
}

export async function deleteFile(
    projectId: string,
    fileName: string,
    type: 'job' | 'script'
): Promise<void> {
    if (isWails()) {
        return wailsApp().DeleteFile({ projectId, fileName, type });
    }
    const res = await fetch(`${API_BASE}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileName, type })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete file");
    }
}

// --- Run Operations ---

export interface RunOptions {
  limit: number | null;
  dryRun: boolean;
  threadCount: number;
  urisMode: 'default' | 'file' | 'custom';
  urisFile?: string;
  customUrisModule?: string;
  processMode: 'default' | 'custom';
  customProcessModule?: string;
  password?: string;
}

export async function createRun(
  projectId: string, 
  jobName: string, 
  envName: string, 
  options: RunOptions,
  existingRunId?: string | null
): Promise<string> {
  if (isWails()) {
    const result = await wailsApp().CreateRun({
      projectId,
      jobName,
      envName,
      options,
      password: options.password || "",
      existingRunId: existingRunId || "",
    });
    return result.runId;
  }
  const res = await fetch(`${API_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      projectId, 
      jobName, 
      envName, 
      options,
      password: options.password,
      existingRunId
    })
  });
  if (!res.ok) throw new Error("Failed to run job");
  const data = await res.json();
  return data.runId;
}

export async function stopRun(projectId: string, envName: string, runId: string): Promise<void> {
    if (isWails()) {
        return wailsApp().StopRun(projectId, envName, runId);
    }
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/stop`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error("Failed to stop run");
}

export async function getRunStatus(projectId: string, envName: string, runId: string): Promise<string> {
    if (isWails()) {
        const result = await wailsApp().GetRunStatus(projectId, envName, runId);
        return result.status;
    }
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/status`);
    if (!res.ok) throw new Error("Failed to get run status");
    const data = await res.json();
    return data.status;
}

export async function getRunFile(projectId: string, envName: string, runId: string, filename: string): Promise<string> {
    if (isWails()) {
        return wailsApp().GetRunFile(projectId, envName, runId, filename);
    }
    // Add timestamp to prevent caching
    const url = `${API_BASE}/run/${projectId}/${envName}/${runId}/file/${filename}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch run file");
    const data = await res.json();
    return data.content;
}

export async function getRunFiles(projectId: string, envName: string, runId: string): Promise<string[]> {
    if (isWails()) {
        return wailsApp().GetRunFiles(projectId, envName, runId);
    }
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/files`);
    if (!res.ok) throw new Error("Failed to fetch run files");
    return res.json();
}

export async function deleteRun(projectId: string, envName: string, runId: string): Promise<void> {
    if (isWails()) {
        return wailsApp().DeleteRun(projectId, envName, runId);
    }
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error("Failed to delete run");
}
