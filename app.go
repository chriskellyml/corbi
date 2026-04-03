package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

// App struct holds application state and is bound to the Wails frontend.
type App struct {
	ctx           context.Context
	activeDataDir string
	mu            sync.RWMutex
	activeRuns    map[string]*RunState
}

// DataContext holds resolved paths for a given data directory.
type DataContext struct {
	DataDir         string
	DotEnvPath      string
	ProjectsDir     string
	EnvDir          string
	RunsDir         string
	SupportDir      string
	UrisDir         string
	ProcessDir      string
	UploadsDir      string
	PermissionsFile string
	EnvOrderFile    string
}

// --- Types mirroring the TypeScript frontend types ---

type FileEntry struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Content string `json:"content"`
}

type RunFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type RunEnvironment struct {
	Name    string    `json:"name"`
	Options string    `json:"options"`
	Logs    []RunFile `json:"logs"`
	Scripts []RunFile `json:"scripts"`
	Reports []RunFile `json:"reports"`
}

type ProjectRun struct {
	ID           string           `json:"id"`
	Timestamp    string           `json:"timestamp"`
	IsDryRun     bool             `json:"isDryRun"`
	Environments []RunEnvironment `json:"environments"`
}

type Project struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Jobs    []FileEntry  `json:"jobs"`
	Scripts []FileEntry  `json:"scripts"`
	Runs    []ProjectRun `json:"runs"`
}

type EnvData struct {
	Content     string `json:"content"`
	HasPassword bool   `json:"hasPassword"`
}

type EnvResponse struct {
	Data  map[string]EnvData `json:"data"`
	Order []string           `json:"order"`
}

type DataDirectoryConfig struct {
	DataDir string `json:"dataDir"`
}

type PermissionMap map[string]map[string]map[string]bool

type RunOptions struct {
	Limit               *int   `json:"limit"`
	DryRun              bool   `json:"dryRun"`
	ThreadCount         int    `json:"threadCount"`
	UrisMode            string `json:"urisMode"`
	UrisFile            string `json:"urisFile"`
	CustomUrisModule    string `json:"customUrisModule"`
	ProcessMode         string `json:"processMode"`
	CustomProcessModule string `json:"customProcessModule"`
	Password            string `json:"password"`
}

type SaveFileRequest struct {
	ProjectID string `json:"projectId"`
	FileName  string `json:"fileName"`
	Content   string `json:"content"`
	Type      string `json:"type"`
}

type CopyFileRequest struct {
	ProjectID  string `json:"projectId"`
	SourceName string `json:"sourceName"`
	TargetName string `json:"targetName"`
	Type       string `json:"type"`
}

type RenameFileRequest struct {
	ProjectID string `json:"projectId"`
	OldName   string `json:"oldName"`
	NewName   string `json:"newName"`
	Type      string `json:"type"`
}

type DeleteFileRequest struct {
	ProjectID string `json:"projectId"`
	FileName  string `json:"fileName"`
	Type      string `json:"type"`
}

type RunRequest struct {
	ProjectID     string     `json:"projectId"`
	JobName       string     `json:"jobName"`
	EnvName       string     `json:"envName"`
	Options       RunOptions `json:"options"`
	Password      string     `json:"password"`
	ExistingRunID string     `json:"existingRunId"`
}

type RunResult struct {
	Success bool   `json:"success"`
	RunID   string `json:"runId"`
	Error   string `json:"error,omitempty"`
}

type RunStatusResult struct {
	Status string `json:"status"`
}

// NewApp creates a new App instance.
func NewApp() *App {
	dataDir := os.Getenv("CORBI_DATA_DIR")
	if dataDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			dataDir = "."
		} else {
			dataDir = cwd
		}
	}
	resolved, err := filepath.Abs(dataDir)
	if err != nil {
		resolved = dataDir
	}
	return &App{
		activeDataDir: resolved,
		activeRuns:    make(map[string]*RunState),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dc := a.getDataContext()
	ensureDataContextDirs(dc)
	log.Printf("CoRBi started. Data directory: %s", dc.DataDir)
}

