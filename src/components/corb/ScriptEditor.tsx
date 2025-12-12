import Editor, { useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

interface ScriptEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName: string;
  readOnly?: boolean;
}

export function ScriptEditor({ content, onChange, fileName, readOnly = false }: ScriptEditorProps) {
  // Simple extension detection
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  let language = "plaintext";
  if (extension === 'js' || extension === 'sjs') language = "javascript";
  if (extension === 'json') language = "json";
  if (extension === 'xml') language = "xml";
  // XQuery is not standard in Monaco Basic, mapping to XML provides decent tag highlighting
  // or we could use 'sql' for keyword highlighting, but XML is usually safer for MarkLogic XQuery
  if (extension === 'xqy' || extension === 'xq') language = "xml"; 

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="px-4 py-2 border-b border-border bg-muted/40 text-xs font-mono text-muted-foreground flex justify-between items-center h-10">
        <span className="font-semibold flex items-center gap-2">
           {fileName}
           {readOnly && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wide">READ ONLY</span>}
        </span>
        <span className="uppercase text-[10px] opacity-70 font-semibold tracking-wider">{language === 'xml' && (extension === 'xqy' || extension === 'xq') ? 'XQUERY (XML mode)' : language}</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          language={language}
          value={content}
          onChange={(value) => onChange(value || "")}
          theme="vs-light" // Matches the default Shadcn light theme
          options={{
            readOnly: readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Monaco', monospace",
            renderLineHighlight: "all",
          }}
          className="border-none outline-none"
        />
      </div>
    </div>
  );
}