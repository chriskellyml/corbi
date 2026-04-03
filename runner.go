package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// RunState tracks the status and process of an active run.
type RunState struct {
	Status  string
	Process *os.Process
}

func (a *App) runKey(runId string) string {
	dc := a.getDataContext()
	return dc.DataDir + "::" + runId
}

func (a *App) createRun(req RunRequest) (RunResult, error) {
	dc := a.getDataContext()

	timestamp := req.ExistingRunID
	if timestamp == "" {
		timestamp = time.Now().Format("20060102150405")
	}
	jobNameNoExt := strings.TrimSuffix(req.JobName, ".job")
	runKey := dc.DataDir + "::" + timestamp

	runDir := filepath.Join(dc.RunsDir, req.ProjectID, req.EnvName, timestamp)
	if err := os.MkdirAll(runDir, 0755); err != nil {
		return RunResult{}, fmt.Errorf("failed to create run directory: %w", err)
	}

	// Build environment variables
	envVarName := "PASSWD_" + strings.ReplaceAll(req.EnvName, "-", "_")
	gradleProjectPasswordVarName := "ORG_GRADLE_PROJECT_" + envVarName

	envMap := make(map[string]string)
	// Copy process env
	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}
	// Overlay .env from data dir
	for k, v := range readDotEnv(dc.DotEnvPath) {
		envMap[k] = v
	}

	password := req.Password
	if password == "" {
		password = req.Options.Password
	}

	if password != "" {
		envMap[envVarName] = password
		envMap[gradleProjectPasswordVarName] = password
	} else if val, ok := envMap[envVarName]; ok {
		envMap[gradleProjectPasswordVarName] = val
	}

	// Convert env map to slice
	envSlice := make([]string, 0, len(envMap))
	for k, v := range envMap {
		envSlice = append(envSlice, k+"="+v)
	}

	log.Printf("[%s] Starting run: project=%s, job=%s, env=%s, dryRun=%v",
		timestamp, req.ProjectID, req.JobName, req.EnvName, req.Options.DryRun)

	a.mu.Lock()
	a.activeRuns[runKey] = &RunState{Status: "running"}
	a.mu.Unlock()

	go func() {
		if req.Options.DryRun {
			// Dry run only
			a.executeDryRun(runKey, runDir, dc.DataDir, req.EnvName, req.ProjectID, jobNameNoExt, timestamp, req.Options.Limit, envSlice, false)
		} else if req.ExistingRunID != "" {
			// Wet run only on existing
			a.executeWetRun(runKey, runDir, dc.DataDir, req.EnvName, req.ProjectID, jobNameNoExt, timestamp, envSlice)
		} else {
			// Dry then wet
			ok := a.executeDryRun(runKey, runDir, dc.DataDir, req.EnvName, req.ProjectID, jobNameNoExt, timestamp, req.Options.Limit, envSlice, true)
			if ok {
				a.executeWetRun(runKey, runDir, dc.DataDir, req.EnvName, req.ProjectID, jobNameNoExt, timestamp, envSlice)
			}
		}
	}()

	return RunResult{Success: true, RunID: timestamp}, nil
}

