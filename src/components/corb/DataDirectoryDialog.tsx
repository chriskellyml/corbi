import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

interface DataDirectoryDialogProps {
  open: boolean;
  value: string;
  currentValue: string;
  isSaving: boolean;
  isBrowsing: boolean;
  /** When true, the dialog cannot be dismissed (no Cancel, no close on overlay/escape). */
  required?: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onBrowse: () => void;
  onConfirm: () => void;
}

export function DataDirectoryDialog({
  open,
  value,
  currentValue,
  isSaving,
  isBrowsing,
  required = false,
  onOpenChange,
  onValueChange,
  onBrowse,
  onConfirm,
}: DataDirectoryDialogProps) {
  const isBusy = isSaving || isBrowsing;

  const handleOpenChange = (nextOpen: boolean) => {
    // Prevent dismissing when dialog is required
    if (required && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onPointerDownOutside={required ? (e) => e.preventDefault() : undefined} onEscapeKeyDown={required ? (e) => e.preventDefault() : undefined}>
        <DialogHeader>
          <DialogTitle>Select Data Directory</DialogTitle>
          <DialogDescription>
            Choose the CoRBi data repository used for projects, environment files, and run history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!required && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</div>
              <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                {currentValue || "Not set"}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Path</div>
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder="/path/to/corbi-data"
                autoFocus
                disabled={isBusy}
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" onClick={onBrowse} disabled={isBusy} className="shrink-0">
                {isBrowsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The last successful path is stored in local storage and restored on the next visit.
            </p>
          </div>
        </div>

        <DialogFooter>
          {!required && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={onConfirm} disabled={isBusy || !value.trim()}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Use Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
