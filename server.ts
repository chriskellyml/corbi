import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import path from 'path';
import multer from 'multer';

const app = express();
const PORT = 3001;
const WORKING_DIR = '/Users/chkelly/Workspace/projects/lvbb/kt/1-beheer-scripts/corb-new/';

app.use(cors());
app.use(bodyParser.json());

// Setup directories
const PROJECTS_DIR = path.join(WORKING_DIR, 'projects');
const ENV_DIR = path.join(WORKING_DIR, 'env');
const RUNS_DIR = path.join(WORKING_DIR, 'runs');
const SUPPORT_DIR = path.join(WORKING_DIR, 'support');
const COLLECTORS_DIR = path.join(SUPPORT_DIR, 'collectors');
const PROCESSORS_DIR = path.join(SUPPORT_DIR, 'processors');
const UPLOADS_DIR = path.join(WORKING_DIR, 'uploads');

// Ensure working directory exists
if (!existsSync(WORKING_DIR)) {
  console.warn(`WARNING: Working directory ${WORKING_DIR} does not exist. Creating it for testing purposes.`);
  try {
      mkdirSync(WORKING_DIR, { recursive: true });
      mkdirSync(PROJECTS_DIR);
      mkdirSync(ENV_DIR);
      mkdirSync(RUNS_DIR);
  } catch (e) {
      console.error("Failed to create working directory:", e);
  }
}

// Ensure support/collectors exists with a dummy file if needed
if (!existsSync(COLLECTORS_DIR)) {
    try {
        mkdirSync(COLLECTORS_DIR, { recursive: true });
        fs.writeFile(path.join(COLLECTORS_DIR, 'example-collector.xqy'), 'xquery version "1.0-ml";\n(: Example Custom Collector :)\ncts:uris((),(),cts:and-query(()))');
    } catch(e) { console.error("Failed to create collectors dir", e); }
}

// Ensure support/processors exists with a dummy file if needed
if (!existsSync(PROCESSORS_DIR)) {
    try {
        mkdirSync(PROCESSORS_DIR, { recursive: true });
        fs.writeFile(path.join(PROCESSORS_DIR, 'example-processor.xqy'), 'xquery version "1.0-ml";\n(: Example Custom Processor :)\ndeclare variable $URI as xs:string external;\nxdmp:log($URI)');
    } catch(e) { console.error("Failed to create processors dir", e); }
}

