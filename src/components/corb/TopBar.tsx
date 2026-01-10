import { cn } from "../../lib/utils";
import { Check, X, ChevronLeft, ChevronRight } from "lucide-react";

interface TopBarProps {
  currentEnv: string;
  environments: string[];
  onEnvChange: (env: string) => void;
  onMoveEnv: (env: string, direction: 'left' | 'right') => void;
  // Optional: Permissions for a selected job
  jobPermissions?: Record<string, boolean>;
}

// Color progression from "Safe/Least Worrisome" to "Danger/Most Worrisome"
const ENV_COLOR_SCALE = [
  "bg-blue-600 border-blue-500",      // Safe / Dev
  "bg-cyan-600 border-cyan-500",      // Info / Test
  "bg-teal-600 border-teal-500",      // Check / QA
  "bg-emerald-600 border-emerald-500", // Success / Stable
  "bg-yellow-600 border-yellow-500",  // Warn / Acc
  "bg-orange-600 border-orange-500",  // Risk / Pre-prod
  "bg-red-600 border-red-500",        // Danger / Prod
  "bg-rose-700 border-rose-600",      // Critical
  "bg-pink-700 border-pink-600",      // Panic
  "bg-purple-700 border-purple-600",  // ?
];

const DEFAULT_COLOR = "bg-slate-700 border-slate-600";

export function TopBar({ currentEnv, environments, onEnvChange, onMoveEnv, jobPermissions }: TopBarProps) {
  
  // Sort environments alpha-numerically (they might already be, but good to ensure display consistency)
  // We assume the parent passes them in the desired order (from file system names).
  
  const getEnvColor = (env: string, index: number, total: number) => {
      if (total <= 1) return ENV_COLOR_SCALE[0];
      
      // Calculate position in 0..1 range
      const ratio = index / (total - 1);
      
      // Map to scale length
      const scaleIndex = Math.round(ratio * (ENV_COLOR_SCALE.length - 1));
      return ENV_COLOR_SCALE[scaleIndex] || DEFAULT_COLOR;
  };

  const currentIndex = environments.indexOf(currentEnv);
  const currentColor = currentIndex !== -1 ? getEnvColor(currentEnv, currentIndex, environments.length) : DEFAULT_COLOR;

  return (
    <div className={cn(
      "w-full h-16 flex items-center justify-between px-6 text-white transition-colors duration-500 shadow-md",
      currentColor
    )}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">CORB Runner</h1>
        <span className="text-xs opacity-70 bg-black/20 px-2 py-0.5 rounded">v1.1</span>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium opacity-90">Environment:</span>
        <div className="flex bg-black/20 p-1.5 rounded-xl gap-2">
          {environments.map((env, idx) => {
             const isEnabled = jobPermissions ? jobPermissions[env] : undefined;
             const envColor = getEnvColor(env, idx, environments.length);
             const isSelected = currentEnv === env;
             const cleanName = env.replace(/^\d+-/, '');

             return (
                <div key={env} className="group relative flex items-center">
                    {/* Move Left Button (Hidden by default, visible on group hover) */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveEnv(env, 'left'); }}
                        className={cn(
                            "absolute left-0 -ml-1 z-20 bg-black/40 hover:bg-black/60 text-white h-full px-0.5 rounded-l-md opacity-0 group-hover:opacity-100 transition-opacity",
                            idx === 0 && "hidden" // Can't move first item left
                        )}
                        title="Move Left"
                    >
                        <ChevronLeft className="h-3 w-3" />
                    </button>

                    <button
                        onClick={() => onEnvChange(env)}
                        className={cn(
                            "relative px-5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 min-w-[70px] justify-center",
                            isSelected 
                                ? "bg-white text-black shadow-sm z-10 scale-105" 
                                : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        {cleanName}
                        {isEnabled !== undefined && (
                            <div className={cn(
                                "h-2 w-2 rounded-full",
                                isEnabled ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]" : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                            )} />
                        )}
                    </button>

                    {/* Move Right Button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveEnv(env, 'right'); }}
                        className={cn(
                            "absolute right-0 -mr-1 z-20 bg-black/40 hover:bg-black/60 text-white h-full px-0.5 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity",
                            idx === environments.length - 1 && "hidden" // Can't move last item right
                        )}
                        title="Move Right"
                    >
                        <ChevronRight className="h-3 w-3" />
                    </button>
                </div>
             );
          })}
        </div>
      </div>
    </div>
  );
}