func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for key, rs := range a.activeRuns {
		if rs.Status == "running" && rs.Process != nil {
			log.Printf("Shutting down: killing run %s", key)
			_ = rs.Process.Kill()
		}
	}
}

func createDataContext(dataDir string) DataContext {
	resolved, _ := filepath.Abs(dataDir)
	supportDir := filepath.Join(resolved, "src", "support")
	return DataContext{
		DataDir:         resolved,
		DotEnvPath:      filepath.Join(resolved, ".env"),
		ProjectsDir:     filepath.Join(resolved, "src", "projects"),
		EnvDir:          filepath.Join(resolved, "env"),
		RunsDir:         filepath.Join(resolved, "runs"),
		SupportDir:      supportDir,
		UrisDir:         filepath.Join(supportDir, "uris"),
		ProcessDir:      filepath.Join(supportDir, "process"),
		UploadsDir:      filepath.Join(resolved, "uploads"),
		PermissionsFile: filepath.Join(resolved, "permissions.json"),
		EnvOrderFile:    filepath.Join(resolved, "env", "order.yaml"),
	}
}

func (a *App) getDataContext() DataContext {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return createDataContext(a.activeDataDir)
}

func ensureDataContextDirs(dc DataContext) {
	dirs := []string{
		dc.ProjectsDir, dc.EnvDir, dc.RunsDir,
		dc.UrisDir, dc.ProcessDir, dc.UploadsDir,
	}
	for _, d := range dirs {
		_ = os.MkdirAll(d, 0755)
	}

	// Create example files if they don't exist
	exampleUris := filepath.Join(dc.UrisDir, "example-collector.xqy")
	if _, err := os.Stat(exampleUris); os.IsNotExist(err) {
		_ = os.WriteFile(exampleUris, []byte("xquery version \"1.0-ml\";\n(: Example Custom Collector :)\ncts:uris((),(),cts:and-query(()))"), 0644)
	}
	exampleProcess := filepath.Join(dc.ProcessDir, "example-process.xqy")
	if _, err := os.Stat(exampleProcess); os.IsNotExist(err) {
		_ = os.WriteFile(exampleProcess, []byte("xquery version \"1.0-ml\";\n(: Example Custom Processor :)\ndeclare variable $URI as xs:string external;\nxdmp:log($URI)"), 0644)
	}
	if _, err := os.Stat(dc.PermissionsFile); os.IsNotExist(err) {
		_ = os.WriteFile(dc.PermissionsFile, []byte("{}"), 0644)
	}
}

// readDotEnv reads a .env file and returns key=value pairs.
func readDotEnv(path string) map[string]string {
	result := make(map[string]string)
	data, err := os.ReadFile(path)
	if err != nil {
		return result
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			// Strip surrounding quotes
			if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
				val = val[1 : len(val)-1]
			}
			result[key] = val
		}
	}
	return result
}

// safePath ensures the resolved path stays within the base directory.
func safePath(base, sub string) (string, error) {
	resolvedBase, _ := filepath.Abs(base)
	resolved, _ := filepath.Abs(filepath.Join(resolvedBase, sub))
	if resolved != resolvedBase && !strings.HasPrefix(resolved, resolvedBase+string(filepath.Separator)) {
		return "", fmt.Errorf("access denied")
	}
	return resolved, nil
}

// --- Bound methods: Data Directory ---

func (a *App) GetDataDirectory() DataDirectoryConfig {
	dc := a.getDataContext()
	return DataDirectoryConfig{DataDir: dc.DataDir}
}

