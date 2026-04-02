import { useState, useEffect, useRef, useMemo } from "react";
import { TopBar } from "../components/corb/TopBar";
import { DataDirectoryDialog } from "../components/corb/DataDirectoryDialog";
import { ProjectSidebar, SelectionType } from "../components/corb/ProjectSidebar";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { JobEditor } from "../components/corb/JobEditor";
import { ReportViewer } from "../components/corb/ReportViewer";
import { LogViewer } from "../components/corb/LogViewer";
import { RunFooter, RunOptions, RunAction } from "../components/corb/RunFooter";
import { RunningView } from "../components/corb/RunningView";
import { PasswordDialog } from "../components/corb/PasswordDialog";
import { Project, ProjectRun, PermissionMap, EnvData } from "../types";
import { fetchProjects, fetchEnvFiles, saveFile, createRun, stopRun, deleteRun, copyFile, renameFile, deleteFile, fetchPermissions, savePermissions, getRunStatus, getRunFile, getRunFiles, saveEnvOrder, setDataDirectory, browseDataDirectory, createProject } from "../lib/api";
import { AlertTriangle, Save, Lock, Unlock, KeyRound, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { cn } from "../lib/utils";

type RunMode = 'idle' | 'running' | 'review';
const DATA_DIR_STORAGE_KEY = "corbi:last-data-dir";
const PASSWORD_CACHE_STORAGE_KEY = "corbi:password-cache";
const PASSWORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface PasswordCacheEntry {
  password: string;
  expiresAt: number;
}

type PasswordCache = Record<string, PasswordCacheEntry>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePasswordCache(cache: PasswordCache, now = Date.now()): PasswordCache {
  return Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => (
      typeof entry?.password === "string" &&
      typeof entry?.expiresAt === "number" &&
      entry.expiresAt > now
    )),
  );
}

