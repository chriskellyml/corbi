export type FileType = 'job' | 'script';

export interface FileEntry {
  name: string;
  type: FileType;
  content: string;
}

export interface Project {
  id: string;
  name: string;
  jobs: FileEntry[];
  scripts: FileEntry[];
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
    ]
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