func (a *App) SetDataDirectory(dataDir string) (DataDirectoryConfig, error) {
	trimmed := strings.TrimSpace(dataDir)
	if trimmed == "" {
		return DataDirectoryConfig{}, fmt.Errorf("a data directory path is required")
	}
	resolved, err := filepath.Abs(trimmed)
	if err != nil {
		return DataDirectoryConfig{}, fmt.Errorf("invalid path: %w", err)
	}

	// Create if it doesn't exist
	if err := os.MkdirAll(resolved, 0755); err != nil {
		return DataDirectoryConfig{}, fmt.Errorf("cannot create directory: %w", err)
	}

	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return DataDirectoryConfig{}, fmt.Errorf("selected path is not a directory")
	}

	dc := createDataContext(resolved)
	ensureDataContextDirs(dc)

	a.mu.Lock()
	a.activeDataDir = dc.DataDir
	a.mu.Unlock()

	log.Printf("Active data directory set to %s", dc.DataDir)
	return DataDirectoryConfig{DataDir: dc.DataDir}, nil
}

func (a *App) BrowseDataDirectory() (DataDirectoryConfig, error) {
	selected, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select a folder for CoRBi data storage",
	})
	if err != nil {
		return DataDirectoryConfig{}, fmt.Errorf("failed to open directory dialog: %w", err)
	}
	if selected == "" {
		return DataDirectoryConfig{}, fmt.Errorf("directory selection cancelled")
	}
	return a.SetDataDirectory(selected)
}

// --- Bound methods: Projects ---

func (a *App) GetProjects() ([]Project, error) {
	dc := a.getDataContext()
	_ = os.MkdirAll(dc.ProjectsDir, 0755)

	entries, err := os.ReadDir(dc.ProjectsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read projects: %w", err)
	}

	var projects []Project
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pName := e.Name()
		pPath := filepath.Join(dc.ProjectsDir, pName)

		// Read jobs
		var jobs []FileEntry
		pEntries, _ := os.ReadDir(pPath)
		for _, f := range pEntries {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".job") {
				content, _ := os.ReadFile(filepath.Join(pPath, f.Name()))
				jobs = append(jobs, FileEntry{Name: f.Name(), Type: "job", Content: string(content)})
			}
		}

		// Read scripts recursively
		scriptsDir := filepath.Join(pPath, "scripts")
		scripts := getScriptsRecursively(scriptsDir, scriptsDir)

		// Read runs
		pRunsDir := filepath.Join(dc.RunsDir, pName)
		var runs []ProjectRun
		if info, err := os.Stat(pRunsDir); err == nil && info.IsDir() {
			envDirs, _ := os.ReadDir(pRunsDir)
			for _, envDir := range envDirs {
				if !envDir.IsDir() {
					continue
				}
				envName := envDir.Name()
				envRunsPath := filepath.Join(pRunsDir, envName)
				runTimestamps, _ := os.ReadDir(envRunsPath)
				for _, rt := range runTimestamps {
					if !rt.IsDir() || strings.HasPrefix(rt.Name(), ".") {
						continue
					}
					rTimestamp := rt.Name()
					rPath := filepath.Join(envRunsPath, rTimestamp)

					optionsContent, _ := os.ReadFile(filepath.Join(rPath, "job.options"))

					// Read logs
					var logs []RunFile
					rEntries, _ := os.ReadDir(rPath)
					for _, rf := range rEntries {
						if strings.HasSuffix(rf.Name(), ".log") {
							content, _ := os.ReadFile(filepath.Join(rPath, rf.Name()))
							logs = append(logs, RunFile{Name: rf.Name(), Content: string(content)})
						}
					}

					// Read reports
					var reports []RunFile
					for _, rf := range rEntries {
						if strings.HasSuffix(rf.Name(), "report.txt") {
							content, _ := os.ReadFile(filepath.Join(rPath, rf.Name()))
							reports = append(reports, RunFile{Name: rf.Name(), Content: string(content)})
						}
					}

					// Read run scripts
					runScriptsDir := filepath.Join(rPath, "scripts")
					runScripts := getScriptsRecursively(runScriptsDir, runScriptsDir)

					var runScriptFiles []RunFile
					for _, s := range runScripts {
						runScriptFiles = append(runScriptFiles, RunFile{Name: s.Name, Content: s.Content})
					}

					runs = append(runs, ProjectRun{
						ID:        envName + "/" + rTimestamp,
						Timestamp: rTimestamp,
						IsDryRun:  strings.Contains(string(optionsContent), "DRY-RUN=true"),
						Environments: []RunEnvironment{{
							Name:    envName,
							Options: string(optionsContent),
							Logs:    logs,
							Scripts: runScriptFiles,
							Reports: reports,
						}},
					})
				}
			}
		}

		// Sort runs descending by timestamp
		sort.Slice(runs, func(i, j int) bool {
			return runs[i].Timestamp > runs[j].Timestamp
		})

		if jobs == nil {
			jobs = []FileEntry{}
		}
		if scripts == nil {
			scripts = []FileEntry{}
		}
		if runs == nil {
			runs = []ProjectRun{}
		}

		projects = append(projects, Project{
			ID:      pName,
			Name:    pName,
			Jobs:    jobs,
			Scripts: scripts,
			Runs:    runs,
		})
	}

	if projects == nil {
		projects = []Project{}
	}
	return projects, nil
}

