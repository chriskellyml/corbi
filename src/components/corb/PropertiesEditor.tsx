import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RotateCcw, CornerDownRight, AlertCircle } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

interface PropertiesEditorProps {
  baseContent: string;
  overrideContent?: string | null; // If present, we are in "Override Mode"
  onBaseChange: (newContent: string) => void;
  onOverrideChange?: (key: string, value: string | undefined) => void; // undefined value = delete key
  title?: string;
  readOnly?: boolean;
}

interface PropertyItem {
  key: string;
  value: string;
  source: 'base' | 'override' | 'new_base';
  baseValue?: string;
  originalValue?: string; // For dirty checking base
}

const parseProperties = (content: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!content) return map;
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex !== -1) {
            map.set(trimmed.substring(0, eqIndex).trim(), trimmed.substring(eqIndex + 1).trim());
        }
    });
    return map;
};

export function PropertiesEditor({ 
  baseContent, 
  overrideContent, 
  onBaseChange, 
  onOverrideChange, 
  title, 
  readOnly = false 
}: PropertiesEditorProps) {
  
  // 1. Parse Data
  const baseMap = useMemo(() => parseProperties(baseContent), [baseContent]);
  const overrideMap = useMemo(() => overrideContent ? parseProperties(overrideContent) : null, [overrideContent]);
  
  // 2. Compute Display List
  const displayItems = useMemo(() => {
    const items: PropertyItem[] = [];
    const processedKeys = new Set<string>();

    // If in override mode, prioritize displaying global keys, then extra override keys
    // If in normal mode, just display base keys
    
    // A. Add Base Keys
    baseMap.forEach((val, key) => {
        processedKeys.add(key);
        const isOverridden = overrideMap?.has(key);
        
        items.push({
            key,
            value: isOverridden ? overrideMap!.get(key)! : val,
            source: isOverridden ? 'override' : 'base',
            baseValue: val
        });
    });

    // B. Add Extra Override Keys (only if in override mode)
    if (overrideMap) {
        overrideMap.forEach((val, key) => {
            if (!processedKeys.has(key)) {
                // These are keys present in the job but NOT in the env
                // Usually these are job-specific configs like URIS-MODULE, etc.
                // We might want to filter out standard structural keys if we want this panel pure
                // But for now, let's show them as overrides
                 items.push({
                    key,
                    value: val,
                    source: 'override',
                    baseValue: undefined
                });
            }
        });
    }

    return items.sort((a, b) => a.key.localeCompare(b.key));
  }, [baseMap, overrideMap]);

  const handleValueChange = (item: PropertyItem, newValue: string) => {
      if (overrideMap) {
          // Override Mode: Update the override (Job)
          onOverrideChange?.(item.key, newValue);
      } else {
          // Base Mode: Update the base content (Env)
          // We need to reconstruct the file string to preserve comments if possible, 
          // or just simple rebuild if we don't care about comments in env props editor (the old one rebuilt it).
          // The old editor logic reconstructed it. Let's reuse a simple reconstruct for now or improve.
          // To keep it simple and robust:
          updateBaseContent(item.key, newValue);
      }
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
      if (overrideMap) return; // Can't rename keys in override mode easily without confusing logic
      
      // Base Mode Rename
      // 1. Get value
      const val = baseMap.get(oldKey) || "";
      // 2. Remove old, Add new
      let newContent = baseContent;
      // Simple regex replace for the line? A bit risky. 
      // Let's use the reconstruction approach used in the previous version for safety
      const lines = baseContent.split('\n');
      const newLines = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith(oldKey + '=')) {
              return `${newKey}=${val}`;
          }
          return line;
      });
      onBaseChange(newLines.join('\n'));
  };

  const handleDelete = (key: string) => {
      if (overrideMap) {
          // In override mode, deleting means "Remove Override" (revert to base)
          // OR if it's a unique override, delete it entirely.
          onOverrideChange?.(key, undefined);
      } else {
          // Base Mode: Delete line
          const lines = baseContent.split('\n');
          const newLines = lines.filter(line => {
             const trimmed = line.trim();
             if (trimmed.startsWith('#')) return true;
             return !trimmed.startsWith(key + '=');
          });
          onBaseChange(newLines.join('\n'));
      }
  };

  const updateBaseContent = (key: string, value: string) => {
      const lines = baseContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('#') && trimmed.split('=')[0].trim() === key) {
              found = true;
              return `${key}=${value}`;
          }
          return line;
      });
      if (!found) newLines.push(`${key}=${value}`);
      onBaseChange(newLines.join('\n'));
  };

  const handleAddProperty = () => {
      if (overrideMap) {
          // Adding in override mode = adding a new key to the Job
          const key = "NEW_VAR";
          onOverrideChange?.(key, "value");
      } else {
          updateBaseContent("NEW_VAR", "value");
      }
  };

  const isOverrideMode = !!overrideMap;

  return (
    <div className="flex flex-col h-full bg-background">
      {title && (
        <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-muted/20 shrink-0">
          <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{title}</h3>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={handleAddProperty} className="h-6 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          )}
        </div>
      )}
      
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {displayItems.map((item) => {
            // Filter out internal structural keys from display if desired, 
            // but user might want to see them. Let's hide URIS-MODULE/PROCESS-MODULE/THREAD-COUNT 
            // from the "Env" view if they are just standard job config, 
            // BUT the prompt says "override the current selected environment values".
            // So we mostly care about keys that EXIST in the base.
            
            // Visual State
            const isOverridden = item.source === 'override' && item.baseValue !== undefined;
            const isNewInJob = item.source === 'override' && item.baseValue === undefined;
            
            return (
              <div key={item.key} className={cn(
                  "group relative border rounded-md p-2 transition-all text-sm",
                  isOverridden ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : 
                  isNewInJob ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" :
                  "bg-card hover:border-primary/30"
              )}>
                <div className="flex gap-2 items-center">
                  {/* Status Indicator */}
                  <div className="w-1 shrink-0 self-stretch rounded-full my-1 bg-transparent group-hover:bg-muted" />
                  
                  {/* Key */}
                  <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-1.5 mb-1">
                        <Input 
                            value={item.key}
                            onChange={(e) => handleKeyChange(item.key, e.target.value)}
                            className="h-6 text-xs font-mono font-bold bg-transparent border-transparent px-0 focus-visible:ring-0 focus-visible:bg-muted/30 w-full"
                            readOnly={readOnly || isOverrideMode}
                            title={item.key}
                        />
                     </div>
                  </div>

                  {/* Value */}
                  <div className="flex-[2] min-w-0">
                     <div className="relative">
                         <Input 
                            value={item.value}
                            onChange={(e) => handleValueChange(item, e.target.value)}
                            className={cn(
                                "h-7 text-xs font-mono",
                                isOverridden && "text-amber-700 font-medium border-amber-300 dark:text-amber-400 dark:border-amber-800",
                                isNewInJob && "text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-800"
                            )}
                            readOnly={readOnly}
                         />
                         {isOverridden && (
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <AlertCircle className="h-3 w-3 text-amber-500 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="text-xs">
                                            <p>Overrides Global Value:</p>
                                            <code className="bg-black/10 rounded px-1">{item.baseValue}</code>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                             </div>
                         )}
                     </div>
                  </div>

                  {/* Actions */}
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                       {isOverrideMode ? (
                           // Override Mode Actions
                           <>
                                {(isOverridden || isNewInJob) ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDelete(item.key)}
                                        title={isOverridden ? "Revert to Global Value" : "Remove from Job"}
                                    >
                                        {isOverridden ? <RotateCcw className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                ) : (
                                    // Not overridden yet (Inherited) -> Button to start editing is implicit by typing, 
                                    // but we can add a visual cue if needed.
                                    <div className="w-7" /> 
                                )}
                           </>
                       ) : (
                           // Base Mode Actions
                           <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                            onClick={() => handleDelete(item.key)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                       )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}