// Ensure uploads dir
if (!existsSync(UPLOADS_DIR)) {
    try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e) {}
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

      // Get Scripts
      const scriptsDir = path.join(pPath, 'scripts');
      let scripts = [];
      if (existsSync(scriptsDir)) {
         const scriptFiles = (await fs.readdir(scriptsDir))
            .filter(f => f.endsWith('.xqy') || f.endsWith('.js') || f.endsWith('.sjs'));
         
         scripts = await Promise.all(scriptFiles.map(async name => ({
           name,
           type: 'script',
           content: await fs.readFile(path.join(scriptsDir, name), 'utf-8')
         })));
      }

      // Get Runs
      const pRunsDir = path.join(RUNS_DIR, pName);
      let runs = [];
      if (existsSync(pRunsDir)) {
          const runDirs = (await fs.readdir(pRunsDir)).reverse(); // Newest first by name usually
          runs = await Promise.all(runDirs.map(async rId => {
              const rPath = path.join(pRunsDir, rId);
              if (!(await fs.stat(rPath)).isDirectory()) return null;

              // Read run details
              const envFiles = (await fs.readdir(rPath)).filter(f => f.endsWith('.props'));
              const envName = envFiles.length > 0 ? envFiles[0].replace('.props', '') : 'UNKNOWN';
              
              // Read options
              let options = '';
              try { options = await fs.readFile(path.join(rPath, 'job.options'), 'utf-8'); } catch(e) {}
              
              // Read export
              let exportContent = '';
              try { exportContent = await fs.readFile(path.join(rPath, 'export.csv'), 'utf-8'); } catch(e) {}

              // Logs
              const logs = [];
              const logFiles = (await fs.readdir(rPath)).filter(f => f.endsWith('.log'));
              for (const lf of logFiles) {
                  logs.push({ name: lf, content: await fs.readFile(path.join(rPath, lf), 'utf-8') });
              }

              // Scripts (snapshot)
              const runScriptsDir = path.join(rPath, 'scripts');
              const runScripts = [];
              if (existsSync(runScriptsDir)) {
                  const rsFiles = await fs.readdir(runScriptsDir);
                  for (const rs of rsFiles) {
                      runScripts.push({ name: rs, content: await fs.readFile(path.join(runScriptsDir, rs), 'utf-8') });
                  }
              }

              return {
                  id: rId,
                  timestamp: rId,
                  isDryRun: options.includes('DRY-RUN=true'), // Simple heuristic
                  environments: [{
                      name: envName,
                      options,
                      export: exportContent,
                      logs,
                      scripts: runScripts
                  }]
              };
          }));
      }

      return {
        id: pName,
        name: pName,
        jobs,
        scripts,
        runs: runs.filter(Boolean)
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

// GET /api/support/collectors
app.get('/api/support/collectors', async (req, res) => {
    try {
        if (!existsSync(COLLECTORS_DIR)) return res.json([]);
        const files = await fs.readdir(COLLECTORS_DIR);
        res.json(files.filter(f => !f.startsWith('.')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/support/processors
app.get('/api/support/processors', async (req, res) => {
    try {
        if (!existsSync(PROCESSORS_DIR)) return res.json([]);
        const files = await fs.readdir(PROCESSORS_DIR);
        res.json(files.filter(f => !f.startsWith('.')));
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
    // Type: 'job', 'script', 'env' 
    
    try {
        let targetPath;
        if (type === 'env') {
            targetPath = safePath(ENV_DIR, fileName); // fileName is 'ENV.props'
        } else if (type === 'job') {
            targetPath = safePath(path.join(PROJECTS_DIR, projectId), fileName);
        } else if (type === 'script') {
            targetPath = safePath(path.join(PROJECTS_DIR, projectId, 'scripts'), fileName);
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
        const runDir = path.join(RUNS_DIR, projectId, timestamp);
        
        await fs.mkdir(runDir, { recursive: true });

        // 1. Read & Copy Job File
        const jobPath = path.join(PROJECTS_DIR, projectId, jobName);
        let jobContent = await fs.readFile(jobPath, 'utf-8');
        await fs.writeFile(path.join(runDir, jobName), jobContent);

        // 2. Read & Copy Env File
        const envContent = await fs.readFile(path.join(ENV_DIR, `${envName}.props`), 'utf-8');
        await fs.writeFile(path.join(runDir, `${envName}.props`), envContent);

        // 3. Create job.options (Merged)
        let optionsContent = `# Generated at ${timestamp}\n`;
        
        // A. Environment
        optionsContent += `\n# --- Environment: ${envName} ---\n`;
        optionsContent += envContent + '\n';
        
        // Inject Password if provided
        if (password) {
            optionsContent += `# Injected Password\nPASS=${password}\n`;
        }

        // B. Job Overrides (handle options modifications here)
        optionsContent += `\n# --- Job: ${jobName} ---\n`;
        
        // Handle URIS-MODULE / URIS-FILE overrides logic
        // If URIS_MODULE_MODE is file, we strip URIS-MODULE from jobContent and add URIS-FILE
        // If URIS_MODULE_MODE is custom, we strip URIS-MODULE from jobContent and add custom one
        
        const lines = jobContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip URIS-MODULE if we are overriding it
            if ((options.urisMode === 'file' || options.urisMode === 'custom') && 
                (trimmed.startsWith('URIS-MODULE') || trimmed.startsWith('URIS_MODULE'))) {
                optionsContent += `# OVERRIDDEN: ${line}\n`;
                continue;
            }
             // Skip PROCESS-MODULE if we are overriding it
             if ((options.processMode === 'custom') && 
             (trimmed.startsWith('PROCESS-MODULE') || trimmed.startsWith('PROCESS_MODULE'))) {
             optionsContent += `# OVERRIDDEN: ${line}\n`;
             continue;
         }
            optionsContent += line + '\n';
        }

        // Add Overrides
        optionsContent += `\n# --- Run Overrides ---\n`;
        if (options.urisMode === 'file' && options.urisFile) {
            optionsContent += `URIS-FILE=${options.urisFile}\n`;
        } else if (options.urisMode === 'custom' && options.customUrisModule) {
            optionsContent += `URIS-MODULE=${path.join(COLLECTORS_DIR, options.customUrisModule)}\n`;
        }

        if (options.processMode === 'custom' && options.customProcessModule) {
             // Updated to use PROCESSORS_DIR
             optionsContent += `PROCESS-MODULE=${path.join(PROCESSORS_DIR, options.customProcessModule)}\n`;
        }

        // C. Runtime Settings
        if (options.limit) {
            optionsContent += `URIS-MODULE.LIMIT=${options.limit}\n`;
            optionsContent += `PROCESS-MODULE.LIMIT=${options.limit}\n`;
        }
        
        const dryRunVal = String(options.dryRun);
        optionsContent += `URIS-MODULE.DRY-RUN=${dryRunVal}\n`;
        optionsContent += `PROCESS-MODULE.DRY-RUN=${dryRunVal}\n`;
        
        optionsContent += `THREAD-COUNT=${options.threadCount}\n`;

        await fs.writeFile(path.join(runDir, 'job.options'), optionsContent);

        // 4. Copy Scripts
        const scriptsSrc = path.join(PROJECTS_DIR, projectId, 'scripts');
        const scriptsDst = path.join(runDir, 'scripts');
        if (existsSync(scriptsSrc)) {
            await fs.mkdir(scriptsDst);
            const scriptFiles = await fs.readdir(scriptsSrc);
            for (const f of scriptFiles) {
                if (f.endsWith('.xqy') || f.endsWith('.js') || f.endsWith('.sjs')) {
                    await fs.copyFile(path.join(scriptsSrc, f), path.join(scriptsDst, f));
                }
            }
        }

        // 5. Create placeholder logs
        await fs.writeFile(path.join(runDir, 'corb.log'), `Run initiated at ${timestamp}\nDry Run: ${options.dryRun}`);
        
        res.json({ success: true, runId: timestamp });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/run/:projectId/:runId
app.delete('/api/run/:projectId/:runId', async (req, res) => {
    const { projectId, runId } = req.params;
    try {
        const runPath = safePath(path.join(RUNS_DIR, projectId), runId);
        await fs.rm(runPath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Working Dir: ${WORKING_DIR}`);
});