func (a *App) CreateProject(name string) (map[string]string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("a project name is required")
	}
	if name == "." || name == ".." || strings.ContainsAny(name, "\\/") {
		return nil, fmt.Errorf("project name contains invalid path characters")
	}

	dc := a.getDataContext()
	projectDir, err := safePath(dc.ProjectsDir, name)
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(projectDir); err == nil {
		return nil, fmt.Errorf("a project with that name already exists")
	}

	if err := os.MkdirAll(filepath.Join(projectDir, "scripts", "uris"), 0755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(projectDir, "scripts", "process"), 0755); err != nil {
		return nil, err
	}

	return map[string]string{"id": name, "name": name}, nil
}

// --- Bound methods: Environments ---

func (a *App) GetEnvFiles() (EnvResponse, error) {
	dc := a.getDataContext()
	_ = os.MkdirAll(dc.EnvDir, 0755)

	files, err := os.ReadDir(dc.EnvDir)
	if err != nil {
		return EnvResponse{}, fmt.Errorf("failed to read envs: %w", err)
	}

	// Load env vars from .env file
	loadedEnvVars := readDotEnv(dc.DotEnvPath)
	// Also check process env
	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) == 2 {
			if _, exists := loadedEnvVars[parts[0]]; !exists {
				loadedEnvVars[parts[0]] = parts[1]
			}
		}
	}

	envs := make(map[string]EnvData)
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".props") {
			name := strings.TrimSuffix(f.Name(), ".props")
			content, _ := os.ReadFile(filepath.Join(dc.EnvDir, f.Name()))
			envVarName := "PASSWD_" + strings.ReplaceAll(name, "-", "_")
			_, hasPassword := loadedEnvVars[envVarName]
			envs[name] = EnvData{Content: string(content), HasPassword: hasPassword}
		}
	}

	// Read order from YAML
	var order []string
	if data, err := os.ReadFile(dc.EnvOrderFile); err == nil {
		_ = yaml.Unmarshal(data, &order)
	}

	envKeys := make([]string, 0, len(envs))
	for k := range envs {
		envKeys = append(envKeys, k)
	}
	sort.Strings(envKeys)

	if len(order) == 0 {
		order = envKeys
	} else {
		// Append missing keys
		existing := make(map[string]bool)
		for _, o := range order {
			existing[o] = true
		}
		for _, k := range envKeys {
			if !existing[k] {
				order = append(order, k)
			}
		}
		// Filter out keys that no longer exist
		envSet := make(map[string]bool)
		for _, k := range envKeys {
			envSet[k] = true
		}
		filtered := order[:0]
		for _, k := range order {
			if envSet[k] {
				filtered = append(filtered, k)
			}
		}
		order = filtered
	}

	return EnvResponse{Data: envs, Order: order}, nil
}

func (a *App) SaveEnvOrder(order []string) error {
	dc := a.getDataContext()
	data, err := yaml.Marshal(order)
	if err != nil {
		return fmt.Errorf("failed to serialize order: %w", err)
	}
	return os.WriteFile(dc.EnvOrderFile, data, 0644)
}

