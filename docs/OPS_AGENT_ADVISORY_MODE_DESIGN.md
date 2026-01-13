# Ops Agent Advisory Mode — Design Document

**Status:** Design Proposal  
**Date:** 2026-01-11  
**Author:** Design Team

---

## Overview

Advisory Mode enables humans to describe operational intent in natural language and receive a structured execution plan without executing any changes. This mode is strictly read-only and provides planning capabilities for safe operational exploration.

---

## Goals

1. **Natural Language Input**: Accept human intent in plain English (or other languages)
2. **Structured Output**: Return a clear, actionable execution plan
3. **Zero Execution**: Never execute changes, only analyze and plan
4. **Context-Aware**: Use canonical project state and runtime snapshots for accurate planning

---

## Constraints

### Hard Constraints (Non-Negotiable)

1. **Read-Only by Default**: All operations must be read-only
2. **No Git Changes**: No commits, pushes, branches, or repository modifications
3. **No PM2 Restarts**: No process management operations
4. **No File Writes**: No modifications to filesystem (except temporary analysis files)
5. **No External API Calls**: No calls that modify external state (Firebase writes, Telegram sends, etc.)

### Data Sources

1. **Canonical Memory**: `docs/PROJECT_STATE.md` — source of truth for project structure
2. **Runtime Context**: Latest system snapshot (`_state/system_snapshot.md` or `_state/system_snapshot.json`)
3. **Codebase Analysis**: Read-only file system access for code inspection

---

## New Commands

### Primary Command

#### `advisory:plan`

**Description**: Generate an execution plan from natural language intent

**Syntax**: 
```
advisory:plan <natural language intent>
```

**Examples**:
- `advisory:plan How do I restart the video worker?`
- `advisory:plan What would happen if I update the YouTube refresh token?`
- `advisory:plan Show me the steps to deploy a new feature flag`
- `advisory:plan How can I check if the news pipeline is healthy?`

**Behavior**:
1. Parse natural language intent
2. Load context from `docs/PROJECT_STATE.md` and latest snapshot
3. Analyze codebase structure (read-only)
4. Generate structured execution plan
5. Return plan as formatted markdown in GitHub Issue comment

---

### Secondary Commands

#### `advisory:explain`

**Description**: Explain what a specific command would do (without executing)

**Syntax**:
```
advisory:explain <command-name>
```

**Examples**:
- `advisory:explain worker:restart`
- `advisory:explain snapshot:run`

**Behavior**:
1. Look up command in whitelist
2. Analyze command handler code (read-only)
3. Explain what the command does, what it would change, and any side effects
4. Return explanation in GitHub Issue comment

---

#### `advisory:validate`

**Description**: Validate if a proposed plan would be safe to execute

**Syntax**:
```
advisory:validate <plan-description>
```

**Behavior**:
1. Parse plan description
2. Check against safety constraints
3. Identify any operations that would violate read-only mode
4. Return validation report with warnings/errors

---

## Data Flow

### Request Flow

```
GitHub Issue (with "ops" label)
    ↓
Parse command: "advisory:plan <intent>"
    ↓
Load Context:
    ├─ Read docs/PROJECT_STATE.md (canonical memory)
    ├─ Read _state/system_snapshot.md (runtime state)
    └─ Read relevant code files (read-only analysis)
    ↓
Intent Analysis:
    ├─ Extract intent from natural language
    ├─ Map to system components
    └─ Identify required operations
    ↓
Plan Generation:
    ├─ Break down into steps
    ├─ Check each step against constraints
    ├─ Identify dependencies
    └─ Format as structured plan
    ↓
Response:
    └─ Post formatted plan to GitHub Issue comment
```

### Context Loading

1. **PROJECT_STATE.md**:
   - Project structure
   - Entry points
   - Process definitions
   - Configuration locations
   - Known workflows

2. **System Snapshot**:
   - Current PM2 process status
   - Git branch/commit
   - File modification times
   - Recent log entries (if available)
   - Environment variable names (not values)

3. **Codebase Analysis**:
   - Read command handler code
   - Analyze file dependencies
   - Map operations to actual code paths

---

## Execution Plan Format

### Structure

