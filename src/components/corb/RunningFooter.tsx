import { Button } from "../../components/ui/button";
import { CheckCircle, Loader2, Square } from "lucide-react";
import { cn } from "../../lib/utils";

interface RunningFooterProps {
    status: 'running' | 'completed' | 'error';
    onReview: () => void;
    onStop?: () => void;
}

export function RunningFooter({ status, onReview, onStop }: RunningFooterProps) {
    return (
        <div className="border-t border-border bg-background p-4 flex items-center justify-between shadow-up">
            <div className="flex items-center gap-3">
                {status === 'running' && (
                    <div className="flex items-center gap-2 text-blue-600 font-medium animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                    </div>
                )}
                {status === 'completed' && (
                    <div className="flex items-center gap-2 text-green-600 font-medium">
                        <CheckCircle className="h-4 w-4" />
                        Run Completed
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex items-center gap-2 text-destructive font-medium">
                         Error / Stopped
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {status === 'running' && onStop && (
                    <Button 
                        onClick={onStop}
                        variant="destructive"
                        className="gap-2 font-semibold shadow-sm min-w-[100px]"
                    >
                        <Square className="h-4 w-4 fill-current" />
                        Stop
                    </Button>
                )}
                
                {(status === 'completed' || status === 'error') && (
                    <Button 
                        onClick={onReview}
                        className={cn(
                            "gap-2 font-semibold shadow-sm text-white min-w-[140px]",
                            status === 'completed' ? "bg-green-600 hover:bg-green-700" : "bg-zinc-700 hover:bg-zinc-800"
                        )}
                    >
                        Review Complete
                    </Button>
                )}
            </div>
        </div>
    );
}