// --- Bound methods: Permissions ---

func (a *App) GetPermissions() (PermissionMap, error) {
	dc := a.getDataContext()
	data, err := os.ReadFile(dc.PermissionsFile)
	if err != nil {
		return PermissionMap{}, nil
	}
	var perms PermissionMap
	if err := json.Unmarshal(data, &perms); err != nil {
		return PermissionMap{}, nil
	}
	return perms, nil
}

func (a *App) SavePermissions(permissions PermissionMap) error {
	dc := a.getDataContext()
	data, err := json.MarshalIndent(permissions, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize permissions: %w", err)
	}
	return os.WriteFile(dc.PermissionsFile, data, 0644)
}

// --- Bound methods: Support files ---

func (a *App) GetSupportUris() ([]string, error) {
	dc := a.getDataContext()
	return listNonHiddenFiles(dc.UrisDir)
}

func (a *App) GetSupportProcess() ([]string, error) {
	dc := a.getDataContext()
	return listNonHiddenFiles(dc.ProcessDir)
}

func (a *App) GetSupportContent(contentType string, filename string) (string, error) {
	dc := a.getDataContext()
	var baseDir string
	switch contentType {
	case "uris":
		baseDir = dc.UrisDir
	case "process":
		baseDir = dc.ProcessDir
	default:
		return "", fmt.Errorf("invalid type")
	}

	filePath, err := safePath(baseDir, filename)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("file not found")
	}
	return string(content), nil
}

// --- Bound methods: File operations ---

func (a *App) SaveFile(req SaveFileRequest) error {
	dc := a.getDataContext()
	var targetPath string
	var err error

	switch req.Type {
	case "env":
		targetPath, err = safePath(dc.EnvDir, req.FileName)
	case "job":
		targetPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.FileName)
	case "script":
		targetPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.FileName)
		if err == nil {
			_ = os.MkdirAll(filepath.Dir(targetPath), 0755)
		}
	case "support-uris":
		targetPath, err = safePath(dc.UrisDir, req.FileName)
	case "support-process":
		targetPath, err = safePath(dc.ProcessDir, req.FileName)
	default:
		return fmt.Errorf("invalid type")
	}

	if err != nil {
		return err
	}
	return os.WriteFile(targetPath, []byte(req.Content), 0644)
}

func (a *App) CopyFile(req CopyFileRequest) error {
	dc := a.getDataContext()
	var sourcePath, targetPath string
	var err error

	switch req.Type {
	case "job":
		sourcePath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.SourceName)
		if err != nil {
			return err
		}
		targetPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.TargetName)
	case "script":
		sourcePath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.SourceName)
		if err != nil {
			return err
		}
		targetPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.TargetName)
		if err == nil {
			_ = os.MkdirAll(filepath.Dir(targetPath), 0755)
		}
	default:
		return fmt.Errorf("invalid type")
	}
	if err != nil {
		return err
	}

	if _, statErr := os.Stat(targetPath); statErr == nil {
		return fmt.Errorf("target file already exists")
	}

	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return err
	}
	return os.WriteFile(targetPath, data, 0644)
}

func (a *App) RenameFile(req RenameFileRequest) error {
	dc := a.getDataContext()
	var oldPath, newPath string
	var err error

	switch req.Type {
	case "job":
		oldPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.OldName)
		if err != nil {
			return err
		}
		newPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.NewName)
	case "script":
		oldPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.OldName)
		if err != nil {
			return err
		}
		newPath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.NewName)
		if err == nil {
			_ = os.MkdirAll(filepath.Dir(newPath), 0755)
		}
	case "env":
		oldPath, err = safePath(dc.EnvDir, req.OldName)
		if err != nil {
			return err
		}
		newPath, err = safePath(dc.EnvDir, req.NewName)
	default:
		return fmt.Errorf("invalid type")
	}
	if err != nil {
		return err
	}

	if _, statErr := os.Stat(newPath); statErr == nil {
		return fmt.Errorf("target file already exists")
	}

	return os.Rename(oldPath, newPath)
}

