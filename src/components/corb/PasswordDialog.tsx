import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envName: string;
  userName: string;
  onConfirm: (password: string, remember: boolean) => void;
}

export function PasswordDialog({ open, onOpenChange, envName, userName, onConfirm }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) {
      onConfirm(password, remember);
      setPassword(""); 
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Enter Password
          </DialogTitle>
          <DialogDescription>
            Authentication required for <strong>{userName}</strong> on <strong>{envName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              autoFocus
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
                id="remember" 
                checked={remember} 
                onCheckedChange={(c) => setRemember(!!c)} 
            />
            <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                Store in memory for this session
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}