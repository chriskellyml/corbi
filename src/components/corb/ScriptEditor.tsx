import { Textarea } from "../../components/ui/textarea";

interface ScriptEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName: string;
}

export function ScriptEditor({ content, onChange, fileName }: ScriptEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border bg-muted/30 text-xs font-mono text-muted-foreground flex justify-between">
        <span>{fileName}</span>
        <span>XQuery / 1.0-ml</span>
      </div>
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-sm p-4 resize-none border-0 focus-visible:ring-0 rounded-none leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}