func (a *App) DeleteFile(req DeleteFileRequest) error {
	dc := a.getDataContext()
	var filePath string
	var err error

	switch req.Type {
	case "job":
		filePath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID), req.FileName)
	case "script":
		filePath, err = safePath(filepath.Join(dc.ProjectsDir, req.ProjectID, "scripts"), req.FileName)
	default:
		return fmt.Errorf("invalid type")
	}
	if err != nil {
		return err
	}
	return os.Remove(filePath)
}

// --- Bound methods: Upload (file picker) ---

func (a *App) UploadFile() (map[string]string, error) {
	selected, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select a file to upload",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open file dialog: %w", err)
	}
	if selected == "" {
		return nil, fmt.Errorf("file selection cancelled")
	}

	dc := a.getDataContext()
	_ = os.MkdirAll(dc.UploadsDir, 0755)

	filename := filepath.Base(selected)
	destPath := filepath.Join(dc.UploadsDir, filename)

	data, err := os.ReadFile(selected)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	return map[string]string{
		"path":     destPath,
		"filename": filename,
	}, nil
}

// --- Bound methods: Runs ---

func (a *App) CreateRun(req RunRequest) (RunResult, error) {
	return a.createRun(req)
}

func (a *App) StopRun(projectId, envName, runId string) error {
	return a.stopRun(projectId, envName, runId)
}

func (a *App) GetRunStatus(projectId, envName, runId string) RunStatusResult {
	return a.getRunStatus(projectId, envName, runId)
}

func (a *App) GetRunFile(projectId, envName, runId, filename string) (string, error) {
	dc := a.getDataContext()
	filePath, err := safePath(filepath.Join(dc.RunsDir, projectId, envName, runId), filename)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", nil // Return empty string like the Express version
	}
	return string(content), nil
}

func (a *App) GetRunFiles(projectId, envName, runId string) ([]string, error) {
	dc := a.getDataContext()
	runDir, err := safePath(filepath.Join(dc.RunsDir, projectId, envName), runId)
	if err != nil {
		return []string{}, err
	}
	entries, err := os.ReadDir(runDir)
	if err != nil {
		return []string{}, nil
	}
	var files []string
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			files = append(files, e.Name())
		}
	}
	if files == nil {
		files = []string{}
	}
	return files, nil
}

func (a *App) DeleteRun(projectId, envName, runId string) error {
	dc := a.getDataContext()
	runPath, err := safePath(filepath.Join(dc.RunsDir, projectId, envName), runId)
	if err != nil {
		return err
	}

	a.mu.Lock()
	delete(a.activeRuns, a.runKey(runId))
	a.mu.Unlock()

	if err := os.RemoveAll(runPath); err != nil {
		return err
	}

	// Clean up empty env directory
	envPath := filepath.Dir(runPath)
	entries, _ := os.ReadDir(envPath)
	if len(entries) == 0 {
		_ = os.Remove(envPath)
	}

	return nil
}

// --- Helper functions ---

func getScriptsRecursively(dir, baseDir string) []FileEntry {
	var results []FileEntry
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return results
	}

	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := filepath.Ext(d.Name())
		if ext == ".xqy" || ext == ".js" || ext == ".sjs" || ext == ".txt" {
			relName, _ := filepath.Rel(baseDir, path)
			relName = strings.ReplaceAll(relName, string(filepath.Separator), "/")
			content, _ := os.ReadFile(path)
			results = append(results, FileEntry{Name: relName, Type: "script", Content: string(content)})
		}
		return nil
	})
	return results
}

func listNonHiddenFiles(dir string) ([]string, error) {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return []string{}, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			files = append(files, e.Name())
		}
	}
	if files == nil {
		files = []string{}
	}
	return files, nil
}

// OpenInBrowser opens a URL in the system's default browser.
func (a *App) OpenInBrowser(url string) error {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "windows":
		cmd = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", url}
	default:
		cmd = "xdg-open"
		args = []string{url}
	}

	return exec.Command(cmd, args...).Start()
}
