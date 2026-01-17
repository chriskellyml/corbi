import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import path from 'path';
import multer from 'multer';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const app = express();
const PORT = 3001;
const WORKING_DIR = '/Users/chkelly/Workspace/projects/lvbb/kt/1-beheer-scripts/corb-new/';

app.use(cors());
app.use(bodyParser.json());

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
const logStream = createWriteStream(logFilePath, { flags: 'a' });

function log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
}

log(`Server started. Logging to ${logFilePath}`);

// Setup directories
const PROJECTS_DIR = path.join(WORKING_DIR, 'src', 'projects');
const ENV_DIR = path.join(WORKING_DIR, 'env');
const RUNS_DIR = path.join(WORKING_DIR, 'runs');
const SUPPORT_DIR = path.join(WORKING_DIR, 'src', 'support');
const URIS_DIR = path.join(SUPPORT_DIR, 'uris');
const PROCESS_DIR = path.join(SUPPORT_DIR, 'process');
const UPLOADS_DIR = path.join(WORKING_DIR, 'uploads');
const PERMISSIONS_FILE = path.join(WORKING_DIR, 'permissions.json');

// Ensure working directory exists
if (!existsSync(WORKING_DIR)) {
  console.warn(`WARNING: Working directory ${WORKING_DIR} does not exist. Creating it for testing purposes.`);
  try {
      mkdirSync(WORKING_DIR, { recursive: true });
      mkdirSync(PROJECTS_DIR, { recursive: true });
      mkdirSync(ENV_DIR, { recursive: true });
      mkdirSync(RUNS_DIR, { recursive: true });
  } catch (e) {
      console.error("Failed to create working directory:", e);
  }
}

// Ensure support/uris exists with a dummy file if needed
if (!existsSync(URIS_DIR)) {
    try {
        mkdirSync(URIS_DIR, { recursive: true });
        fs.writeFile(path.join(URIS_DIR, 'example-collector.xqy'), 'xquery version "1.0-ml";\n(: Example Custom Collector :)\ncts:uris((),(),cts:and-query(()))');
    } catch(e) { console.error("Failed to create uris dir", e); }
}

// Ensure support/process exists with a dummy file if needed
if (!existsSync(PROCESS_DIR)) {
    try {
        mkdirSync(PROCESS_DIR, { recursive: true });
        fs.writeFile(path.join(PROCESS_DIR, 'example-process.xqy'), 'xquery version "1.0-ml";\n(: Example Custom Processor :)\ndeclare variable $URI as xs:string external;\nxdmp:log($URI)');
    } catch(e) { console.error("Failed to create process dir", e); }
}

// Ensure uploads dir
if (!existsSync(UPLOADS_DIR)) {
    try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e) {}
}

// Initialize permissions file if it doesn't exist
if (!existsSync(PERMISSIONS_FILE)) {
    try { fs.writeFile(PERMISSIONS_FILE, '{}', 'utf-8'); } catch(e) {}
}

const upload = multer({ dest: UPLOADS_DIR });

// Helper to safely resolve paths
const safePath = (base: string, sub: string) => {
  const resolved = path.resolve(base, sub);
  if (!resolved.startsWith(base)) {
    throw new Error('Access denied');
  }
  return resolved;
};

