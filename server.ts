import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const app = express();
const PORT = 3001;
const WORKING_DIR = '/Users/chkelly/Workspace/projects/lvbb/kt/1-beheer-scripts/corb-new/';

app.use(cors());
app.use(bodyParser.json());

// Ensure working directory exists (mock it if not, for safety/testing, but log warning)
if (!existsSync(WORKING_DIR)) {
  console.warn(`WARNING: Working directory ${WORKING_DIR} does not exist. Creating it for testing purposes.`);
  try {
      mkdirSync(WORKING_DIR, { recursive: true });
      mkdirSync(path.join(WORKING_DIR, 'projects'));
      mkdirSync(path.join(WORKING_DIR, 'env'));
      mkdirSync(path.join(WORKING_DIR, 'runs'));
  } catch (e) {
      console.error("Failed to create working directory:", e);
  }
}

const PROJECTS_DIR = path.join(WORKING_DIR, 'projects');
const ENV_DIR = path.join(WORKING_DIR, 'env');
const RUNS_DIR = path.join(WORKING_DIR, 'runs');

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

// POST /api/run
app.post('/api/run', async (req, res) => {
    const { projectId, jobName, envName, options } = req.body;
    
    try {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const runDir = path.join(RUNS_DIR, projectId, timestamp);
        
        await fs.mkdir(runDir, { recursive: true });

        // 1. Read & Copy Job File
        const jobContent = await fs.readFile(path.join(PROJECTS_DIR, projectId, jobName), 'utf-8');
        await fs.writeFile(path.join(runDir, jobName), jobContent);

        // 2. Read & Copy Env File
        const envContent = await fs.readFile(path.join(ENV_DIR, `${envName}.props`), 'utf-8');
        await fs.writeFile(path.join(runDir, `${envName}.props`), envContent);

        // 3. Create job.options (Merged)
        let optionsContent = `# Generated at ${timestamp}\n`;
        
        // A. Environment
        optionsContent += `\n# --- Environment: ${envName} ---\n`;
        optionsContent += envContent + '\n';

        // B. Job Overrides
        optionsContent += `\n# --- Job: ${jobName} ---\n`;
        optionsContent += jobContent + '\n';

        // C. Runtime Settings
        optionsContent += `\n# --- Runtime Settings ---\n`;
        if (options.limit) {
            optionsContent += `URIS-MODULE.LIMIT=${options.limit}\n`;
            optionsContent += `PROCESS-MODULE.LIMIT=${options.limit}\n`;
        }
        
        const dryRunVal = String(options.dryRun);
        optionsContent += `URIS-MODULE.DRY-RUN=${dryRunVal}\n`;
        optionsContent += `PROCESS-MODULE.DRY-RUN=${dryRunVal}\n`;
        
        // Standard CORB property is usually THREAD-COUNT, but sticking to provided convention if any. 
        // User's previous code used THREAD_COUNT. Standard CORB is 'THREAD-COUNT'. 
        // I will use 'THREAD-COUNT' to be safe for CORB, or what was requested.
        // User didn't explicitly specify key for threads in the last prompt list, but earlier code had it.
        // I will write THREAD-COUNT as it is standard.
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
  console.log(`Watching: ${WORKING_DIR}`);
});
