import { useState, useRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ImperativePanelHandle } from "react-resizable-panels";
import { ReportViewer } from "./ReportViewer";
import { LogViewer } from "./LogViewer";
import { RunningFooter } from "./RunningFooter";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunOptions } from "./RunFooter";

interface RunningViewProps {
    liveReport: string;
    liveLog: string;
    activeRunType: 'dry' | 'wet';
    activeRunStatus: 'running' | 'completed' | 'error';
    
    // Actions
    onReview: () => void;
    onStop: () => void;
    onDiscard: (keepData: boolean) => void;
    onRunAgain: (options: RunOptions) => void;
    onExecuteWet: (options: RunOptions) => void;
}

export function RunningView({ 
    liveReport, 
    liveLog, 
    activeRunType, 
    activeRunStatus, 
    onReview, 
    onStop,
    onDiscard,
    onRunAgain,
    onExecuteWet
}: RunningViewProps) {
    const topRef = useRef<ImperativePanelHandle>(null);
    const bottomRef = useRef<ImperativePanelHandle>(null);
    const [layoutState, setLayoutState] = useState<'even' | 'top-max' | 'bottom-max'>('even');

    const toggleTop = () => {
        if (layoutState === 'top-max') {
            topRef.current?.resize(50);
            bottomRef.current?.resize(50);
            setLayoutState('even');
        } else {
            topRef.current?.resize(100);
            bottomRef.current?.resize(0);
            setLayoutState('top-max');
        }
    };

    const toggleBottom = () => {
        if (layoutState === 'bottom-max') {
            topRef.current?.resize(50);
            bottomRef.current?.resize(50);
            setLayoutState('even');
        } else {
            topRef.current?.resize(0);
            bottomRef.current?.resize(100);
            setLayoutState('bottom-max');
        }
    };

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-bottom-4">
             <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
                <ResizablePanel 
                    ref={topRef} 
                    defaultSize={50} 
                    minSize={0}
                    collapsible={true}
                    onCollapse={() => setLayoutState('bottom-max')}
                    onExpand={() => { 
                        if (layoutState === 'bottom-max') setLayoutState('even'); 
                    }}
                    className={cn(layoutState === 'bottom-max' && "hidden")}
                >
                    <ReportViewer 
                        content={liveReport} 
                        fileName={activeRunType === 'wet' ? 'wet-report.txt' : 'dry-report.txt'} 
                        extraActions={
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={toggleTop} 
                                className="h-6 w-6" 
                                title={layoutState === 'top-max' ? "Restore Split View" : "Maximize Result View"}
                            >
                                {layoutState === 'top-max' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                        }
                    />
                </ResizablePanel>
                
                <ResizableHandle withHandle />
                
                <ResizablePanel 
                    ref={bottomRef} 
                    defaultSize={50} 
                    minSize={0}
                    collapsible={true}
                    onCollapse={() => setLayoutState('top-max')}
                    onExpand={() => { 
                        if (layoutState === 'top-max') setLayoutState('even'); 
                    }}
                    className={cn(layoutState === 'top-max' && "hidden")}
                >
                     <LogViewer 
                        content={liveLog} 
                        title={activeRunType === 'wet' ? 'wet-output.log' : 'dry-output.log'}
                        extraActions={
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={toggleBottom} 
                                className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                title={layoutState === 'bottom-max' ? "Restore Split View" : "Maximize Log View"}
                             >
                                {layoutState === 'bottom-max' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                        }
                    />
                </ResizablePanel>
             </ResizablePanelGroup>
             
             <RunningFooter 
                status={activeRunStatus} 
                runType={activeRunType}
                onReview={onReview}
                onStop={onStop}
                onDiscard={onDiscard}
                onRunAgain={onRunAgain}
                onExecuteWet={onExecuteWet}
             />
        </div>
    );
}