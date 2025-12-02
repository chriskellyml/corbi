import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";

interface PropertiesEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  title?: string;
  readOnly?: boolean;
}

interface Property {
  id: string;
  key: string;
  value: string;
  comment?: string;
  isNew?: boolean;
}

export function PropertiesEditor({ content, onChange, title, readOnly = false }: PropertiesEditorProps) {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    const lines = content.split('\n');
    const parsed: Property[] = [];
    
    let currentComment: string | undefined = undefined;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        currentComment = undefined;
        return;
      }

      if (trimmed.startsWith('#')) {
        currentComment = trimmed.substring(1).trim();
        return;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex !== -1) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        parsed.push({
          id: `prop-${index}-${Date.now()}`,
          key,
          value,
          comment: currentComment
        });
        currentComment = undefined;
      }
    });

    setProperties(parsed);
  }, [content]);

  const updateProperty = (id: string, field: 'key' | 'value', value: string) => {
    const updated = properties.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    );
    setProperties(updated);
    reconstructContent(updated);
  };

  const deleteProperty = (id: string) => {
    const updated = properties.filter(p => p.id !== id);
    setProperties(updated);
    reconstructContent(updated);
  };

  const addProperty = () => {
    const newProp: Property = {
      id: `new-${Date.now()}`,
      key: 'NEW_KEY',
      value: 'value',
      isNew: true
    };
    const updated = [...properties, newProp];
    setProperties(updated);
    reconstructContent(updated);
  };

  const reconstructContent = (props: Property[]) => {
    const lines = props.map(p => {
      let line = '';
      if (p.comment) line += `# ${p.comment}\n`;
      line += `${p.key}=${p.value}`;
      return line;
    });
    onChange(lines.join('\n'));
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {title && (
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <h3 className="font-semibold text-sm">{title}</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={addProperty} className="gap-1 h-8">
              <Plus className="h-3 w-3" /> Add Property
            </Button>
          )}
        </div>
      )}
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl">
          {properties.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No properties defined.
            </div>
          )}
          {properties.map((prop) => (
            <div key={prop.id} className="group relative bg-card border rounded-lg p-3 shadow-sm hover:border-primary/50 transition-colors">
              {prop.comment && (
                <div className="text-xs text-muted-foreground italic mb-2 ml-1">
                  # {prop.comment}
                </div>
              )}
              <div className="flex gap-3 items-center">
                <div className="flex-1 min-w-0">
                   <label className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5 block ml-1">Key</label>
                   <Input 
                    value={prop.key}
                    onChange={(e) => updateProperty(prop.id, 'key', e.target.value)}
                    className="h-8 font-mono text-sm bg-muted/30 border-transparent focus:bg-background focus:border-input"
                    readOnly={readOnly}
                   />
                </div>
                <div className="flex-[2] min-w-0">
                   <label className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5 block ml-1">Value</label>
                   <Input 
                    value={prop.value}
                    onChange={(e) => updateProperty(prop.id, 'value', e.target.value)}
                    className="h-8 font-mono text-sm"
                    readOnly={readOnly}
                   />
                </div>
                {!readOnly && (
                  <div className="pt-4">
                     <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteProperty(prop.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}