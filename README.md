# CoRBi - CoRB2 Interactive Runner

A web interface for running CoRB (Concurrent URIs Runner Batch) jobs against MarkLogic databases.

## Quick Start

### 1. Clone the Data Repository

CoRBi requires a data repository where your jobs and environments are configured:

```bash
git clone https://github.com/chriskellyml/corbi-data-template.git my-corbi-data
cd my-corbi-data
```

### 2. Set Up the Data Repository

Follow the setup instructions in the [corbi-data-template](https://github.com/chriskellyml/corbi-data-template) README:

```bash
# Copy the environment template
cp dot.env.template .env

# Add your MarkLogic passwords to .env
# Edit the file and set PASSWD_LOCAL, PASSWD_TEST, etc.

# Copy environment property files
cp env/LOCAL.props.template env/LOCAL.props
# Edit env/LOCAL.props with your MarkLogic connection details

# Build the project
./gradlew setup
```

### 3. Start CoRBi

**Option A: Using Make (Recommended)**

Copy the environment template:

```bash
cp dot.env.template .env
# Edit .env and set CORBI_DATA_DIR to your corbi-data-template path
```

Then run with the data directory:

```bash
make install
make start CORBI_DATA_DIR=/path/to/your/corbi-data
```

Or if you already set `CORBI_DATA_DIR` in `.env`:

```bash
make install
make start
```

**Option B: Using pnpm directly**

```bash
cp dot.env.template .env
# Edit .env and set CORBI_DATA_DIR to your corbi-data-template path

pnpm install
pnpm dev
```

Or set the environment variable directly:

```bash
CORBI_DATA_DIR=/path/to/your/corbi-data pnpm dev
```

**Option C: Using npm**

```bash
npm install
CORBI_DATA_DIR=/path/to/your/corbi-data npm run dev
```

Open http://localhost:8080 in your browser.

### Environment Variable Resolution

CoRBi resolves `CORBI_DATA_DIR` in this order (highest to lowest priority):

1. **Command-line override:** `make start CORBI_DATA_DIR=/path` or `CORBI_DATA_DIR=/path pnpm dev`
2. **Repository `.env` file:** Set `CORBI_DATA_DIR=...` in the repo root's `.env`
3. **Default:** Repository root (looks for `src/projects/`, `env/`, etc. in the current directory)

## Running a Sample Job

The template includes a sample job called `sample-job`. To run it:

1. In CoRBi, select the **sample-job** project from the sidebar
2. Select the **01-make-dummy-files** job
3. Choose your environment (e.g., LOCAL) from the top bar
4. Click **Dry Run** to test the job
5. After reviewing the dry run output, click **Wet Run** to execute

## What is CoRBi?

CoRBi provides a graphical interface for CoRB jobs:

- **Projects**: Organize your jobs into projects
- **Environments**: Manage different MarkLogic environments (LOCAL, TEST, PROD)
- **Dry Runs**: Preview what a job will do without making changes
- **Wet Runs**: Execute the actual job
- **Run History**: Browse past runs with logs and reports
- **Permissions**: Control which jobs can run in which environments

For more details on job configuration, see the [corbi-data-template](https://github.com/chriskellyml/corbi-data-template) documentation.
