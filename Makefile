.PHONY: start dev install lint lint-fix help \
       gui gui-dev gui-clean \
       dist dist-mac dist-mac-universal dist-dmg \
       dist-windows dist-windows-nsis \
       dist-linux dist-linux-deb dist-linux-rpm

WAILS   := $(HOME)/go/bin/wails
VERSION := 1.0.0
DIST    := build/dist

# Default target
help:
	@echo "CoRBi Development Commands"
	@echo ""
	@echo "  make start [CORBI_DATA_DIR=...]  Start web dev server with optional data directory"
	@echo "  make dev                         Start web dev server (uses .env in repo root)"
	@echo "  make install                     Install pnpm dependencies"
	@echo "  make lint                        Run ESLint"
	@echo ""
	@echo "CoRBi Desktop App (Wails)"
	@echo ""
	@echo "  make gui                         Build for current platform"
	@echo "  make gui-dev                     Dev mode with live reload"
	@echo "  make gui-clean                   Remove build/bin and build/dist"
	@echo ""
	@echo "Distribution Packaging"
	@echo ""
	@echo "  make dist                        Build + package for current platform"
	@echo "  make dist-mac                    macOS .app (arm64)"
	@echo "  make dist-mac-universal          macOS .app (universal binary)"
	@echo "  make dist-dmg                    macOS .dmg disk image"
	@echo "  make dist-windows                Windows .exe"
	@echo "  make dist-windows-nsis           Windows NSIS installer (requires NSIS)"
	@echo "  make dist-linux                  Linux binary"
	@echo "  make dist-linux-deb              Linux .deb package (requires nfpm)"
	@echo "  make dist-linux-rpm              Linux .rpm package (requires nfpm)"

# ---------- Web dev (unchanged) ----------

start:
ifdef CORBI_DATA_DIR
	CORBI_DATA_DIR=$(CORBI_DATA_DIR) pnpm dev
else
	pnpm dev
endif

dev:
	pnpm dev

install:
	pnpm install

lint:
	pnpm lint

lint-fix:
	pnpm lint --fix

# ---------- Wails desktop app ----------

gui: $(WAILS)
	$(WAILS) build

gui-dev: $(WAILS)
ifdef CORBI_DATA_DIR
	CORBI_DATA_DIR=$(CORBI_DATA_DIR) $(WAILS) dev
else
	$(WAILS) dev
endif

gui-clean:
	rm -rf build/bin build/dist

# ---------- Distribution packaging ----------

dist: gui
	@mkdir -p $(DIST)
ifeq ($(shell uname),Darwin)
	$(MAKE) dist-dmg
else ifeq ($(OS),Windows_NT)
	@cp build/bin/corbi.exe $(DIST)/corbi-$(VERSION)-windows-amd64.exe
else
	@cp build/bin/corbi $(DIST)/corbi-$(VERSION)-linux-amd64
endif
	@echo "Distribution artifacts in $(DIST)/"
	@ls -lh $(DIST)/

# --- macOS ---

dist-mac: $(WAILS)
	$(WAILS) build -platform darwin/arm64
	@mkdir -p $(DIST)
	@cd build/bin && zip -r ../../$(DIST)/CoRBi-$(VERSION)-mac-arm64.zip corbi.app
	@echo "Built: $(DIST)/CoRBi-$(VERSION)-mac-arm64.zip"

dist-mac-universal: $(WAILS)
	$(WAILS) build -platform darwin/universal
	@mkdir -p $(DIST)
	@cd build/bin && zip -r ../../$(DIST)/CoRBi-$(VERSION)-mac-universal.zip corbi.app
	@echo "Built: $(DIST)/CoRBi-$(VERSION)-mac-universal.zip"

dist-dmg: dist-mac
	@command -v create-dmg >/dev/null 2>&1 || { echo "Install create-dmg: brew install create-dmg"; exit 1; }
	@rm -f $(DIST)/CoRBi-$(VERSION).dmg
	create-dmg \
		--volname "CoRBi $(VERSION)" \
		--volicon build/appicon.png \
		--window-pos 200 120 \
		--window-size 600 400 \
		--icon-size 100 \
		--icon "corbi.app" 175 190 \
		--app-drop-link 425 190 \
		$(DIST)/CoRBi-$(VERSION).dmg \
		build/bin/corbi.app
	@echo "Built: $(DIST)/CoRBi-$(VERSION).dmg"

# --- Windows ---

dist-windows: $(WAILS)
	$(WAILS) build -platform windows/amd64
	@mkdir -p $(DIST)
	@cp build/bin/corbi.exe $(DIST)/CoRBi-$(VERSION)-windows-amd64.exe
	@echo "Built: $(DIST)/CoRBi-$(VERSION)-windows-amd64.exe"

dist-windows-nsis: dist-windows
	@command -v makensis >/dev/null 2>&1 || { echo "Install NSIS: brew install nsis (or scoop install nsis on Windows)"; exit 1; }
	$(WAILS) build -platform windows/amd64 -nsis
	@mkdir -p $(DIST)
	@cp build/bin/corbi-amd64-installer.exe $(DIST)/CoRBi-$(VERSION)-windows-amd64-installer.exe 2>/dev/null || true
	@echo "Built: $(DIST)/CoRBi-$(VERSION)-windows-amd64-installer.exe"

# --- Linux ---

dist-linux: $(WAILS)
	$(WAILS) build -platform linux/amd64
	@mkdir -p $(DIST)
	@cp build/bin/corbi $(DIST)/CoRBi-$(VERSION)-linux-amd64
	@chmod +x $(DIST)/CoRBi-$(VERSION)-linux-amd64
	@tar czf $(DIST)/CoRBi-$(VERSION)-linux-amd64.tar.gz \
		-C build/bin corbi \
		-C ../../build/linux corbi.desktop \
		-C ../appicon.png 2>/dev/null || \
		tar czf $(DIST)/CoRBi-$(VERSION)-linux-amd64.tar.gz -C build/bin corbi
	@echo "Built: $(DIST)/CoRBi-$(VERSION)-linux-amd64"

dist-linux-deb: dist-linux
	@command -v nfpm >/dev/null 2>&1 || { echo "Install nfpm: go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest"; exit 1; }
	GOARCH=amd64 nfpm package --packager deb --target $(DIST)/
	@echo "Built .deb in $(DIST)/"

dist-linux-rpm: dist-linux
	@command -v nfpm >/dev/null 2>&1 || { echo "Install nfpm: go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest"; exit 1; }
	GOARCH=amd64 nfpm package --packager rpm --target $(DIST)/
	@echo "Built .rpm in $(DIST)/"

# ---------- Wails CLI auto-install ----------

$(WAILS):
	go install github.com/wailsapp/wails/v2/cmd/wails@latest
