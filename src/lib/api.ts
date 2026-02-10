import { Project, PermissionMap, EnvData } from "../types";

const API_BASE = "http://localhost:3001/api";

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function fetchEnvFiles(): Promise<{ data: Record<string, EnvData>, order: string[] }> {
  const res = await fetch(`${API_BASE}/envs`);
  if (!res.ok) throw new Error("Failed to fetch envs");
  return res.json();
}

export async function saveEnvOrder(order: string[]): Promise<void> {
    const res = await fetch(`${API_BASE}/envs/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
    });
    if (!res.ok) throw new Error("Failed to save environment order");
}

export async function fetchPermissions(): Promise<PermissionMap> {
    const res = await fetch(`${API_BASE}/permissions`);
    if (!res.ok) throw new Error("Failed to fetch permissions");
    return res.json();
}

export async function savePermissions(permissions: PermissionMap): Promise<void> {
    const res = await fetch(`${API_BASE}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissions)
    });
    if (!res.ok) throw new Error("Failed to save permissions");
}

export async function fetchSupportUris(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/support/uris`);
    if (!res.ok) throw new Error("Failed to fetch support uris");
    return res.json();
}

export async function fetchSupportProcess(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/support/process`);
    if (!res.ok) throw new Error("Failed to fetch support process scripts");
    return res.json();
}

export async function fetchSupportContent(type: 'uris' | 'process', filename: string): Promise<string> {
    const res = await fetch(`${API_BASE}/support-content/${type}/${filename}`);
    if (!res.ok) throw new Error("Failed to fetch support content");
    const data = await res.json();
    return data.content;
}

export async function uploadFile(file: File): Promise<{ path: string, filename: string }> {
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
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/stop`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error("Failed to stop run");
}

export async function getRunStatus(projectId: string, envName: string, runId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/status`);
    if (!res.ok) throw new Error("Failed to get run status");
    const data = await res.json();
    return data.status;
}

export async function getRunFile(projectId: string, envName: string, runId: string, filename: string): Promise<string> {
    // Add timestamp to prevent caching
    const url = `${API_BASE}/run/${projectId}/${envName}/${runId}/file/${filename}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch run file");
    const data = await res.json();
    return data.content;
}

export async function getRunFiles(projectId: string, envName: string, runId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}/files`);
    if (!res.ok) throw new Error("Failed to fetch run files");
    return res.json();
}

export async function deleteRun(projectId: string, envName: string, runId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/run/${projectId}/${envName}/${runId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error("Failed to delete run");
}