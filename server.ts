import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream, readFileSync, appendFileSync, writeFileSync } from 'fs';
import path from 'path';
import multer from 'multer';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import util from 'util';
import yaml from 'js-yaml';
import dotenv from 'dotenv';

// Load .env from repo root first (before CORBI_DATA_DIR is resolved)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const execFilePromise = util.promisify(execFile);

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);
let activeDataDir = path.resolve(process.env.CORBI_DATA_DIR || process.cwd());

interface DataContext {
    dataDir: string;
    dotEnvPath: string;
    projectsDir: string;
    envDir: string;
    runsDir: string;
    supportDir: string;
    urisDir: string;
    processDir: string;
    uploadsDir: string;
    permissionsFile: string;
    envOrderFile: string;
}

interface ScriptEntry {
    name: string;
    type: 'script';
    content: string;
}

interface StoredFile {
    name: string;
    content: string;
}

interface StoredRun {
    id: string;
    timestamp: string;
    isDryRun: boolean;
    environments: Array<{
        name: string;
        options: string;
        logs: StoredFile[];
        scripts: ScriptEntry[];
        reports: StoredFile[];
    }>;
}

// Setup logging
const LOGS_DIR = path.join(process.cwd(), 'logs');
if (!existsSync(LOGS_DIR)) {
    try {
        mkdirSync(LOGS_DIR, { recursive: true });
    } catch (e) {
        console.error("Failed to create logs directory:", e);
    }
}

const logFileName = `server-${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}.log`;
const logFilePath = path.join(LOGS_DIR, logFileName);
// Use synchronous appending for reliability during debugging
function log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    try {
        appendFileSync(logFilePath, logMessage);
    } catch (e) {
        console.error("Failed to write to log file:", e);
    }
}

app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
});

app.use(cors());
app.use(bodyParser.json());

log(`Server started. Logging to ${logFilePath}`);

function createDataContext(dataDir: string): DataContext {
    const resolvedDataDir = path.resolve(dataDir);
    const supportDir = path.join(resolvedDataDir, 'src', 'support');

    return {
        dataDir: resolvedDataDir,
        dotEnvPath: path.join(resolvedDataDir, '.env'),
        projectsDir: path.join(resolvedDataDir, 'src', 'projects'),
        envDir: path.join(resolvedDataDir, 'env'),
        runsDir: path.join(resolvedDataDir, 'runs'),
        supportDir,
        urisDir: path.join(supportDir, 'uris'),
        processDir: path.join(supportDir, 'process'),
        uploadsDir: path.join(resolvedDataDir, 'uploads'),
        permissionsFile: path.join(resolvedDataDir, 'permissions.json'),
        envOrderFile: path.join(resolvedDataDir, 'env', 'order.yaml')
    };
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function getDataContext() {
    return createDataContext(activeDataDir);
}

function ensureDataContextSync(context: DataContext) {
    if (!existsSync(context.dataDir)) {
        console.warn(`WARNING: Working directory ${context.dataDir} does not exist. Creating it for testing purposes.`);
        try {
            mkdirSync(context.dataDir, { recursive: true });
        } catch (e) {
            console.error("Failed to create working directory:", e);
        }
    }

    const requiredDirs = [
        context.projectsDir,
        context.envDir,
        context.runsDir,
        context.urisDir,
        context.processDir,
        context.uploadsDir,
    ];

    for (const dir of requiredDirs) {
        if (!existsSync(dir)) {
            try {
                mkdirSync(dir, { recursive: true });
            } catch (e) {
                console.error(`Failed to create directory ${dir}:`, e);
            }
        }
    }

    if (!existsSync(path.join(context.urisDir, 'example-collector.xqy'))) {
        try {
            writeFileSync(
                path.join(context.urisDir, 'example-collector.xqy'),
                'xquery version "1.0-ml";\n(: Example Custom Collector :)\ncts:uris((),(),cts:and-query(()))',
                'utf-8'
            );
        } catch (e) {
            console.error("Failed to create uris example file", e);
        }
    }

    if (!existsSync(path.join(context.processDir, 'example-process.xqy'))) {
        try {
            writeFileSync(
                path.join(context.processDir, 'example-process.xqy'),
                'xquery version "1.0-ml";\n(: Example Custom Processor :)\ndeclare variable $URI as xs:string external;\nxdmp:log($URI)',
                'utf-8'
            );
        } catch (e) {
            console.error("Failed to create process example file", e);
        }
    }

    if (!existsSync(context.permissionsFile)) {
        try {
            writeFileSync(context.permissionsFile, '{}', 'utf-8');
        } catch (e) {
            console.error("Failed to initialize permissions file:", e);
        }
    }
}

function readDataEnvVars(context: DataContext) {
    if (!existsSync(context.dotEnvPath)) {
        return {};
    }

    try {
        return dotenv.parse(readFileSync(context.dotEnvPath, 'utf-8'));
    } catch (e) {
        console.error(`Failed to read ${context.dotEnvPath}:`, e);
        return {};
    }
}

async function setActiveDataDirectory(nextDataDir: string) {
    const resolvedPath = path.resolve(nextDataDir.trim());

    // Create the directory if it doesn't exist
    if (!existsSync(resolvedPath)) {
        try {
            mkdirSync(resolvedPath, { recursive: true });
            log(`Created new data directory: ${resolvedPath}`);
        } catch (e) {
            throw new Error(`Cannot create directory: ${getErrorMessage(e)}`);
        }
    }

    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
        throw new Error('Selected path is not a directory');
    }

    const context = createDataContext(resolvedPath);
    ensureDataContextSync(context);
    activeDataDir = context.dataDir;
    log(`Active data directory set to ${context.dataDir}`);

    return context;
}