```markdown
## Execution Plan: [Intent Summary]

**Generated:** [timestamp]  
**Context:** [snapshot timestamp, git commit]

### Overview
[Brief description of what the plan accomplishes]

### Prerequisites
- [ ] Check 1
- [ ] Check 2

### Steps

#### Step 1: [Action]
- **Command:** `command:name`
- **Description:** What this step does
- **Expected Changes:** What would be modified
- **Safety Check:** ✅ Safe / ⚠️ Warning / ❌ Blocked

#### Step 2: [Action]
...

### Dependencies
- Step 2 depends on Step 1
- Step 3 can run in parallel with Step 2

### Warnings
- ⚠️ Warning 1
- ⚠️ Warning 2

### Estimated Impact
- **Files Modified:** [count]
- **Processes Affected:** [list]
- **External Services:** [list]

### Rollback Plan
[How to undo these changes if needed]

### Next Steps
1. Review this plan
2. Execute manually or create separate issue for execution
3. Verify results
```

---

## Safety Guarantees

### Enforcement Mechanisms

1. **Command Whitelist Extension**:
   - Advisory commands added to whitelist
   - All advisory commands marked with `readOnly: true` flag
   - Handler functions explicitly check for read-only mode

2. **Runtime Checks**:
   ```javascript
   if (mode === 'advisory' || commandConfig.readOnly) {
     // Block any write operations
     throw new Error('Write operation blocked in advisory mode');
   }
   ```

3. **File System Wrapper**:
   - Intercept all file write operations
   - Log attempted writes but block execution
   - Return mock success for read-only analysis

4. **Git Command Filtering**:
   - Block: `git commit`, `git push`, `git branch -D`, `git reset --hard`
   - Allow: `git status`, `git log`, `git diff`, `git show`

5. **PM2 Command Filtering**:
   - Block: `pm2 restart`, `pm2 delete`, `pm2 start`, `pm2 stop`
   - Allow: `pm2 list`, `pm2 describe`, `pm2 logs` (read-only)

6. **External API Filtering**:
   - Block: POST/PUT/DELETE requests to Firebase, Telegram, GitHub (writes)
   - Allow: GET requests for reading state

### Validation Rules

1. **Plan Validation**:
   - Scan generated plan for blocked operations
   - Flag any steps that would modify state
   - Require explicit confirmation for risky operations

2. **Intent Analysis**:
   - Detect dangerous keywords: "delete", "restart", "modify", "update"
   - Warn user if intent suggests write operations
   - Suggest read-only alternatives

3. **Context Verification**:
   - Verify PROJECT_STATE.md exists and is readable
   - Verify snapshot exists and is recent (< 1 hour old)
   - Fall back gracefully if context unavailable

---

## Implementation Notes

### Command Handler Structure

```javascript
const COMMAND_WHITELIST = {
  "advisory:plan": {
    description: "Generate execution plan from natural language intent",
    handler: handleAdvisoryPlan,
    readOnly: true,
    needsGit: false,
    needsPr: false
  },
  // ... existing commands
};

async function handleAdvisoryPlan(issue) {
  // 1. Extract intent from issue body/title
  const intent = extractIntent(issue);
  
  // 2. Load context
  const projectState = await loadProjectState();
  const snapshot = await loadSnapshot();
  const codebase = await analyzeCodebase(intent);
  
  // 3. Generate plan
  const plan = await generatePlan(intent, {
    projectState,
    snapshot,
    codebase
  });
  
  // 4. Validate plan
  const validation = validatePlan(plan);
  
  // 5. Format and return
  return formatPlan(plan, validation);
}
```

### Context Loaders

```javascript
async function loadProjectState() {
  const path = path.join(PROJECT_DIR, 'docs', 'PROJECT_STATE.md');
  if (!fs.existsSync(path)) {
    throw new Error('PROJECT_STATE.md not found');
  }
  return fs.readFileSync(path, 'utf8');
}

async function loadSnapshot() {
  const mdPath = path.join(PROJECT_DIR, '_state', 'system_snapshot.md');
  const jsonPath = path.join(PROJECT_DIR, '_state', 'system_snapshot.json');
  
  // Prefer JSON for structured data, fall back to MD
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } else if (fs.existsSync(mdPath)) {
    return fs.readFileSync(mdPath, 'utf8');
  }
  
  throw new Error('No snapshot found');
}
```