// Helper to recursively read scripts
async function getScriptsRecursively(dir: string, baseDir: string): Promise<any[]> {
    let results: any[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await getScriptsRecursively(fullPath, baseDir));
        } else if (entry.isFile() && /\.(xqy|js|sjs|txt)$/.test(entry.name)) {
            // Use forward slashes for consistency across platforms
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

// Helper to recursively copy directory
async function copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

// GET /api/permissions
app.get('/api/permissions', async (req, res) => {
    try {
        if (!existsSync(PERMISSIONS_FILE)) {
            return res.json({});
        }
        const content = await fs.readFile(PERMISSIONS_FILE, 'utf-8');
        res.json(JSON.parse(content || '{}'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/permissions
app.post('/api/permissions', async (req, res) => {
    try {
        const permissions = req.body;
        await fs.writeFile(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/projects
app.get('/api/projects', async (req, res) => {
  try {
    if (!existsSync(PROJECTS_DIR)) await fs.mkdir(PROJECTS_DIR, { recursive: true });
    
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    
    const projects = await Promise.all(projectDirs.map(async (pName) => {
      const pPath = path.join(PROJECTS_DIR, pName);
      
      // Get Jobs
      const jobFiles = (await fs.readdir(pPath))
        .filter(f => f.endsWith('.job'));
      
      const jobs = await Promise.all(jobFiles.map(async name => ({
        name,
        type: 'job',
        content: await fs.readFile(path.join(pPath, name), 'utf-8')
      })));

      // Get Scripts (Recursive)
      const scriptsDir = path.join(pPath, 'scripts');
      let scripts: any[] = [];
      if (existsSync(scriptsDir)) {
         scripts = await getScriptsRecursively(scriptsDir, scriptsDir);
      }

      // Get Runs (Nested Structure: runs/<project>/<env>/<timestamp>)
      const pRunsDir = path.join(RUNS_DIR, pName);
      let runs: any[] = [];
      
      if (existsSync(pRunsDir)) {
          // 1. Get Environment Directories
          const envDirs = (await fs.readdir(pRunsDir, { withFileTypes: true }))
              .filter(d => d.isDirectory())
              .map(d => d.name);

          for (const envName of envDirs) {
              const envRunsPath = path.join(pRunsDir, envName);
              // 2. Get Timestamp Directories per Env
              const runTimestamps = (await fs.readdir(envRunsPath)).filter(f => !f.startsWith('.'));
              
              const envRuns = await Promise.all(runTimestamps.map(async (rTimestamp) => {
                  const rPath = path.join(envRunsPath, rTimestamp);
                  if (!(await fs.stat(rPath)).isDirectory()) return null;

                  // Read options
                  let options = '';
                  try { options = await fs.readFile(path.join(rPath, 'job.options'), 'utf-8'); } catch(e) {}
                  
                  // Read export
                  let exportContent = '';
                  try { exportContent = await fs.readFile(path.join(rPath, 'export.csv'), 'utf-8'); } catch(e) {}

                  // Logs
                  const logs: any[] = [];
                  const logFiles = (await fs.readdir(rPath)).filter(f => f.endsWith('.log'));
                  for (const lf of logFiles) {
                      logs.push({ name: lf, content: await fs.readFile(path.join(rPath, lf), 'utf-8') });
                  }

                  // Scripts (snapshot)
                  const runScriptsDir = path.join(rPath, 'scripts');
                  let runScripts: any[] = [];
                  if (existsSync(runScriptsDir)) {
                      runScripts = await getScriptsRecursively(runScriptsDir, runScriptsDir);
                  }

                  return {
                      // We make ID unique by combining env and timestamp, though timestamp is usually unique enough,
                      // the UI filters by env so collision isn't visible, but for keys it's safer.
                      id: `${envName}/${rTimestamp}`,
                      timestamp: rTimestamp,
                      isDryRun: options.includes('DRY-RUN=true'),
                      environments: [{
                          name: envName,
                          options,
                          export: exportContent,
                          logs,
                          scripts: runScripts
                      }]
                  };
              }));
              
              runs = runs.concat(envRuns.filter(Boolean));
          }
      }
      
      // Sort runs by timestamp descending (newest first)
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
        if (!existsSync(ENV_DIR)) await fs.mkdir(ENV_DIR, { recursive: true });
        const files = await fs.readdir(ENV_DIR);
        const envs = {};
        for (const file of files) {
            if (file.endsWith('.props')) {
                const name = file.replace('.props', '');
                envs[name] = await fs.readFile(path.join(ENV_DIR, file), 'utf-8');
            }
        }
        res.json(envs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/support/uris
app.get('/api/support/uris', async (req, res) => {
    try {
        if (!existsSync(URIS_DIR)) return res.json([]);
        const files = await fs.readdir(URIS_DIR);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/support/process
app.get('/api/support/process', async (req, res) => {
    try {
        if (!existsSync(PROCESS_DIR)) return res.json([]);
        const files = await fs.readdir(PROCESS_DIR);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/support/:type/:filename
app.get('/api/support-content/:type/:filename', async (req, res) => {
    try {
        const { type, filename } = req.params;
        let baseDir;
        if (type === 'uris') baseDir = URIS_DIR;
        else if (type === 'process') baseDir = PROCESS_DIR;
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
    // Type: 'job', 'script', 'env', 'support-uris', 'support-process'
    
    try {
        let targetPath;
        if (type === 'env') {
            targetPath = safePath(ENV_DIR, fileName); // fileName is 'ENV.props'
        } else if (type === 'job') {
            targetPath = safePath(path.join(PROJECTS_DIR, projectId), fileName);
        } else if (type === 'script') {
            targetPath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), fileName);
            // Ensure dir exists for nested scripts
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
        } else if (type === 'support-uris') {
            targetPath = safePath(URIS_DIR, fileName);
        } else if (type === 'support-process') {
            targetPath = safePath(PROCESS_DIR, fileName);
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
        let sourcePath, targetPath;
        if (type === 'job') {
            sourcePath = safePath(path.join(PROJECTS_DIR, projectId), sourceName);
            targetPath = safePath(path.join(PROJECTS_DIR, projectId), targetName);
        } else if (type === 'script') {
            sourcePath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), sourceName);
            targetPath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), targetName);
            // Ensure dir exists
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
        let oldPath, newPath;
        if (type === 'job') {
            oldPath = safePath(path.join(PROJECTS_DIR, projectId), oldName);
            newPath = safePath(path.join(PROJECTS_DIR, projectId), newName);
        } else if (type === 'script') {
            oldPath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), oldName);
            newPath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), newName);
            // Ensure dir exists
            await fs.mkdir(path.dirname(newPath), { recursive: true });
        } else if (type === 'env') {
            oldPath = safePath(ENV_DIR, oldName);
            newPath = safePath(ENV_DIR, newName);
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
        let filePath;
        if (type === 'job') {
            filePath = safePath(path.join(PROJECTS_DIR, projectId), fileName);
        } else if (type === 'script') {
            filePath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), fileName);
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/run
app.post('/api/run', async (req, res) => {
    const { projectId, jobName, envName, options, password } = req.body;
    
    try {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const jobNameNoExt = jobName.replace(/\.job$/, '');
        
        // Prepare Environment Variables for Password
        // run.sh expects PASSWD_ENVNAME (with hyphens replaced by underscores)
        // e.g. 01-TEST -> PASSWD_01_TEST
        const envVarName = `PASSWD_${envName.replace(/-/g, '_')}`;
        const envVars = { ...process.env, [envVarName]: password || '' };

        // Helper to run the script
        const executeScript = async (isDryRun: boolean, stepName: string) => {
            const limitArg = options.limit ? `--limit=${options.limit}` : '';
            const skipArg = !isDryRun ? '--skip-proceed-confirmation' : '';
            
            const command = `./run.sh --env=${envName} --project=${projectId} --job=${jobNameNoExt} --dry-run=${isDryRun} --run-id=${timestamp} ${limitArg} ${skipArg}`;
            
            log(`--- STEP: ${stepName} ---`);
            log(`Executing: ${command}`);
            
            try {
                const { stdout, stderr } = await execPromise(command, { 
                    cwd: WORKING_DIR,
                    env: envVars
                });
                log(`STDOUT:\n${stdout}`);
                if (stderr) log(`STDERR:\n${stderr}`);
                log(`--- STEP COMPLETED: ${stepName} ---`);
            } catch (e) {
                log(`Exec Error in ${stepName}: ${e.message || e}`);
                if (e.stdout) log(`STDOUT:\n${e.stdout}`);
                if (e.stderr) log(`STDERR:\n${e.stderr}`);
                throw e; // Re-throw to be caught by main handler
            }
        };

        // 1. Always Run Dry Run First (to scaffold folders)
        // This is required by run.sh even for wet runs
        log("Starting Run Sequence...");
        await executeScript(true, "Scaffold / Prerequisite Dry Run");

        // 2. If Wet Run requested, run again with dry-run=false
        if (!options.dryRun) {
            log("Wet run requested. Proceeding to actual execution.");
            await executeScript(false, "Actual Execution (Wet Run)");
        } else {
            log("Dry run only requested. Run sequence complete.");
        }
        
        res.json({ success: true, runId: timestamp });
    } catch (error) {
        log(`Run failed: ${error.message || error}`);
        // Return stderr if available in error object
        const msg = error.stderr || error.message;
        res.status(500).json({ error: msg });
    }
});

// DELETE /api/run/:projectId/:envName/:runId
// Updated to accept envName for directory resolution
app.delete('/api/run/:projectId/:envName/:runId', async (req, res) => {
    const { projectId, envName, runId } = req.params;
    try {
        const runPath = safePath(path.join(RUNS_DIR, projectId, envName), runId);
        await fs.rm(runPath, { recursive: true, force: true });
        
        // Optional: Clean up env folder if empty
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
  log(`Working Dir: ${WORKING_DIR}`);
});