function getRunKey(dataDir: string, runId: string) {
    return `${path.resolve(dataDir)}::${runId}`;
}

async function browseForDirectory() {
    if (process.platform === 'darwin') {
        try {
            const { stdout, stderr } = await execFilePromise('osascript', [
                '-e',
                'set chosenFolder to choose folder with prompt "Select a folder for CoRBi data storage (projects, environments, runs will be created here)"',
                '-e',
                'POSIX path of chosenFolder'
            ]);
            const selectedPath = stdout.trim();
            log(`Folder picker returned: "${selectedPath}"`);
            if (stderr) log(`Folder picker stderr: ${stderr}`);
            return selectedPath;
        } catch (error) {
            log(`Folder picker error: ${getErrorMessage(error)}`);
            // User cancelled the dialog
            return '';
        }
    }

    if (process.platform === 'win32') {
        const script = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
            '$dialog.Description = "Select the CoRBi data directory"',
            'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }'
        ].join('; ');
        try {
            const { stdout } = await execFilePromise('powershell', ['-NoProfile', '-Command', script]);
            return stdout.trim();
        } catch {
            return '';
        }
    }

    if (process.platform === 'linux') {
        try {
            const { stdout } = await execFilePromise('zenity', [
                '--file-selection',
                '--directory',
                '--title=Select the CoRBi data directory'
            ]);
            return stdout.trim();
        } catch {
            try {
                const { stdout } = await execFilePromise('kdialog', [
                    '--getexistingdirectory',
                    process.cwd(),
                    '--title',
                    'Select the CoRBi data directory'
                ]);
                return stdout.trim();
            } catch {
                return '';
            }
        }
    }

    throw new Error(`Directory picker is not supported on ${process.platform}`);
}

ensureDataContextSync(getDataContext());

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            try {
                const context = getDataContext();
                if (!existsSync(context.uploadsDir)) {
                    mkdirSync(context.uploadsDir, { recursive: true });
                }
                cb(null, context.uploadsDir);
            } catch (error) {
                cb(error instanceof Error ? error : new Error(getErrorMessage(error)), process.cwd());
            }
        },
        filename: (_req, file, cb) => {
            const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `${unique}${path.extname(file.originalname)}`);
        }
    })
});

// In-memory status tracker
// Mapping: runId -> { status, process }
const activeRuns = new Map<string, { status: string, process?: ChildProcessWithoutNullStreams }>(); 

// Helper to safely resolve paths
const safePath = (base: string, sub: string) => {
    const resolvedBase = path.resolve(base);
    const resolved = path.resolve(resolvedBase, sub);

    if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
        throw new Error('Access denied');
    }

    return resolved;
};