### Intent Parser

- Use simple keyword matching initially
- Can be enhanced with LLM integration later (read-only analysis)
- Extract:
  - Action verbs: "restart", "check", "update", "deploy"
  - Targets: "video worker", "PM2", "Firebase", "git"
  - Goals: "fix error", "deploy feature", "check health"

---

## Error Handling

### Graceful Degradation

1. **Missing Context**:
   - If PROJECT_STATE.md missing: Use codebase analysis only
   - If snapshot missing: Use current system state (read-only queries)
   - Log warnings but continue

2. **Unparseable Intent**:
   - Return error message with suggestions
   - Show available commands
   - Suggest rephrasing

3. **Ambiguous Intent**:
   - Return multiple possible interpretations
   - Ask user to clarify
   - Provide examples

---

## Future Enhancements

1. **LLM Integration**: Use OpenAI/Claude for better intent parsing (read-only)
2. **Plan Execution**: Separate command to execute validated plans (with explicit opt-in)
3. **Plan Templates**: Pre-defined plans for common operations
4. **Plan History**: Track and learn from past plans
5. **Interactive Refinement**: Multi-turn conversation to refine plans

---

## Security Considerations

1. **No Secret Exposure**: Never include secret values in plans (only names)
2. **Input Sanitization**: Sanitize all user input before processing
3. **Rate Limiting**: Limit advisory requests to prevent abuse
4. **Audit Logging**: Log all advisory requests for review

---

## Testing Strategy

1. **Unit Tests**: Test intent parsing, plan generation, validation
2. **Integration Tests**: Test full flow with mock GitHub Issues
3. **Safety Tests**: Verify no write operations occur in advisory mode
4. **Context Tests**: Test behavior with missing/invalid context files

---

## Migration Path

1. **Phase 1**: Implement `advisory:plan` command (MVP)
2. **Phase 2**: Add `advisory:explain` and `advisory:validate`
3. **Phase 3**: Enhance with LLM integration
4. **Phase 4**: Add plan execution (with explicit opt-in)

---

## Appendix: Example Output

### Example 1: Restart Video Worker

**Input**: `advisory:plan How do I restart the video worker?`

**Output**:
```markdown
## Execution Plan: Restart Video Worker

**Generated:** 2026-01-11T12:00:00Z  
**Context:** Snapshot 2026-01-11T11:30:00Z, Git commit abc123

### Overview
This plan outlines the steps to restart the `nova-video` PM2 process.

### Prerequisites
- [ ] Verify current PM2 process status
- [ ] Check for active video jobs in Firebase
- [ ] Ensure no critical operations in progress

### Steps

#### Step 1: Check Current Status
- **Command:** `report:status`
- **Description:** View current PM2 and system status
- **Expected Changes:** None (read-only)
- **Safety Check:** ✅ Safe

#### Step 2: Stop Video Worker
- **Command:** `pm2 delete nova-video`
- **Description:** Stop and remove the nova-video process
- **Expected Changes:** PM2 process removed
- **Safety Check:** ⚠️ Warning: Active jobs may be interrupted

#### Step 3: Start Video Worker
- **Command:** `pm2 start server/video-worker.js --name nova-video --update-env`
- **Description:** Start the video worker with updated environment
- **Expected Changes:** New PM2 process created
- **Safety Check:** ✅ Safe

#### Step 4: Verify Restart
- **Command:** `pm2 status nova-video`
- **Description:** Confirm process is running
- **Expected Changes:** None (read-only)
- **Safety Check:** ✅ Safe

### Warnings
- ⚠️ Restarting will interrupt any video job currently in progress
- ⚠️ Jobs in "processing" state may need manual cleanup

### Estimated Impact
- **Files Modified:** 0
- **Processes Affected:** nova-video (PM2)
- **External Services:** None

### Rollback Plan
If restart fails:
1. Check PM2 logs: `pm2 logs nova-video`
2. Verify environment variables
3. Manually start: `pm2 start server/video-worker.js --name nova-video`

### Next Steps
1. Review this plan
2. Execute steps manually or use `worker:restart` command
3. Monitor logs for errors
```

---

**End of Design Document**
