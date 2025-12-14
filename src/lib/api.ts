import { Project } from "../types";

const API_BASE = "http://localhost:3001/api";

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function fetchEnvFiles(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/envs`);
  if (!res.ok) throw new Error("Failed to fetch envs");
  return res.json();
}

export async function fetchSupportCollectors(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/support/collectors`);
    if (!res.ok) throw new Error("Failed to fetch support collectors");
    return res.json();
}

export async function fetchSupportProcessors(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/support/processors`);
    if (!res.ok) throw new Error("Failed to fetch support processors");
    return res.json();
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
  type: 'job' | 'script' | 'env'
): Promise<void> {
  const res = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, fileName, content, type })
  });
  if (!res.ok) throw new Error("Failed to save file");
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
  options: RunOptions
): Promise<string> {
  const res = await fetch(`${API_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      projectId, 
      jobName, 
      envName, 
      options,
      password: options.password
    })
  });
  if (!res.ok) throw new Error("Failed to run job");
  const data = await res.json();
  return data.runId;
}

export async function deleteRun(projectId: string, runId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/run/${projectId}/${runId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error("Failed to delete run");
}