// Helper to recursively read scripts
async function getScriptsRecursively(dir: string, baseDir: string): Promise<ScriptEntry[]> {
    let results: ScriptEntry[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await getScriptsRecursively(fullPath, baseDir));
        } else if (entry.isFile() && /\.(xqy|js|sjs|txt)$/.test(entry.name)) {
            const relativeName = path.relative(baseDir, fullPath).split(path.sep).join('/');
            results.push({
                name: relativeName,
                type: 'script',
                content: await fs.readFile(fullPath, 'utf-8')
            });
        }
    }
    return results;
}

// GET /api/permissions
app.get('/api/permissions', async (req, res) => {
    try {
        const context = getDataContext();
        if (!existsSync(context.permissionsFile)) {
            return res.json({});
        }
        const content = await fs.readFile(context.permissionsFile, 'utf-8');
        res.json(JSON.parse(content || '{}'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/permissions
app.post('/api/permissions', async (req, res) => {
    try {
        const context = getDataContext();
        const permissions = req.body;
        await fs.writeFile(context.permissionsFile, JSON.stringify(permissions, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/config/data-dir', async (_req, res) => {
    const context = getDataContext();
    res.json({ dataDir: context.dataDir });
});

app.post('/api/config/data-dir', async (req, res) => {
    const { dataDir } = req.body;

    if (!dataDir || typeof dataDir !== 'string' || !dataDir.trim()) {
        return res.status(400).json({ error: 'A data directory path is required' });
    }

    try {
        const context = await setActiveDataDirectory(dataDir);
        res.json({ dataDir: context.dataDir });
    } catch (error) {
        res.status(400).json({ error: getErrorMessage(error) || 'Failed to update data directory' });
    }
});

app.post('/api/config/data-dir/browse', async (_req, res) => {
    try {
        const selectedDirectory = await browseForDirectory();
        if (!selectedDirectory) {
            return res.status(400).json({ error: 'Directory selection cancelled' });
        }

        const context = await setActiveDataDirectory(selectedDirectory);
        res.json({ dataDir: context.dataDir });
    } catch (error) {
        res.status(400).json({ error: getErrorMessage(error) || 'Failed to browse for a data directory' });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'A project name is required' });
    }

    const projectName = name.trim();
    if (projectName === '.' || projectName === '..' || /[\\/]/.test(projectName)) {
        return res.status(400).json({ error: 'Project name contains invalid path characters' });
    }

    try {
        const context = getDataContext();
        const projectDir = safePath(context.projectsDir, projectName);

        if (existsSync(projectDir)) {
            return res.status(400).json({ error: 'A project with that name already exists' });
        }

        await fs.mkdir(path.join(projectDir, 'scripts', 'uris'), { recursive: true });
        await fs.mkdir(path.join(projectDir, 'scripts', 'process'), { recursive: true });

        res.json({ id: projectName, name: projectName });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

// GET /api/projects
app.get('/api/projects', async (req, res) => {
  try {
    const context = getDataContext();
    if (!existsSync(context.projectsDir)) await fs.mkdir(context.projectsDir, { recursive: true });
    
    const entries = await fs.readdir(context.projectsDir, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    
    const projects = await Promise.all(projectDirs.map(async (pName) => {
      const pPath = path.join(context.projectsDir, pName);
      
      const jobFiles = (await fs.readdir(pPath)).filter(f => f.endsWith('.job'));
      const jobs = await Promise.all(jobFiles.map(async name => ({
        name,
        type: 'job',
        content: await fs.readFile(path.join(pPath, name), 'utf-8')
      })));

      const scriptsDir = path.join(pPath, 'scripts');
      let scripts: ScriptEntry[] = [];
      if (existsSync(scriptsDir)) {
         scripts = await getScriptsRecursively(scriptsDir, scriptsDir);
      }

      const pRunsDir = path.join(context.runsDir, pName);
      let runs: StoredRun[] = [];
      
      if (existsSync(pRunsDir)) {
          const envDirs = (await fs.readdir(pRunsDir, { withFileTypes: true }))
              .filter(d => d.isDirectory())
              .map(d => d.name);

          for (const envName of envDirs) {
              const envRunsPath = path.join(pRunsDir, envName);
              const runTimestamps = (await fs.readdir(envRunsPath)).filter(f => !f.startsWith('.'));
              
              const envRuns = await Promise.all(runTimestamps.map(async (rTimestamp) => {
                  const rPath = path.join(envRunsPath, rTimestamp);
                  if (!(await fs.stat(rPath)).isDirectory()) return null;

                  let options = '';
                  try {
                      options = await fs.readFile(path.join(rPath, 'job.options'), 'utf-8');
                  } catch {
                      options = '';
                  }
                  
                  const logs: StoredFile[] = [];
                  const logFiles = (await fs.readdir(rPath)).filter(f => f.endsWith('.log'));
                  for (const lf of logFiles) {
                      logs.push({ name: lf, content: await fs.readFile(path.join(rPath, lf), 'utf-8') });
                  }
                  
                  const reports: StoredFile[] = [];
                  const reportFiles = (await fs.readdir(rPath)).filter(f => f.endsWith('report.txt'));
                  for (const rf of reportFiles) {
                      reports.push({ name: rf, content: await fs.readFile(path.join(rPath, rf), 'utf-8') });
                  }

                  const runScriptsDir = path.join(rPath, 'scripts');
                  let runScripts: ScriptEntry[] = [];
                  if (existsSync(runScriptsDir)) {
                      runScripts = await getScriptsRecursively(runScriptsDir, runScriptsDir);
                  }

                  return {
                      id: `${envName}/${rTimestamp}`,
                      timestamp: rTimestamp,
                      isDryRun: options.includes('DRY-RUN=true'),
                      environments: [{
                          name: envName,
                          options,
                          logs,
                          scripts: runScripts,
                          reports
                      }]
                  };
              }));
              runs = runs.concat(envRuns.filter(Boolean));
          }
      }
      
      runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        id: pName,
        name: pName,
        jobs,
        scripts,
        runs
      };
    }));

    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/envs
app.get('/api/envs', async (req, res) => {
    try {
        const context = getDataContext();
        if (!existsSync(context.envDir)) await fs.mkdir(context.envDir, { recursive: true });
        const files = await fs.readdir(context.envDir);
        const envs: Record<string, { content: string; hasPassword: boolean }> = {};
        
        const loadedEnvVars = { ...process.env, ...readDataEnvVars(context) };

        for (const file of files) {
            if (file.endsWith('.props')) {
                const name = file.replace('.props', '');
                const content = await fs.readFile(path.join(context.envDir, file), 'utf-8');
                
                // Check if we have a password for this environment
                const envVarName = `PASSWD_${name.replace(/-/g, '_')}`;
                const hasPassword = !!loadedEnvVars[envVarName];

                envs[name] = { content, hasPassword };
            }
        }

        // Handle Ordering via YAML
        let order: string[] = [];
        if (existsSync(context.envOrderFile)) {
             try {
                 const orderContent = await fs.readFile(context.envOrderFile, 'utf-8');
                 const parsed = yaml.load(orderContent);
                 if (Array.isArray(parsed)) {
                     order = parsed.filter((value): value is string => typeof value === 'string');
                 }
             } catch(e) { console.error("Failed to parse env/order.yaml", e); }
        }

        // If order is empty or missing items, append them sorted alphabetically
        const envKeys = Object.keys(envs).sort();
        if (order.length === 0) {
            order = envKeys;
        } else {
            // Append any missing keys
            const missing = envKeys.filter(k => !order.includes(k));
            if (missing.length > 0) {
                order = [...order, ...missing];
            }
            // Filter out keys that no longer exist
            order = order.filter(k => envKeys.includes(k));
        }

        res.json({ data: envs, order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/envs/order
app.post('/api/envs/order', async (req, res) => {
    try {
        const context = getDataContext();
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });
        
        await fs.writeFile(context.envOrderFile, yaml.dump(order), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/support/uris
app.get('/api/support/uris', async (req, res) => {
    try {
        const context = getDataContext();
        if (!existsSync(context.urisDir)) return res.json([]);
        const files = await fs.readdir(context.urisDir);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/support/process
app.get('/api/support/process', async (req, res) => {
    try {
        const context = getDataContext();
        if (!existsSync(context.processDir)) return res.json([]);
        const files = await fs.readdir(context.processDir);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/support/:type/:filename
app.get('/api/support-content/:type/:filename', async (req, res) => {
    try {
        const context = getDataContext();
        const { type, filename } = req.params;
        let baseDir;
        if (type === 'uris') baseDir = context.urisDir;
        else if (type === 'process') baseDir = context.processDir;
        else return res.status(400).json({ error: 'Invalid type' });

        const filePath = safePath(baseDir, filename);
        if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ path: req.file.path, filename: req.file.originalname });
});

// POST /api/save
app.post('/api/save', async (req, res) => {
    const { projectId, fileName, content, type } = req.body;
    try {
        const context = getDataContext();
        let targetPath;
        if (type === 'env') {
            targetPath = safePath(context.envDir, fileName);
        } else if (type === 'job') {
            targetPath = safePath(path.join(context.projectsDir, projectId), fileName);
        } else if (type === 'script') {
            targetPath = safePath(path.join(context.projectsDir, projectId, 'scripts'), fileName);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
        } else if (type === 'support-uris') {
            targetPath = safePath(context.urisDir, fileName);
        } else if (type === 'support-process') {
            targetPath = safePath(context.processDir, fileName);
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        await fs.writeFile(targetPath, content, 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/files/copy
app.post('/api/files/copy', async (req, res) => {
    const { projectId, sourceName, targetName, type } = req.body;
    try {
        const context = getDataContext();
        let sourcePath, targetPath;
        if (type === 'job') {
            sourcePath = safePath(path.join(context.projectsDir, projectId), sourceName);
            targetPath = safePath(path.join(context.projectsDir, projectId), targetName);
        } else if (type === 'script') {
            sourcePath = safePath(path.join(context.projectsDir, projectId, 'scripts'), sourceName);
            targetPath = safePath(path.join(context.projectsDir, projectId, 'scripts'), targetName);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        if (existsSync(targetPath)) return res.status(400).json({ error: 'Target file already exists' });
        
        await fs.copyFile(sourcePath, targetPath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/files/rename
app.post('/api/files/rename', async (req, res) => {
    const { projectId, oldName, newName, type } = req.body;
    try {
        const context = getDataContext();
        let oldPath, newPath;
        if (type === 'job') {
            oldPath = safePath(path.join(context.projectsDir, projectId), oldName);
            newPath = safePath(path.join(context.projectsDir, projectId), newName);
        } else if (type === 'script') {
            oldPath = safePath(path.join(context.projectsDir, projectId, 'scripts'), oldName);
            newPath = safePath(path.join(context.projectsDir, projectId, 'scripts'), newName);
            await fs.mkdir(path.dirname(newPath), { recursive: true });
        } else if (type === 'env') {
            oldPath = safePath(context.envDir, oldName);
            newPath = safePath(context.envDir, newName);
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        if (existsSync(newPath)) return res.status(400).json({ error: 'Target file already exists' });

        await fs.rename(oldPath, newPath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/files
app.delete('/api/files', async (req, res) => {
    const { projectId, fileName, type } = req.body;
    try {
        const context = getDataContext();
        let filePath;
        if (type === 'job') {
            filePath = safePath(path.join(context.projectsDir, projectId), fileName);
        } else if (type === 'script') {
            filePath = safePath(path.join(context.projectsDir, projectId, 'scripts'), fileName);
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/run/:projectId/:envName/:runId/files
app.get('/api/run/:projectId/:envName/:runId/files', async (req, res) => {
    const { projectId, envName, runId } = req.params;
    try {
        const context = getDataContext();
        const runDir = safePath(path.join(context.runsDir, projectId, envName), runId);
        if (!existsSync(runDir)) return res.json([]);
        const files = await fs.readdir(runDir);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/run
app.post('/api/run', async (req, res) => {
    log('Received request to /api/run'); // ADDED LOG
    const { projectId, jobName, envName, options, password, existingRunId } = req.body;
    log(`Run params: project=${projectId}, job=${jobName}, env=${envName}`); // ADDED LOG
    
    try {
        const context = getDataContext();
        const timestamp = existingRunId || new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const jobNameNoExt = jobName.replace(/\.job$/, '');
        const runKey = getRunKey(context.dataDir, timestamp);
        
        // Ensure directory exists immediately so we can stream logs to it
         const runDir = path.join(context.runsDir, projectId, envName, timestamp);
         await fs.mkdir(runDir, { recursive: true });

        // Password lookup using exact env name
        const envVarName = `PASSWD_${envName.replace(/-/g, '_')}`;

        // Initialize envVars from process.env (which includes loaded .env)
        const envVars = { ...process.env, ...readDataEnvVars(context) };
        
        const gradleProjectPasswordVarName = `ORG_GRADLE_PROJECT_${envVarName}`;

        // Gradle's runCorb script only checks .env and project properties.
        // ORG_GRADLE_PROJECT_* exposes the value as a project property without putting it on the command line.
        if (password && typeof password === 'string' && password.trim().length > 0) {
            envVars[envVarName] = password;
            envVars[gradleProjectPasswordVarName] = password;
        } else if (envVars[envVarName]) {
            envVars[gradleProjectPasswordVarName] = envVars[envVarName];
        }

        // Log usage (redacted)
        log(`Using password for ${envName} from ${envVars[envVarName] ? (password ? 'request body' : `environment variable ${envVarName}`) : 'NOWHERE (Missing)'}`);

const executeAsync = () => {
  if (options.dryRun) {
    // Run dry only
    const dryArgs = [
      `./gradlew`,
      `runCorb`,
      `-Penv=${envName}`,
      `-PcorbProject=${projectId}`,
      `-Pjob=${jobNameNoExt}`,
      `-PdryRun=true`,
      `-PrunId=${timestamp}`,
      options.limit ? `-Plimit=${options.limit}` : ''
    ].filter(Boolean);

    const dryLogPath = path.join(runDir, 'dry-output.log');
    const dryStream = createWriteStream(dryLogPath, { flags: 'a' });

    log(`[${timestamp}] Spawning Dry Run\nCommand: ${dryArgs.join(' ')}\nCWD: ${context.dataDir}`);
    
    dryStream.write(`[${timestamp}] Executing: ${dryArgs.join(' ')}\n\n`);

    const dryChild = spawn(dryArgs[0], dryArgs.slice(1), { 
      cwd: context.dataDir, 
      env: envVars,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (dryChild.stdout) dryChild.stdout.pipe(dryStream);
    if (dryChild.stderr) dryChild.stderr.pipe(dryStream);

    dryChild.on('error', (err) => {
      const errMsg = `[${timestamp}] Failed to start dry run process: ${err.message}\n`;
      log(errMsg.trim());
      dryStream.write(errMsg);
      activeRuns.set(runKey, { status: 'error' });
    });

    activeRuns.set(runKey, { status: 'running', process: dryChild });

    dryChild.on('close', (code) => {
      log(`[${timestamp}] Dry run exited with code ${code}`);
      activeRuns.set(runKey, { status: code === 0 ? 'completed' : 'error' });
    });
  } else {
    if (existingRunId) {
      // Run wet only on existing
      runWet();
    } else {
      // Run dry then chain wet
      const dryArgs = [
        `./gradlew`,
        `runCorb`,
        `-Penv=${envName}`,
        `-PcorbProject=${projectId}`,
        `-Pjob=${jobNameNoExt}`,
        `-PdryRun=true`,
        `-PrunId=${timestamp}`,
        options.limit ? `-Plimit=${options.limit}` : ''
      ].filter(Boolean);

      const dryLogPath = path.join(runDir, 'dry-output.log');
      const dryStream = createWriteStream(dryLogPath, { flags: 'a' });

      log(`[${timestamp}] Spawning Dry Run\nCommand: ${dryArgs.join(' ')}\nCWD: ${context.dataDir}`);
      
      dryStream.write(`[${timestamp}] Executing: ${dryArgs.join(' ')}\n\n`);

      const dryChild = spawn(dryArgs[0], dryArgs.slice(1), { 
        cwd: context.dataDir, 
        env: envVars,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (dryChild.stdout) dryChild.stdout.pipe(dryStream);
      if (dryChild.stderr) dryChild.stderr.pipe(dryStream);

      dryChild.on('error', (err) => {
        const errMsg = `[${timestamp}] Failed to start dry run process: ${err.message}\n`;
        log(errMsg.trim());
        dryStream.write(errMsg);
        activeRuns.set(runKey, { status: 'error' });
      });

      activeRuns.set(runKey, { status: 'running', process: dryChild });

      dryChild.on('close', (code) => {
        log(`[${timestamp}] Dry run exited with code ${code}`);
        if (code === 0) {
          runWet();
        } else {
          activeRuns.set(runKey, { status: 'error' });
        }
      });
    }
  }

  function runWet() {
    const wetArgs = [
      `./gradlew`,
      `runCorb`,
      `-Penv=${envName}`,
      `-PcorbProject=${projectId}`,
      `-Pjob=${jobNameNoExt}`,
      `-PdryRun=false`,
      `-PrunId=${timestamp}`
    ].filter(Boolean);

    const wetLogPath = path.join(runDir, 'wet-output.log');
    const wetStream = createWriteStream(wetLogPath, { flags: 'a' });

    log(`[${timestamp}] Spawning Wet Run\nCommand: ${wetArgs.join(' ')}\nCWD: ${context.dataDir}`);
    
    wetStream.write(`[${timestamp}] Executing: ${wetArgs.join(' ')}\n\n`);

    const wetChild = spawn(wetArgs[0], wetArgs.slice(1), {
      cwd: context.dataDir,
      env: envVars,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (wetChild.stdout) wetChild.stdout.pipe(wetStream);
    if (wetChild.stderr) wetChild.stderr.pipe(wetStream);

    wetChild.on('error', (err) => {
      const errMsg = `[${timestamp}] Failed to start wet run process: ${err.message}\n`;
      log(errMsg.trim());
      wetStream.write(errMsg);
      activeRuns.set(runKey, { status: 'error' });
    });

    activeRuns.set(runKey, { status: 'running', process: wetChild });

    wetChild.on('close', (wCode) => {
      log(`[${timestamp}] Wet run exited with code ${wCode}`);
      activeRuns.set(runKey, { status: wCode === 0 ? 'completed' : 'error' });
    });
  }
};

        activeRuns.set(runKey, { status: 'running' });
        executeAsync();
        
        res.json({ success: true, runId: timestamp });

    } catch (error) {
        log(`Run failed to start: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/run/:projectId/:envName/:runId/stop
app.post('/api/run/:projectId/:envName/:runId/stop', (req, res) => {
    const { runId } = req.params;
    const runKey = getRunKey(getDataContext().dataDir, runId);
    const runState = activeRuns.get(runKey);
    if (runState && runState.status === 'running' && runState.process) {
        log(`Stopping run ${runId} (PID ${runState.process.pid})`);
        try {
            runState.process.kill('SIGTERM'); 
        } catch(e) {
            console.error("Failed to kill process", e);
        }
        activeRuns.set(runKey, { status: 'error' });
    }
    res.json({ success: true });
});

// GET /api/run/:projectId/:envName/:runId/status
app.get('/api/run/:projectId/:envName/:runId/status', (req, res) => {
    const { runId } = req.params;
    const context = getDataContext();
    const runState = activeRuns.get(getRunKey(context.dataDir, runId));
    if (!runState) {
        const { projectId, envName } = req.params;
        const runPath = path.join(context.runsDir, projectId, envName, runId);
        if (existsSync(runPath)) {
            return res.json({ status: 'completed' });
        }
        return res.json({ status: 'unknown' });
    }
    res.json({ status: runState.status });
});

// GET /api/run/:projectId/:envName/:runId/file/:filename
app.get('/api/run/:projectId/:envName/:runId/file/:filename', async (req, res) => {
    const { projectId, envName, runId, filename } = req.params;
    try {
        const context = getDataContext();
        const filePath = safePath(path.join(context.runsDir, projectId, envName, runId), filename);
        if (existsSync(filePath)) {
            const content = await fs.readFile(filePath, 'utf-8');
            res.json({ content });
        } else {
            res.json({ content: '' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/run/:projectId/:envName/:runId
app.delete('/api/run/:projectId/:envName/:runId', async (req, res) => {
    const { projectId, envName, runId } = req.params;
    try {
        const context = getDataContext();
        const runPath = safePath(path.join(context.runsDir, projectId, envName), runId);
        await fs.rm(runPath, { recursive: true, force: true });
        
        activeRuns.delete(getRunKey(context.dataDir, runId));

        try {
            const envPath = path.dirname(runPath);
            const files = await fs.readdir(envPath);
            if (files.length === 0) {
                await fs.rmdir(envPath);
            }
        } catch(e) { /* ignore */ }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
  log(`Server running on http://localhost:${PORT}`);
  log(`Working Dir: ${activeDataDir}`);
});