function readPasswordCache(): PasswordCache {
  try {
    const raw = window.localStorage.getItem(PASSWORD_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PasswordCache;
    return normalizePasswordCache(parsed);
  } catch {
    return {};
  }
}

function writePasswordCache(cache: PasswordCache) {
  const normalized = normalizePasswordCache(cache);
  if (Object.keys(normalized).length === 0) {
    window.localStorage.removeItem(PASSWORD_CACHE_STORAGE_KEY);
    return normalized;
  }

  window.localStorage.setItem(PASSWORD_CACHE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export default function Index() {
  const [environment, setEnvironment] = useState<string>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [selection, setSelection] = useState<SelectionType | null>(null);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [envFiles, setEnvFiles] = useState<Record<string, EnvData>>({});
  const [originalEnvFiles, setOriginalEnvFiles] = useState<Record<string, EnvData>>({});
  const [envOrder, setEnvOrder] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);
  const [dataDir, setDataDir] = useState("");
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [dataDirConfigured, setDataDirConfigured] = useState(false);
  const [isDataDirDialogOpen, setIsDataDirDialogOpen] = useState(false);
  const [isSavingDataDir, setIsSavingDataDir] = useState(false);
  const [isBrowsingDataDir, setIsBrowsingDataDir] = useState(false);

  // Run State
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<RunMode>('idle');
  const [activeRunStatus, setActiveRunStatus] = useState<'running' | 'completed' | 'error'>('running');
  const [liveReport, setLiveReport] = useState("");
  const [liveReportName, setLiveReportName] = useState("");
  const [liveLog, setLiveLog] = useState("");
  const [activeRunType, setActiveRunType] = useState<'dry'|'wet'>('dry');

  // UI State
  const [isEnvSaveDialogOpen, setIsEnvSaveDialogOpen] = useState(false);
  
  // File Ops State
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [nameDialogMode, setNameDialogMode] = useState<'create'|'rename'|'copy'>('create');
  const [nameDialogValue, setNameDialogValue] = useState("");
  const [fileOpContext, setFileOpContext] = useState<{ projectId: string, fileName?: string, type: 'job'|'script' } | null>(null);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Password Logic
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordCache, setPasswordCache] = useState<PasswordCache>({});
  const [pendingRunOptions, setPendingRunOptions] = useState<RunOptions | null>(null);
  const [pendingRunJobName, setPendingRunJobName] = useState<string | null>(null);
  const [pendingRunAction, setPendingRunAction] = useState<RunAction | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const normalized = writePasswordCache(passwordCache);
    if (JSON.stringify(normalized) !== JSON.stringify(passwordCache)) {
      setPasswordCache(normalized);
    }
  }, [passwordCache]);

  // Reset lastRunId when switching jobs or projects
  useEffect(() => {
    if (runMode === 'idle') {
        setLastRunId(null);
    }
  }, [selectedProjectId, selection?.kind === 'source' ? selection.name : '']);

  // Cleanup polling on unmount
  useEffect(() => {
      return () => {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
  }, []);

  const initializeApp = async () => {
    setPasswordCache(readPasswordCache());
    const storedDataDir = window.localStorage.getItem(DATA_DIR_STORAGE_KEY)?.trim();

    if (!storedDataDir) {
        // No saved directory -- prompt the user to pick one
        setIsDataDirDialogOpen(true);
        setLoading(false);
        return;
    }

    try {
        const config = await setDataDirectory(storedDataDir);
        setDataDir(config.dataDir);
        setDataDirDraft(config.dataDir);
        window.localStorage.setItem(DATA_DIR_STORAGE_KEY, config.dataDir);
        setDataDirConfigured(true);
        await loadData();
    } catch (err) {
        // Stored path is no longer valid -- clear it and prompt again
        window.localStorage.removeItem(DATA_DIR_STORAGE_KEY);
        toast.error("Previously saved data directory is no longer available. Please select a new one.");
        console.error(err);
        setIsDataDirDialogOpen(true);
    } finally {
        setLoading(false);
    }
  };

  const loadData = async () => {
    try {
        const [p, envRes, perms] = await Promise.all([fetchProjects(), fetchEnvFiles(), fetchPermissions()]);
        setProjects(p);
        setEnvFiles(envRes.data);
        setOriginalEnvFiles({ ...envRes.data });
        setEnvOrder(envRes.order);
        setPermissions(perms);
        
        // Ensure environment selection is valid, otherwise pick first from order
        if ((!environment || !envRes.data[environment]) && envRes.order.length > 0) {
             setEnvironment(envRes.order[0]);
        }
    } catch (err) {
        toast.error("Failed to load data from the selected directory.");
        console.error(err);
    }
  };

  const resetWorkspaceState = () => {
    setSelectedProjectId(null);
    setSelection(null);
    setLastRunId(null);
    setRunMode('idle');
    setActiveRunStatus('running');
    setLiveReport("");
    setLiveReportName("");
    setLiveLog("");
  };

  const applyDataDirectoryConfig = async (nextDataDir: string) => {
    const config = await setDataDirectory(nextDataDir);
    window.localStorage.setItem(DATA_DIR_STORAGE_KEY, config.dataDir);
    setDataDir(config.dataDir);
    setDataDirDraft(config.dataDir);
    setDataDirConfigured(true);
    resetWorkspaceState();
    await loadData();
    toast.success("Data directory updated");
    setIsDataDirDialogOpen(false);
  };

  const handleSaveDataDirectory = async () => {
    if (!dataDirDraft.trim()) {
        toast.error("Enter a data directory path.");
        return;
    }

    setIsSavingDataDir(true);
    try {
        await applyDataDirectoryConfig(dataDirDraft.trim());
    } catch (error) {
        toast.error(getErrorMessage(error) || "Failed to update data directory");
        console.error(error);
    } finally {
        setIsSavingDataDir(false);
    }
  };

  const handleBrowseDataDirectory = async () => {
    setIsBrowsingDataDir(true);
    try {
        const config = await browseDataDirectory();
        window.localStorage.setItem(DATA_DIR_STORAGE_KEY, config.dataDir);
        setDataDir(config.dataDir);
        setDataDirDraft(config.dataDir);
        setDataDirConfigured(true);
        resetWorkspaceState();
        await loadData();
        toast.success("Data directory updated");
        setIsDataDirDialogOpen(false);
    } catch (error) {
        const msg = getErrorMessage(error);
        // Don't show an error toast if the user just cancelled the OS dialog
        if (msg && !msg.toLowerCase().includes('cancelled')) {
            toast.error(msg || "Failed to browse for a data directory");
        }
        console.error(error);
    } finally {
        setIsBrowsingDataDir(false);
    }
  };

  const fetchRunArtifacts = async (projectId: string, env: string, runId: string, runType: 'dry' | 'wet') => {
      const prefix = runType === 'wet' ? 'wet' : 'dry';
      
      // Get all files in directory first
      let files: string[] = [];
      try {
          files = await getRunFiles(projectId, env, runId);
      } catch(e) { console.error("Failed to list files", e); }

      // Log: Try to find prefix-output.log, fallback to any .log
      const logName = files.find(f => f === `${prefix}-output.log`) || files.find(f => f.endsWith('.log')) || `${prefix}-output.log`;
      const log = await getRunFile(projectId, env, runId, logName);
      
      // Report: Try to find prefix-report.txt, fallback to ANY report.txt (excluding the other type). Default to expected name if missing.
      const otherPrefix = prefix === 'wet' ? 'dry' : 'wet';
      const reportName = files.find(f => f === `${prefix}-report.txt`) || 
                         files.find(f => f.endsWith('report.txt') && !f.startsWith(`${otherPrefix}-`)) || 
                         `${prefix}-report.txt`;
      
      let reportContent = "";
      if (files.includes(reportName)) {
           reportContent = await getRunFile(projectId, env, runId, reportName);
      } else {
           // Try fetching even if listing failed (fallback)
           reportContent = await getRunFile(projectId, env, runId, reportName);
      }

      return { log, reportContent, reportName };
  };

  // Polling Logic for Running Mode
  useEffect(() => {
    if (runMode === 'running' && lastRunId && selectedProjectId) {
        // Start polling
        pollIntervalRef.current = setInterval(async () => {
            try {
                // 1. Check Status
                const statusStr = await getRunStatus(selectedProjectId, cleanEnv, lastRunId);
                const status = statusStr as 'running' | 'completed' | 'error';
                setActiveRunStatus(status);

                // 2. Fetch Files
                const { log, reportContent, reportName } = await fetchRunArtifacts(selectedProjectId, cleanEnv, lastRunId, activeRunType);
                
                setLiveReport(reportContent);
                setLiveReportName(reportName);
                setLiveLog(log);

                if (status === 'completed' || status === 'error') {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Delay to allow file flush
                    
                    const finalArtifacts = await fetchRunArtifacts(selectedProjectId, cleanEnv, lastRunId, activeRunType);
                    setLiveReport(finalArtifacts.reportContent);
                    setLiveReportName(finalArtifacts.reportName);
                    setLiveLog(finalArtifacts.log);

                    setRunMode('review');
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    loadData();
                }

            } catch (e) {
                console.error("Polling error", e);
            }
        }, 1000);
    }

    return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [runMode, lastRunId, selectedProjectId, environment, activeRunType]);

  const cleanEnv = environment; // Kept for minimal diff, but now it's just identity
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const currentUserName = (() => {
    const content = envFiles[environment]?.content || "";
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex !== -1) {
            const key = trimmed.substring(0, eqIndex).trim();
            if (key === 'XCC-USER') return trimmed.substring(eqIndex + 1).trim();
        }
    }
    return 'unknown';
  })();
  const passwordKey = `${environment}:${currentUserName}`;
  const activePasswordEntry = (() => {
    const entry = passwordCache[passwordKey];
    if (!entry || entry.expiresAt <= Date.now()) return undefined;
    return entry;
  })();

  const storePasswordFor24Hours = (key: string, password: string) => {
    const expiresAt = Date.now() + PASSWORD_CACHE_TTL_MS;
    setPasswordCache((prev) => ({
      ...normalizePasswordCache(prev),
      [key]: { password, expiresAt },
    }));
  };

  const getStoredPassword = (key: string, refreshWindow = false) => {
    const entry = passwordCache[key];
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      setPasswordCache((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return undefined;
    }

    if (refreshWindow) {
      storePasswordFor24Hours(key, entry.password);
    }

    return entry.password;
  };

  const clearStoredPassword = (key: string) => {
    setPasswordCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // If server says it has password, we consider it "authorized" for prompt skipping purposes
  // OR if we have it in the local 24-hour cache
  const hasPassword = !!activePasswordEntry || envFiles[environment]?.hasPassword === true;

  const isCurrentJobEnabled = useMemo(() => {
      if (!selectedProjectId || !selection || selection.kind !== 'source' || selection.type !== 'job') return false;
      return permissions[selectedProjectId]?.[selection.name]?.[environment] !== false;
  }, [permissions, selectedProjectId, selection, environment]);

  const currentJobPermissions: Record<string, boolean> | undefined = useMemo(() => {
      if (!selectedProjectId || !selection || selection.kind !== 'source' || selection.type !== 'job') return undefined;
      return permissions[selectedProjectId]?.[selection.name];
  }, [permissions, selectedProjectId, selection]);

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    setSelection(null); 
    setLastRunId(null);
    setRunMode('idle');
    
    if (id) {
        const project = projects.find(p => p.id === id);
        if (project && project.jobs.length > 0) {
             const sortedJobs = [...project.jobs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
             if (sortedJobs.length > 0) {
                 setSelection({ kind: 'source', type: 'job', name: sortedJobs[0].name });
                 return;
             }
        }
    }
  };

  const handleCreateJob = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    let nextNum = 1;
    if (project) {
        project.jobs.forEach(j => {
            const match = j.name.match(/^(\d+)-/);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n >= nextNum) nextNum = n + 1;
            }
        });
    }
    const prefix = String(nextNum).padStart(2, '0');
    setFileOpContext({ projectId, type: 'job' });
    setNameDialogMode('create');
    setNameDialogValue(`${prefix}-`);
    setIsNameDialogOpen(true);
  };

  const handleCreateProject = async (projectName: string) => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
        toast.error("Enter a project name.");
        throw new Error("Project name is required");
    }

    try {
        const project = await createProject(trimmedName);
        await loadData();
        setSelectedProjectId(project.id);
        setSelection(null);
        setRunMode('idle');
        toast.success("Project created");
    } catch (error) {
        toast.error(getErrorMessage(error) || "Failed to create project");
        console.error(error);
        throw error;
    }
  };

  const handleCopyFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setNameDialogMode('copy');
    let displayValue = fileName;
    if (type === 'job') {
        displayValue = fileName.replace(/\.job$/, '');
        setNameDialogValue(`${displayValue}-copy`);
    } else {
        const parts = fileName.split('.');
        if (parts.length > 1) {
            const ext = parts.pop();
            setNameDialogValue(`${parts.join('.')}-copy.${ext}`);
        } else {
            setNameDialogValue(`${fileName}-copy`);
        }
    }
    setIsNameDialogOpen(true);
  };

  const handleRenameFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setNameDialogMode('rename');
    let displayValue = fileName;
    if (type === 'job') displayValue = fileName.replace(/\.job$/, '');
    setNameDialogValue(displayValue);
    setIsNameDialogOpen(true);
  };

  const handleDeleteFile = (projectId: string, fileName: string, type: 'job'|'script') => {
    setFileOpContext({ projectId, fileName, type });
    setIsDeleteAlertOpen(true);
  };

  const handleMoveFile = async (projectId: string, fileName: string, direction: 'up' | 'down', type: 'job' | 'script') => {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      const getFiles = () => type === 'job' ? project.jobs : project.scripts;
      const files = getFiles();
      let sorted = [...files].sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const needsNormalization = sorted.some(f => !/^\d+-/.test(f.name));
      if (needsNormalization) {
          const tId = toast.loading("Normalizing file names for ordering...");
          try {
              for (let i = 0; i < sorted.length; i++) {
                  const f = sorted[i];
                  const cleanName = f.name.replace(/^\d+-/, '');
                  const prefix = String(i + 1).padStart(2, '0');
                  const newName = `${prefix}-${cleanName}`;
                  if (f.name !== newName) await renameFile(projectId, f.name, newName, type);
              }
              const [p] = await Promise.all([fetchProjects()]);
              setProjects(p);
              const newProject = p.find(pp => pp.id === projectId);
              if (newProject) {
                  const newFiles = type === 'job' ? newProject.jobs : newProject.scripts;
                  sorted = [...newFiles].sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                  const cleanOriginal = fileName.replace(/^\d+-/, '');
                  const found = sorted.find(f => f.name === cleanOriginal || f.name.endsWith(`-${cleanOriginal}`));
                  if (found) fileName = found.name;
              }
              toast.dismiss(tId);
          } catch (e) {
              toast.dismiss(tId);
              toast.error("Failed to normalize file names: " + getErrorMessage(e));
              return;
          }
      }
      const idx = sorted.findIndex(f => f.name === fileName);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      const fileA = sorted[idx];
      const fileB = sorted[targetIdx];
      const regex = /^(\d+)-(.*)$/;
      const matchA = fileA.name.match(regex);
      const matchB = fileB.name.match(regex);
      if (!matchA || !matchB) { toast.error("Ordering error: Files must have numeric prefixes"); return; }
      const newNameA = `${matchB[1]}-${matchA[2]}`;
      const newNameB = `${matchA[1]}-${matchB[2]}`;
      const tempName = `${Date.now()}-move-temp.tmp`;
      try {
          await renameFile(projectId, fileA.name, tempName, type);
          await renameFile(projectId, fileB.name, newNameB, type);
          await renameFile(projectId, tempName, newNameA, type);
          await loadData();
          if (selection?.kind === 'source' && selection.name === fileA.name) setSelection({ ...selection, name: newNameA });
      } catch (e) { toast.error("Failed to move file: " + getErrorMessage(e)); }
  };

  const handleMoveEnv = async (envName: string, direction: 'left' | 'right') => {
      const currentOrder = [...envOrder];
      const idx = currentOrder.indexOf(envName);
      if (idx === -1) return;
      
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
      
      // Swap in array
      const temp = currentOrder[idx];
      currentOrder[idx] = currentOrder[targetIdx];
      currentOrder[targetIdx] = temp;
      
      // Optimistic update
      setEnvOrder(currentOrder);
      
      // Save
      try {
          await saveEnvOrder(currentOrder);
      } catch (e) {
          toast.error("Failed to save order: " + getErrorMessage(e));
          // Revert on failure
          setEnvOrder(envOrder); 
      }
  };

  const submitFileOp = async () => {
    if (!fileOpContext || !nameDialogValue) return;
    const { projectId, fileName, type } = fileOpContext;
    try {
        let finalName = nameDialogValue;
        if (type === 'job' && !finalName.endsWith('.job')) finalName += '.job';
        if (nameDialogMode === 'create') {
            await saveFile(projectId, finalName, "", 'job');
            toast.success("Job created");
        } else if (nameDialogMode === 'copy' && fileName) {
            await copyFile(projectId, fileName, finalName, type);
            toast.success("File duplicated");
        } else if (nameDialogMode === 'rename' && fileName) {
            await renameFile(projectId, fileName, finalName, type);
            toast.success("File renamed");
            if (selection?.kind === 'source' && selection.name === fileName) setSelection({ ...selection, name: finalName });
        }
        await loadData();
        setIsNameDialogOpen(false);
    } catch (err) { toast.error(getErrorMessage(err) || "Operation failed"); }
  };

  const submitDelete = async () => {
      if (!fileOpContext || !fileOpContext.fileName) return;
      try {
          await deleteFile(fileOpContext.projectId, fileOpContext.fileName, fileOpContext.type);
          toast.success("File deleted");
          if (selection?.kind === 'source' && selection.name === fileOpContext.fileName) setSelection(null);
          await loadData();
      } catch (err) { toast.error("Delete failed"); } finally { setIsDeleteAlertOpen(false); }
  };

  const handleRunJobFromSidebar = (jobName: string) => {
     if (runMode === 'running') return; // Disable switching while running
     if (selection?.kind !== 'source' || selection.name !== jobName) {
         setSelection({ kind: 'source', type: 'job', name: jobName });
         setRunMode('idle');
     }
  };

  const handleDeleteRun = async (projectId: string, envName: string, runId: string) => {
    try {
        await deleteRun(projectId, envName, runId);
        if (lastRunId === runId) setLastRunId(null);
        setProjects(prev => prev.map(p => {
          if (p.id !== projectId) return p;
          return { ...p, runs: p.runs.filter(r => !(r.timestamp === runId && r.environments[0].name === envName)) };
        }));
        toast.success("Run deleted successfully");
        if (selection?.kind === 'run' && selection.runId === runId) setSelection(null);
        loadData();
    } catch (err) { toast.error("Failed to delete run"); }
  };

  const handleContentChange = (newContent: string) => {
    if (!selectedProject || !selection || selection.kind === 'run') return;
    updateFileContent(selectedProject.id, selection.name, selection.type, newContent);
  };

  const updateFileContent = (projectId: string, fileName: string, type: 'job'|'script', newContent: string) => {
    const newProjects = projects.map(p => {
        if (p.id !== projectId) return p;
        if (type === 'job') {
          return { ...p, jobs: p.jobs.map(j => j.name === fileName ? { ...j, content: newContent } : j) };
        } else {
          return { ...p, scripts: p.scripts.map(s => s.name === fileName ? { ...s, content: newContent } : s) };
        }
      });
      setProjects(newProjects);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
          saveFile(projectId, fileName, newContent, type).then(() => {}).catch(() => toast.error("Failed to save changes"));
      }, 1000);
  };

  const handleEnvFileChange = (newContent: string) => {
    setEnvFiles(prev => ({ 
        ...prev, 
        [environment]: { 
            ...prev[environment], 
            content: newContent 
        } 
    }));
  };

  const handleJobOverrideChange = (key: string, value: string | undefined) => {
      if (!selectedProject || !selection || selection.kind !== 'source' || selection.type !== 'job') return;
      const jobContent = selectedProject.jobs.find(j => j.name === selection.name)?.content || "";
      const lines = jobContent.split('\n');
      let newLines: string[] = [];
      let found = false;
      if (value === undefined) {
          newLines = lines.filter(line => {
             const trimmed = line.trim();
             if (trimmed.startsWith('#')) return true;
             return trimmed.split('=')[0].trim() !== key;
          });
      } else {
          newLines = lines.map(line => {
             const trimmed = line.trim();
             if (!trimmed.startsWith('#') && trimmed.split('=')[0].trim() === key) {
                 found = true;
                 return `${key}=${value}`;
             }
             return line;
          });
          if (!found) newLines.push(`${key}=${value}`);
      }
      updateFileContent(selectedProject.id, selection.name, 'job', newLines.join('\n'));
  };

  const handleResetEnv = () => {
    setEnvFiles(prev => ({ 
        ...prev, 
        [environment]: { ...originalEnvFiles[environment] } 
    }));
    toast.info("Environment changes discarded");
  };

  const handleSaveEnv = async () => {
      try {
          const currentData = envFiles[environment];
          if (!currentData) return;
          
          await saveFile(null, `${environment}.props`, currentData.content, 'env');
          setOriginalEnvFiles(prev => ({ ...prev, [environment]: { ...currentData } }));
          toast.success("Environment saved successfully");
          setIsEnvSaveDialogOpen(false);
      } catch (e) { toast.error("Failed to save environment file"); }
  };

  const toggleCurrentJobPermission = async () => {
      if (!selectedProjectId || !selection || selection.kind !== 'source' || selection.type !== 'job') return;
      const newPermissions = JSON.parse(JSON.stringify(permissions));
      if (!newPermissions[selectedProjectId]) newPermissions[selectedProjectId] = {};
      if (!newPermissions[selectedProjectId][selection.name]) newPermissions[selectedProjectId][selection.name] = {};
      const currentVal = newPermissions[selectedProjectId][selection.name][environment];
      newPermissions[selectedProjectId][selection.name][environment] = !currentVal;
      try {
          await savePermissions(newPermissions);
          setPermissions(newPermissions);
          if (!currentVal) toast.success(`Enabled ${selection.name} in ${environment}`);
          else toast.info(`Disabled ${selection.name} in ${environment}`);
      } catch (e) { toast.error("Failed to save permission change"); }
  };

  const getCurrentFileContent = () => {
    if (!selectedProject || !selection) return "";
    if (selection.kind === 'source') {
      if (selection.type === 'job') return selectedProject.jobs.find(j => j.name === selection.name)?.content || "";
      return selectedProject.scripts.find(s => s.name === selection.name)?.content || "";
    } else {
      const run = selectedProject.runs.find(r => r.id === selection.runId);
      const env = run?.environments.find(e => e.name === selection.envName);
      if (!env) return "Error: Environment not found";
      
      switch (selection.category) {
          case 'root':
              if (selection.fileName === 'job.options') return env.options;
              return "";
          case 'logs':
              return env.logs.find(f => f.name === selection.fileName)?.content || "";
          case 'scripts':
              return env.scripts.find(f => f.name === selection.fileName)?.content || "";
          case 'reports':
              return env.reports.find(f => f.name === selection.fileName)?.content || "";
          default:
              return "";
      }
    }
    return "";
  };
  
  // Calculate correct full path for history viewer
  const getHistoryFullPath = () => {
      if (!selection || selection.kind !== 'run') return undefined;
      // Use full env name for clarity in debugging
      const parts = selection.runId.split('/');
      const timestamp = parts.length > 1 ? parts[1] : selection.runId;
      return `${selectedProjectId}/${selection.envName}/${timestamp}/${selection.fileName}`;
  };

  // Helper to refresh history item
  const handleHistoryRefresh = async () => {
      if (selection?.kind !== 'run') return;
      // Force reload data
      const tId = toast.loading("Refreshing history...");
      await loadData();
      toast.success("Refreshed", { id: tId });
  };

  const executeRunSequence = async (projectId: string, jobName: string, action: RunAction, options: RunOptions) => {
    try {
        const runId = await createRun(projectId, jobName, cleanEnv, options, action === 'wet' ? lastRunId : null);
        
        setLastRunId(runId);
        setActiveRunStatus('running');
        setRunMode('running');
        setLiveReport("");
        setLiveReportName("");
        setLiveLog("");
        setActiveRunType(action === 'wet' ? 'wet' : 'dry');

        toast.success(action === 'wet' ? "Wet Run Started" : "Dry Run Started", {
          description: `Run ID: ${runId}`,
          duration: 3000,
        });

    } catch (e) {
        toast.error("Failed to execute run");
        console.error(e);
    } finally {
        setPendingRunOptions(null);
        setPendingRunJobName(null);
        setPendingRunAction(null);
    }
  };

  const handleRunRequest = async (action: RunAction, options: RunOptions) => {
    if (!selectedProjectId) return;
    if (!isCurrentJobEnabled) { toast.error(`Job is disabled in ${environment}`); return; }
    let jobName = '';
    if (selection?.kind === 'source' && selection.type === 'job') jobName = selection.name;
    else jobName = (pendingRunJobName || ""); 
    
    if (!hasPassword) {
        setPendingRunOptions(options);
        setPendingRunJobName(jobName);
        setPendingRunAction(action);
        setIsPasswordDialogOpen(true);
    } else {
        const finalOptions = { ...options, password: getStoredPassword(passwordKey, true) };
        finalOptions.dryRun = action !== 'wet';
        if (action === 'wet') finalOptions.limit = null;
        await executeRunSequence(selectedProjectId, jobName, action, finalOptions);
    }
  };

  const handlePasswordConfirm = (password: string, remember: boolean) => {
    if (remember) storePasswordFor24Hours(passwordKey, password);
    if (pendingRunOptions && pendingRunJobName && pendingRunAction && selectedProjectId) {
        const finalOptions = { ...pendingRunOptions, password };
        executeRunSequence(selectedProjectId, pendingRunJobName, pendingRunAction, finalOptions);
    } else { toast.success(remember ? "Password stored for 24 hours" : "Password updated"); }
  };

  const handleReauthenticate = () => {
      clearStoredPassword(passwordKey);
      setPendingRunOptions(null);
      setPendingRunJobName(null);
      setPendingRunAction(null);
      setIsPasswordDialogOpen(true);
      toast.info(`Enter a new password for ${environment}.`);
  };

  const handleReviewComplete = () => {
      setRunMode('idle');
  };

  const handleStopRun = async () => {
      if (!lastRunId || !selectedProjectId) return;
      try {
          await stopRun(selectedProjectId, cleanEnv, lastRunId);
          toast.warning("Run stop requested...");
      } catch (e) {
          toast.error("Failed to stop run");
      }
  };

  // --- New Handlers for Dry Run Workflows ---

  const handleRefreshLiveArtifacts = async () => {
      if (!selectedProjectId || !lastRunId) return;
      
      const tId = toast.loading("Refreshing run artifacts...");
      try {
          const { log, reportContent, reportName } = await fetchRunArtifacts(selectedProjectId, cleanEnv, lastRunId, activeRunType);
          
          setLiveReport(reportContent);
          setLiveReportName(reportName);
          setLiveLog(log);
          
          toast.success("Refreshed", { id: tId });
      } catch (e) {
          toast.error("Failed to refresh", { id: tId });
      }
  };

  const handleDiscardRun = async (keepData: boolean) => {
      if (!lastRunId || !selectedProjectId) return;
      
      if (!keepData) {
          try {
              await deleteRun(selectedProjectId, cleanEnv, lastRunId);
              // Clean from local state if needed
              setProjects(prev => prev.map(p => {
                if (p.id !== selectedProjectId) return p;
                return { ...p, runs: p.runs.filter(r => !(r.timestamp === lastRunId && r.environments[0].name === cleanEnv)) };
              }));
              toast.info("Run data discarded");
          } catch(e) { toast.error("Failed to delete run"); }
      } else {
          toast.info("Run data preserved");
      }
      
      setRunMode('idle');
      setLastRunId(null);
  };

  const handleRunAgain = async (options: RunOptions) => {
      if (!selectedProjectId) return;
      // We assume "Run Again" discards the previous dry run unless we want to keep history spam.
      // Usually "Re-run" replaces the last attempt.
      if (lastRunId) {
          await deleteRun(selectedProjectId, cleanEnv, lastRunId);
      }
      
      let jobName = "";
      if (selection?.kind === 'source' && selection.type === 'job') {
          jobName = selection.name;
      } else if (pendingRunJobName) {
          jobName = pendingRunJobName;
      } else {
          toast.error("Could not determine job context for re-run");
          return;
      }
      
      const finalOptions = { ...options, password: getStoredPassword(passwordKey, true) };
      finalOptions.dryRun = true;
      await executeRunSequence(selectedProjectId, jobName, 'retry-dry', finalOptions);
  };

  const handleExecuteWet = async (options: RunOptions) => {
      if (!selectedProjectId) return;
      // Promoting to wet run. Typically we might want to keep the dry run record? 
      // But executeRunSequence deletes lastRunId if action is 'wet' or 'retry-dry'.
      // So it will replace the dry run with the wet run log. This seems clean.
      
      let jobName = "";
      if (selection?.kind === 'source' && selection.type === 'job') jobName = selection.name;
      else if (pendingRunJobName) jobName = pendingRunJobName;
      else {
          toast.error("Could not determine job context");
          return;
      }

      const finalOptions = { ...options, password: getStoredPassword(passwordKey, true) };
      finalOptions.dryRun = false;
      finalOptions.limit = null;
      await executeRunSequence(selectedProjectId, jobName, 'wet', finalOptions);
  };


  const isJob = selection?.kind === 'source' && selection.type === 'job';
  const isRunOptions = selection?.kind === 'run' && selection.fileName === 'job.options';
  const isScript = (selection?.kind === 'source' && selection.type === 'script') || (selection?.kind === 'run' && selection.category === 'scripts');
  const isReadOnly = selection?.kind === 'run';
  
  // Log / Report identification
  const isLog = selection?.kind === 'run' && selection.category === 'logs';
  const isReport = selection?.kind === 'run' && selection.category === 'reports';
  
  const isEnvDirty = envFiles[environment]?.content !== originalEnvFiles[environment]?.content;

  if (loading) return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading projects...</div>;

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <TopBar 
        currentEnv={environment} 
        environments={envOrder}
        onEnvChange={setEnvironment} 
        onMoveEnv={handleMoveEnv}
        dataDir={dataDir}
        onOpenDataDir={() => {
          setDataDirDraft(dataDir);
          setIsDataDirDialogOpen(true);
        }}
        jobPermissions={currentJobPermissions}
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: SIDEBAR */}
        <div className={cn("transition-all duration-300", runMode !== 'idle' ? "opacity-50 pointer-events-none" : "")}>
            <ProjectSidebar 
            projects={projects} 
            selectedProjectId={selectedProjectId} 
            onSelectProject={handleSelectProject}
            selection={selection}
            onSelectFile={setSelection}
            onCreateProject={handleCreateProject}
            onDeleteRun={handleDeleteRun}
            onCreateJob={handleCreateJob}
            onRunJob={handleRunJobFromSidebar}
            onCopyFile={handleCopyFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            onMoveFile={handleMoveFile}
            permissions={permissions}
            currentEnv={environment}
            />
        </div>

        {/* MIDDLE COLUMN: EDITOR or RUNNING VIEW */}
        {selectedProject ? (
          <div className="flex-1 flex flex-col min-w-0 bg-muted/10 border-r border-border border-l">
                {/* RUNNING MODE VIEW */}
                {(runMode === 'running' || runMode === 'review') ? (
                    <RunningView 
                        liveReport={liveReport}
                        liveReportName={liveReportName}
                        liveLog={liveLog}
                        activeRunType={activeRunType}
                        activeRunStatus={activeRunStatus}
                        reportFullPath={`${selectedProjectId}/${cleanEnv}/${lastRunId}/${liveReportName || (activeRunType === 'wet' ? 'wet-report.txt' : 'dry-report.txt')}`}
                        onReview={handleReviewComplete}
                        onStop={handleStopRun}
                        onDiscard={handleDiscardRun}
                        onRunAgain={handleRunAgain}
                        onExecuteWet={handleExecuteWet}
                        onReauthenticate={handleReauthenticate}
                        onRefreshReport={handleRefreshLiveArtifacts}
                    />
                ) : (
                /* NORMAL EDITOR VIEW */
                selection ? (
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {isJob && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-background">
                                <JobEditor 
                                    jobName={selection.name}
                                    content={getCurrentFileContent()}
                                    onChange={handleContentChange}
                                    project={selectedProject}
                                    onRefreshData={loadData}
                                    currentEnv={environment}
                                    isEnabled={isCurrentJobEnabled}
                                    onToggleEnabled={toggleCurrentJobPermission}
                                />
                            </div>
                        )}
                        
                        {isRunOptions && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-background">
                                <PropertiesEditor 
                                    title={`Run Snapshot: ${selection.fileName}`}
                                    baseContent={getCurrentFileContent()} 
                                    onBaseChange={() => {}}
                                    readOnly={true}
                                />
                            </div>
                        )}

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
                        
                        {isLog && (
                             <LogViewer 
                                content={getCurrentFileContent()} 
                                title={selection.fileName}
                                autoScroll={false}
                            />
                        )}

                        {(isReport) && (
                            <ReportViewer 
                                content={getCurrentFileContent()} 
                                fileName={selection.fileName}
                                fullPath={getHistoryFullPath()}
                                extraActions={
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleHistoryRefresh} 
                                        className="h-6 w-6" 
                                        title="Refresh"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                }
                            />
                        )}
                    </div>

                    {isJob && !isReadOnly && (
                        <RunFooter 
                            jobName={selection.name}
                            onRun={handleRunRequest}
                            disabled={!isCurrentJobEnabled}
                            hasLastRun={!!lastRunId}
                        />
                    )}
                </div>
                ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-dot-pattern">
                    <div className="max-w-md">
                    <h3 className="text-xl font-semibold mb-2 text-foreground">
                        {selectedProject.name}
                    </h3>
                    <p className="mb-4 text-sm">Select a source file to edit or a run artifact to inspect.</p>
                    </div>
                </div>
                ))}
          </div>
        ) : (
           <div className="flex-1 flex items-center justify-center text-muted-foreground bg-dot-pattern">
              <div className="text-center max-w-lg">
                 <div>(c) Progress</div>
              </div>
           </div>
         )
        }

        {/* RIGHT COLUMN: ENVIRONMENT / OVERRIDES - ONLY VISIBLE IN IDLE MODE */}
        {runMode === 'idle' && (
            <div className="w-[480px] bg-muted/40 flex flex-col border-l border-border">
                {/* 1. Env Properties Editor */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <PropertiesEditor 
                        title={isJob ? `Overrides for ${environment}` : `Environment: ${environment}.props`}
                        baseContent={envFiles[environment]?.content || ""}
                        overrideContent={isJob ? getCurrentFileContent() : null}
                        onBaseChange={handleEnvFileChange}
                        onOverrideChange={handleJobOverrideChange}
                        readOnly={isReadOnly}
                    />

                    {/* Unsaved Env Changes Warning */}
                    {!isJob && isEnvDirty && (
                        <div className="p-4 border-t bg-amber-50/80 space-y-3 shrink-0">
                            <div className="text-xs text-amber-800 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-semibold">Unsaved Changes</div>
                                    <div className="opacity-90">Global environment changes must be saved to take effect.</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleResetEnv} size="sm" variant="outline" className="flex-1 border-amber-300 text-amber-900 hover:bg-amber-100">
                                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                                </Button>
                                <Button onClick={() => setIsEnvSaveDialogOpen(true)} size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white border-amber-600">
                                    <Save className="mr-2 h-4 w-4" /> Save
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Authentication */}
                {!isJob && (
                    <div className="border-t bg-muted/10 p-4 shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-muted-foreground" />
                                Authentication
                            </h3>
                            <div className={cn(
                                "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border",
                                hasPassword ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"
                            )}>
                                {hasPassword ? "Authorized" : "Unauthorized"}
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-3">
                            User: <span className="font-mono font-semibold text-foreground">{currentUserName}</span>
                            <br/>
                            {activePasswordEntry
                              ? "Password cached locally for 24 hours since last use."
                              : envFiles[environment]?.hasPassword === true
                                ? "Password available from the environment configuration."
                                : "No cached password is currently available."}
                        </div>
                        <Button 
                            variant={hasPassword ? "outline" : "secondary"} 
                            size="sm" 
                            className="w-full"
                            onClick={() => { setPendingRunOptions(null); setIsPasswordDialogOpen(true); }}
                        >
                            {hasPassword ? (<><Unlock className="mr-2 h-3 w-3" /> Update Password</>) : (<><Lock className="mr-2 h-3 w-3" /> Enter Password</>)}
                        </Button>
                    </div>
                )}
            </div>
        )}
      </div>
      
      <PasswordDialog 
        open={isPasswordDialogOpen}
        onOpenChange={(open) => { setIsPasswordDialogOpen(open); if (!open && pendingRunOptions) setPendingRunOptions(null); }}
        envName={environment}
        userName={currentUserName}
        onConfirm={handlePasswordConfirm}
      />
      <DataDirectoryDialog
        open={isDataDirDialogOpen}
        value={dataDirDraft}
        currentValue={dataDir}
        isSaving={isSavingDataDir}
        isBrowsing={isBrowsingDataDir}
        required={!dataDirConfigured}
        onOpenChange={(open) => {
          setIsDataDirDialogOpen(open);
          if (open) setDataDirDraft(dataDir);
        }}
        onValueChange={setDataDirDraft}
        onBrowse={handleBrowseDataDirectory}
        onConfirm={handleSaveDataDirectory}
      />
      <AlertDialog open={isEnvSaveDialogOpen} onOpenChange={setIsEnvSaveDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Save Environment Changes?</AlertDialogTitle>
                <AlertDialogDescription>You are about to modify the <strong>{environment}</strong> environment configuration.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSaveEnv}>Yes, Save Changes</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>
                      {nameDialogMode === 'create' && 'Create New Job'}
                      {nameDialogMode === 'copy' && 'Duplicate File'}
                      {nameDialogMode === 'rename' && 'Rename / Re-order File'}
                  </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                  <Input value={nameDialogValue} onChange={(e) => setNameDialogValue(e.target.value)} placeholder="Enter file name..." autoFocus />
                  {nameDialogMode === 'rename' && <p className="text-xs text-muted-foreground mt-2">Tip: Use prefixes like <code>01-</code>, <code>02-</code> to re-order files.</p>}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNameDialogOpen(false)}>Cancel</Button>
                  <Button onClick={submitFileOp}>Confirm</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete <strong>{fileOpContext?.fileName}</strong>. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={submitDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