func (a *App) executeDryRun(runKey, runDir, dataDir, envName, projectID, jobNameNoExt, timestamp string, limit *int, envSlice []string, chainWet bool) bool {
	args := []string{
		"runCorb",
		fmt.Sprintf("-Penv=%s", envName),
		fmt.Sprintf("-PcorbProject=%s", projectID),
		fmt.Sprintf("-Pjob=%s", jobNameNoExt),
		"-PdryRun=true",
		fmt.Sprintf("-PrunId=%s", timestamp),
	}
	if limit != nil && *limit > 0 {
		args = append(args, fmt.Sprintf("-Plimit=%d", *limit))
	}

	logPath := filepath.Join(runDir, "dry-output.log")
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("[%s] Failed to create dry log file: %v", timestamp, err)
		a.setRunStatus(runKey, "error", nil)
		return false
	}
	defer logFile.Close()

	cmdLine := "./gradlew " + strings.Join(args, " ")
	log.Printf("[%s] Spawning Dry Run: %s (cwd: %s)", timestamp, cmdLine, dataDir)
	fmt.Fprintf(logFile, "[%s] Executing: %s\n\n", timestamp, cmdLine)

	cmd := exec.Command("./gradlew", args...)
	cmd.Dir = dataDir
	cmd.Env = envSlice
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		errMsg := fmt.Sprintf("[%s] Failed to start dry run process: %s\n", timestamp, err)
		log.Print(errMsg)
		fmt.Fprint(logFile, errMsg)
		a.setRunStatus(runKey, "error", nil)
		return false
	}

	a.setRunStatus(runKey, "running", cmd.Process)

	err = cmd.Wait()
	exitCode := cmd.ProcessState.ExitCode()
	log.Printf("[%s] Dry run exited with code %d", timestamp, exitCode)

	if err != nil || exitCode != 0 {
		a.setRunStatus(runKey, "error", nil)
		return false
	}

	if !chainWet {
		a.setRunStatus(runKey, "completed", nil)
	}
	return true
}

func (a *App) executeWetRun(runKey, runDir, dataDir, envName, projectID, jobNameNoExt, timestamp string, envSlice []string) {
	args := []string{
		"runCorb",
		fmt.Sprintf("-Penv=%s", envName),
		fmt.Sprintf("-PcorbProject=%s", projectID),
		fmt.Sprintf("-Pjob=%s", jobNameNoExt),
		"-PdryRun=false",
		fmt.Sprintf("-PrunId=%s", timestamp),
	}

	logPath := filepath.Join(runDir, "wet-output.log")
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("[%s] Failed to create wet log file: %v", timestamp, err)
		a.setRunStatus(runKey, "error", nil)
		return
	}
	defer logFile.Close()

	cmdLine := "./gradlew " + strings.Join(args, " ")
	log.Printf("[%s] Spawning Wet Run: %s (cwd: %s)", timestamp, cmdLine, dataDir)
	fmt.Fprintf(logFile, "[%s] Executing: %s\n\n", timestamp, cmdLine)

	cmd := exec.Command("./gradlew", args...)
	cmd.Dir = dataDir
	cmd.Env = envSlice
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		errMsg := fmt.Sprintf("[%s] Failed to start wet run process: %s\n", timestamp, err)
		log.Print(errMsg)
		fmt.Fprint(logFile, errMsg)
		a.setRunStatus(runKey, "error", nil)
		return
	}

	a.setRunStatus(runKey, "running", cmd.Process)

	err = cmd.Wait()
	exitCode := cmd.ProcessState.ExitCode()
	log.Printf("[%s] Wet run exited with code %d", timestamp, exitCode)

	if err != nil || exitCode != 0 {
		a.setRunStatus(runKey, "error", nil)
	} else {
		a.setRunStatus(runKey, "completed", nil)
	}
}

func (a *App) setRunStatus(runKey, status string, process *os.Process) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.activeRuns[runKey] = &RunState{Status: status, Process: process}
}

func (a *App) stopRun(projectId, envName, runId string) error {
	runKey := a.runKey(runId)
	a.mu.Lock()
	defer a.mu.Unlock()

	rs, ok := a.activeRuns[runKey]
	if ok && rs.Status == "running" && rs.Process != nil {
		log.Printf("Stopping run %s (PID %d)", runId, rs.Process.Pid)
		_ = rs.Process.Signal(os.Interrupt)
	}
	a.activeRuns[runKey] = &RunState{Status: "error"}
	return nil
}

func (a *App) getRunStatus(projectId, envName, runId string) RunStatusResult {
	runKey := a.runKey(runId)
	a.mu.RLock()
	rs, ok := a.activeRuns[runKey]
	a.mu.RUnlock()

	if !ok {
		dc := a.getDataContext()
		runPath := filepath.Join(dc.RunsDir, projectId, envName, runId)
		if _, err := os.Stat(runPath); err == nil {
			return RunStatusResult{Status: "completed"}
		}
		return RunStatusResult{Status: "unknown"}
	}
	return RunStatusResult{Status: rs.Status}
}
