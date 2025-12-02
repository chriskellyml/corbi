import { Environment, ENVIRONMENTS } from "../../data/mock-fs";
import { cn } from "../../lib/utils";

interface TopBarProps {
  currentEnv: Environment;
  onEnvChange: (env: Environment) => void;
}

const ENV_COLORS: Record<Environment, string> = {
  LOC: "bg-slate-700 border-slate-600",
  DEV: "bg-emerald-700 border-emerald-600",
  TEST: "bg-amber-600 border-amber-500",
  ACC: "bg-purple-700 border-purple-600",
  PROD: "bg-red-700 border-red-600",
};

export function TopBar({ currentEnv, onEnvChange }: TopBarProps) {
  return (
    <div className={cn(
      "w-full h-16 flex items-center justify-between px-6 text-white transition-colors duration-300 shadow-md",
      ENV_COLORS[currentEnv]
    )}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">CORB Runner</h1>
        <span className="text-xs opacity-70 bg-black/20 px-2 py-0.5 rounded">v1.0</span>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium opacity-90">Environment:</span>
        <div className="flex bg-black/20 p-1 rounded-lg">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              onClick={() => onEnvChange(env)}
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-md transition-all",
                currentEnv === env 
                  ? "bg-white text-black shadow-sm" 
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {env}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}