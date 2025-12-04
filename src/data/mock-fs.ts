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
  options: string; // content of job.options
  export: string;  // content of export.csv
  logs: RunFile[];
  scripts: RunFile[];
}

export interface ProjectRun {
  id: string; // timestamp
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

export const ENVIRONMENTS = ['LOC', 'DEV', 'TEST', 'ACC', 'PROD'] as const;
export type Environment = typeof ENVIRONMENTS[number];

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'cleanup-database',
    name: 'cleanup-database',
    jobs: [
      { 
        name: 'run.job', 
        type: 'job', 
        content: `# Database Cleanup Job
URIS_MODULE=scripts/collect.xqy
PROCESS_MODULE=scripts/process.xqy
THREAD_COUNT=4
BATCH_SIZE=100
# Module root
MODULES_DATABASE=Modules` 
      }
    ],
    scripts: [
      { 
        name: 'collect.xqy', 
        type: 'script', 
        content: `xquery version "1.0-ml";

let $uris := cts:uris((), (), cts:collection-query("to-be-deleted"))
return (count($uris), $uris)` 
      },
      { 
        name: 'process.xqy', 
        type: 'script', 
        content: `xquery version "1.0-ml";

declare variable $URI as xs:string external;

xdmp:document-delete($URI)` 
      }
    ],
    runs: [
      {
        id: '20240320100000',
        timestamp: '20240320100000',
        isDryRun: true,
        environments: [
          {
            name: 'DEV',
            options: `URIS_MODULE=scripts/collect.xqy\nPROCESS_MODULE=scripts/process.xqy\nTHREAD_COUNT=4\nBATCH_SIZE=100\nMODULES_DATABASE=Modules\nHOST=dev-server\nPORT=8010\nUSER=admin`,
            export: `uri,status\n/doc/1.xml,deleted\n/doc/2.xml,deleted`,
            logs: [
              { name: 'corb.log', content: `INFO: Starting CORB run\nINFO: Found 2 URIs\nINFO: Completed` },
              { name: 'marklogic.log', content: `2024-03-20 10:00:01 Info: Request handling...` }
            ],
            scripts: [
              { name: 'collect.xqy', content: `(: Snapshot of collect.xqy at runtime :)` },
              { name: 'process.xqy', content: `(: Snapshot of process.xqy at runtime :)` }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'fix-xml-headers',
    name: 'fix-xml-headers',
    jobs: [
      { 
        name: '1-preprocess.job', 
        type: 'job', 
        content: `URIS_MODULE=scripts/collect.xqy
PROCESS_MODULE=scripts/pre-process.xqy
EXPORT-FILE-DIR=/tmp/export` 
      },
      { 
        name: '2-process.job', 
        type: 'job', 
        content: `URIS_MODULE=scripts/collect-final.xqy
PROCESS_MODULE=scripts/process.xqy
THREAD_COUNT=8` 
      }
    ],
    scripts: [
      { name: 'collect.xqy', type: 'script', content: 'xquery version "1.0-ml";\n\ncts:uris(......)' },
      { name: 'pre-process.xqy', type: 'script', content: 'xquery version "1.0-ml";\n\n(: Pre-processing logic :)' },
      { name: 'process.xqy', type: 'script', content: 'xquery version "1.0-ml";\n\n(: Main processing logic :)' },
      { name: 'collect-final.xqy', type: 'script', content: 'xquery version "1.0-ml";\n\n(: Final collection :)' }
    ],
    runs: []
  }
];

export const MOCK_ENV_FILES: Record<Environment, string> = {
  'LOC': `# Local Environment
HOST=localhost
PORT=8000
USER=admin
PASS=admin
content-db=Documents`,
  'DEV': `# Dev Environment
HOST=dev-server
PORT=8010
USER=admin
PASS=admin
content-db=Documents-DEV`,
  'TEST': `HOST=test-server
PORT=8020
USER=admin
PASS=admin`,
  'ACC': `HOST=acc-server
PORT=8030
USER=admin
PASS=admin`,
  'PROD': `HOST=prod-server
PORT=8040
USER=admin
PASS=admin`,
};