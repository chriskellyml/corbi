import { cn } from "../../lib/utils";
import { Check, X } from "lucide-react";

interface TopBarProps {
  currentEnv: string;
  environments: string[];
  onEnvChange: (env: string) => void;
  // Optional: Permissions for a selected job
  jobPermissions?: Record<string, boolean>;
}

const ENV_COLORS: Record<string, string> = {
  LOC: "bg-slate-700 border-slate-600",
  DEV: "bg-emerald-700 border-emerald-600",
  TEST: "bg-amber-600 border-amber-500",
  ACC: "bg-purple-700 border-purple-600",
  PROD: "bg-red-700 border-red-600",
};

const DEFAULT_COLOR = "bg-slate-700 border-slate-600";

export function TopBar({ currentEnv, environments, onEnvChange, jobPermissions }: TopBarProps) {
  return (
    <div className={cn(
      "w-full h-16 flex items-center justify-between px-6 text-white transition-colors duration-300 shadow-md",
      ENV_COLORS[currentEnv] || DEFAULT_COLOR
    )}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">CORB Runner</h1>
        <span className="text-xs opacity-70 bg-black/20 px-2 py-0.5 rounded">v1.0</span>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium opacity-90">Environment:</span>
        <div className="flex bg-black/20 p-1 rounded-lg gap-1">
          {environments.map((env) => {
             const isEnabled = jobPermissions ? jobPermissions[env] : undefined;
             
             return (
                <button
                key={env}
                onClick={() => onEnvChange(env)}
                className={cn(
                    "relative px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                    currentEnv === env 
                    ? "bg-white text-black shadow-sm" 
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                    // Override styles if permissions are provided and we aren't the selected one?
                    // The prompt says "white on RED if not allowed and white on GREEN if good"
                    // If currentEnv matches, it's white bg, black text usually. 
                    // Let's adapt:
                    // If permissions exist, use red/green backgrounds for ALL pills, unless selected?
                    // Let's keep the selection logic but add the indicator.
                )}
                >
                {env}
                {isEnabled !== undefined && (
                    <div className={cn(
                        "h-2 w-2 rounded-full",
                        isEnabled ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]" : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                    )} />
                )}
                </button>
             );
          })}
        </div>
      </div>
    </div>
  );
}