import Editor, { useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";
// We'll assume the parent handles the theme provider context or we just check class
// Ideally we use useTheme from next-themes if available, but checking document class works too
// for simple switching.

interface ScriptEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName: string;
  readOnly?: boolean;
}

export function ScriptEditor({ content, onChange, fileName, readOnly = false }: ScriptEditorProps) {
  const monaco = useMonaco();
  const [theme, setTheme] = useState<"vs-light" | "vs-dark">("vs-light");

  // Detect theme from document class (tailwind dark mode)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "vs-dark" : "vs-light");
    });
    
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    
    // Initial check
    if (document.documentElement.classList.contains("dark")) {
      setTheme("vs-dark");
    }

    return () => observer.disconnect();
  }, []);

  // Register XQuery Language
  useEffect(() => {
    if (monaco) {
      // Check if already registered
      const languages = monaco.languages.getLanguages();
      if (!languages.some((l) => l.id === "xquery")) {
        monaco.languages.register({ id: "xquery" });
        
        monaco.languages.setMonarchTokensProvider("xquery", {
          ignoreCase: false,
          tokenizer: {
            root: [
              // Comments
              [/\(:/, "comment", "@comment"],
              
              // Strings
              [/"([^"\\]|\\.)*$/, "string.invalid"], // non-terminated string
              [/"/, "string", "@string_double"],
              [/'/, "string", "@string_single"],

              // XML Tags (rough approximation)
              [/<\w+/, "tag"],
              [/<\/\w+>/, "tag"],
              [/>/, "tag"],
              
              // Numbers
              [/\d+/, "number"],
              
              // Keywords
              [/(xquery|version|module|import|declare|variable|function|let|return|for|where|order|by|ascending|descending|if|then|else|typeswitch|case|default|try|catch|map|json|xs|cts|xdmp|fn|math)/, "keyword"],
              
              // Built-in prefixes/functions (rough)
              [/(cts|xdmp|map|json|fn|math):[a-zA-Z0-9_\-]+/, "type.identifier"],
              
              // Variables
              [/\$[a-zA-Z0-9_\-]+/, "variable"],
            ],
            comment: [
              [/[^:)]+/, "comment"],
              [/:\)/, "comment", "@pop"],
              [/:/, "comment"]
            ],
            string_double: [
              [/[^\\"]+/, "string"],
              [/"/, "string", "@pop"]
            ],
            string_single: [
              [/[^\\']+/, "string"],
              [/'/, "string", "@pop"]
            ]
          }
        });

        // Basic configuration
        monaco.languages.setLanguageConfiguration("xquery", {
            comments: {
                blockComment: ["(:", ":)"],
            },
            brackets: [
                ["{", "}"],
                ["[", "]"],
                ["(", ")"],
            ],
            autoClosingPairs: [
                { open: "{", close: "}" },
                { open: "[", close: "]" },
                { open: "(", close: ")" },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
            ],
        });
      }
    }
  }, [monaco]);

  // Determine language
  const extension = fileName.split('.').pop()?.toLowerCase();
  let language = "plaintext";
  
  if (extension === 'js' || extension === 'sjs') language = "javascript";
  else if (extension === 'json') language = "json";
  else if (extension === 'xml') language = "xml";
  else if (extension === 'xqy' || extension === 'xq') language = "xquery";
  else if (extension === 'sql') language = "sql";

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="px-4 py-2 border-b border-border bg-muted/40 text-xs font-mono text-muted-foreground flex justify-between items-center h-10">
        <span className="font-semibold flex items-center gap-2">
           {fileName}
           {readOnly && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wide">READ ONLY</span>}
        </span>
        <span className="uppercase text-[10px] opacity-70 font-semibold tracking-wider">{language}</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <Editor
          height="100%"
          path={fileName} // Crucial for independent history and model caching per file
          language={language}
          value={content}
          onChange={(value) => onChange(value || "")}
          theme={theme}
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