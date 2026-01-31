import { useState, useEffect, useRef, useMemo } from "react";
import { TopBar } from "../components/corb/TopBar";
import { ProjectSidebar, SelectionType } from "../components/corb/ProjectSidebar";
import { PropertiesEditor } from "../components/corb/PropertiesEditor";
import { ScriptEditor } from "../components/corb/ScriptEditor";
import { JobEditor } from "../components/corb/JobEditor";
import { ReportViewer } from "../components/corb/ReportViewer";
import { RunFooter, RunOptions, RunAction } from "../components/corb/RunFooter";
import { RunningView } from "../components/corb/RunningView";
import { PasswordDialog } from "../components/corb/PasswordDialog";
import { Project, ProjectRun, PermissionMap, EnvData } from "../types";
import { fetchProjects, fetchEnvFiles, saveFile, createRun, stopRun, deleteRun, copyFile, renameFile, deleteFile, fetchPermissions, savePermissions, getRunStatus, getRunFile } from "../lib/api";
import { AlertTriangle, Save, Lock, Unlock, KeyRound, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { MadeWithDyad } from "../components/made-with-dyad";
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

export default function Index() {
  const [environment, setEnvironment] = useState<string>('LOC');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [selection, setSelection] = useState<SelectionType | null>(null);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [envFiles, setEnvFiles] = useState<Record<string, EnvData>>({});
  const [originalEnvFiles, setOriginalEnvFiles] = useState<Record<string, EnvData>>({});
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

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
  const [sessionPasswords, setSessionPasswords] = useState<Record<string, string>>({}); 
  const [pendingRunOptions, setPendingRunOptions] = useState<RunOptions | null>(null);
  const [pendingRunJobName, setPendingRunJobName] = useState<string | null>(null);
  const [pendingRunAction, setPendingRunAction] = useState<RunAction | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
  }, []);

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

  const loadData = async () => {
    try {
        const [p, e, perms] = await Promise.all([fetchProjects(), fetchEnvFiles(), fetchPermissions()]);
        setProjects(p);
        setEnvFiles(e);
        setOriginalEnvFiles({ ...e });
        setPermissions(perms);
        
        // Ensure environment selection is valid, otherwise pick first
        const envKeys = Object.keys(e).sort();
        if ((!environment || !e[environment]) && envKeys.length > 0) {
             setEnvironment(envKeys[0]);
        }
    } catch (err) {
        toast.error("Failed to load data. Is the server running?");
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const fetchRunArtifacts = async (projectId: string, env: string, runId: string, runType: 'dry' | 'wet') => {
      const prefix = runType === 'wet' ? 'wet' : 'dry';
      
      const log = await getRunFile(projectId, env, runId, `${prefix}-output.log`);
      
      let reportName = `${prefix}-report.txt`;
      let reportContent = await getRunFile(projectId, env, runId, reportName);

      if (!reportContent) {
          // Fallback to export.csv if the standard report is empty
          const csv = await getRunFile(projectId, env, runId, 'export.csv');
          if (csv) {
              reportContent = csv;
              reportName = 'export.csv';
          }
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
                const statusStr = await getRunStatus(selectedProjectId, environment, lastRunId);
                const status = statusStr as 'running' | 'completed' | 'error';
                setActiveRunStatus(status);

                // 2. Fetch Files
                const { log, reportContent, reportName } = await fetchRunArtifacts(selectedProjectId, environment, lastRunId, activeRunType);
                
                setLiveReport(reportContent);
                setLiveReportName(reportName);
                setLiveLog(log);

                if (status === 'completed' || status === 'error') {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Delay to allow file flush
                    
                    const finalArtifacts = await fetchRunArtifacts(selectedProjectId, environment, lastRunId, activeRunType);
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

  const sortedEnvKeys = useMemo(() => Object.keys(envFiles).sort(), [envFiles]);
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
  // If server says it has password, we consider it "authorized" for prompt skipping purposes
  // OR if we have it in session memory
  const hasPassword = !!sessionPasswords[passwordKey] || envFiles[environment]?.hasPassword === true;

  const isCurrentJobEnabled = useMemo(() => {
      if (!selectedProjectId || !selection || selection.kind !== 'source' || selection.type !== 'job') return false;
      return permissions[selectedProjectId]?.[selection.name]?.[environment] === true;
  }, [permissions, selectedProjectId, selection, environment]);

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
      let files = getFiles();
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
          } catch (e: any) {
              toast.dismiss(tId);
              toast.error("Failed to normalize file names: " + e.message);
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
      } catch (e: any) { toast.error("Failed to move file: " + e.message); }
  };

  const handleMoveEnv = async (envName: string, direction: 'left' | 'right') => {
      let sorted = [...sortedEnvKeys];
      const needsNormalization = sorted.some(k => !/^\d+-/.test(k));
      if (needsNormalization) {
          const tId = toast.loading("Normalizing environments for ordering...");
          try {
              for (let i = 0; i < sorted.length; i++) {
                  const key = sorted[i];
                  const clean = key.replace(/^\d+-/, '');
                  const prefix = String(i + 1).padStart(2, '0');
                  const newName = `${prefix}-${clean}`;
                  if (key !== newName) await renameFile(null, `${key}.props`, `${newName}.props`, 'env');
              }
              const e = await fetchEnvFiles();
              setEnvFiles(e);
              setOriginalEnvFiles({ ...e });
              sorted = Object.keys(e).sort();
              const cleanOriginal = envName.replace(/^\d+-/, '');
              const found = sorted.find(k => k === cleanOriginal || k.endsWith(`-${cleanOriginal}`));
              if (found) envName = found;
              toast.dismiss(tId);
          } catch (e: any) { toast.dismiss(tId); toast.error("Failed to normalize: " + e.message); return; }
      }
      const idx = sorted.indexOf(envName);
      if (idx === -1) return;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      const nameA = sorted[idx];
      const nameB = sorted[targetIdx];
      const regex = /^(\d+)-(.*)$/;
      const matchA = nameA.match(regex);
      const matchB = nameB.match(regex);
      if (!matchA || !matchB) { toast.error("Files must have numeric prefixes"); return; }
      const newNameA = `${matchB[1]}-${matchA[2]}`;
      const newNameB = `${matchA[1]}-${matchB[2]}`;
      const tempName = `999-temp-swap`;
      try {
          await renameFile(null, `${nameA}.props`, `${tempName}.props`, 'env');
          await renameFile(null, `${nameB}.props`, `${newNameB}.props`, 'env');
          await renameFile(null, `${tempName}.props`, `${newNameA}.props`, 'env');
          const e = await fetchEnvFiles();
          setEnvFiles(e);
          setOriginalEnvFiles({ ...e });
          if (environment === nameA) setEnvironment(newNameA);
          else if (environment === nameB) setEnvironment(newNameB);
      } catch (e: any) { toast.error("Failed to move env: " + e.message); }
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
    } catch (err: any) { toast.error(err.message || "Operation failed"); }
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
              if (selection.fileName === 'export.csv') return env.export;
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

  const executeRunSequence = async (projectId: string, jobName: string, action: RunAction, options: RunOptions) => {
    try {


        const runId = await createRun(projectId, jobName, environment, options, action === 'wet' ? lastRunId : null);
        
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
        const finalOptions = { ...options, password: sessionPasswords[passwordKey] };
        finalOptions.dryRun = action !== 'wet';
        if (action === 'wet') finalOptions.limit = null;
        await executeRunSequence(selectedProjectId, jobName, action, finalOptions);
    }
  };

  const handlePasswordConfirm = (password: string, remember: boolean) => {
    if (remember) setSessionPasswords(prev => ({ ...prev, [passwordKey]: password }));
    if (pendingRunOptions && pendingRunJobName && pendingRunAction && selectedProjectId) {
        const finalOptions = { ...pendingRunOptions, password };
        executeRunSequence(selectedProjectId, pendingRunJobName, pendingRunAction, finalOptions);
    } else { toast.success("Password updated in memory"); }
  };

  const handleReviewComplete = () => {
      setRunMode('idle');
  };

  const handleStopRun = async () => {
      if (!lastRunId || !selectedProjectId) return;
      try {
          await stopRun(selectedProjectId, environment, lastRunId);
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
          const { log, reportContent, reportName } = await fetchRunArtifacts(selectedProjectId, environment, lastRunId, activeRunType);
          
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
              await deleteRun(selectedProjectId, environment, lastRunId);
              // Clean from local state if needed
              setProjects(prev => prev.map(p => {
                if (p.id !== selectedProjectId) return p;
                return { ...p, runs: p.runs.filter(r => !(r.timestamp === lastRunId && r.environments[0].name === environment)) };
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
          await deleteRun(selectedProjectId, environment, lastRunId);
      }
      
      // Determine Job Name (either from selection if still valid or stored)
      // Since we are in running mode, selection might be null or old. 
      // But we started this from a job.
      // We'll try to find the job name from the current view or selection.
      // Actually, we don't store "currentJobName" in state except via selection or pending.
      // We can infer it from the fact we are running something.
      // But wait, executeRunSequence takes a jobName.
      // If we are in runMode, we probably lost the selection context if the user clicked around?
      // Actually, the sidebar is disabled during runMode, so selection.name (if type=job) should still be valid.
      
      let jobName = "";
      if (selection?.kind === 'source' && selection.type === 'job') {
          jobName = selection.name;
      } else if (pendingRunJobName) {
          jobName = pendingRunJobName;
      } else {
          // Fallback: This shouldn't happen if UI is locked, but let's just use the selected one if available
          const proj = projects.find(p => p.id === selectedProjectId);
          // If we can't find it easily, maybe we shouldn't allow re-run without context?
          // But we can store it in a ref or state when running starts.
          // Let's assume selection is still valid because we disable sidebar.
          toast.error("Could not determine job context for re-run");
          return;
      }
      
      const finalOptions = { ...options, password: sessionPasswords[passwordKey] };
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

      const finalOptions = { ...options, password: sessionPasswords[passwordKey] };
      finalOptions.dryRun = false;
      finalOptions.limit = null;
      await executeRunSequence(selectedProjectId, jobName, 'wet', finalOptions);
  };


  const isJob = selection?.kind === 'source' && selection.type === 'job';
  const isRunOptions = selection?.kind === 'run' && selection.fileName === 'job.options';
  const isScript = (selection?.kind === 'source' && selection.type === 'script') || (selection?.kind === 'run' && selection.category === 'scripts');
  const isReadOnly = selection?.kind === 'run';
  const isLogOrCsv = selection?.kind === 'run' && (selection.category === 'logs' || selection.fileName === 'export.csv');
  const isReport = selection?.kind === 'run' && selection.category === 'reports';
  const isEnvDirty = envFiles[environment]?.content !== originalEnvFiles[environment]?.content;
  const currentJobPermissions = useMemo(() => {
      if (!selectedProjectId || !selection || selection.kind !== 'source' || selection.type !== 'job') return undefined;
      return permissions[selectedProjectId]?.[selection.name];
  }, [permissions, selectedProjectId, selection]);

  if (loading) return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading projects...</div>;

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <TopBar 
        currentEnv={environment} 
        environments={sortedEnvKeys}
        onEnvChange={setEnvironment} 
        onMoveEnv={handleMoveEnv}
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
                        onReview={handleReviewComplete}
                        onStop={handleStopRun}
                        onDiscard={handleDiscardRun}
                        onRunAgain={handleRunAgain}
                        onExecuteWet={handleExecuteWet}
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
                        {isReport && (
                            <ReportViewer 
                                content={getCurrentFileContent()} 
                                fileName={selection.fileName}
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
                <MadeWithDyad />
             </div>
          </div>
        )}

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
                            {hasPassword ? "Password stored in session memory." : "No password currently stored for this session."}
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