---
name: test-reviewing
description: Reviews generated tests by running them, analyzing failures, and validating London School patterns. Use when reviewing tests, checking test quality, or before spec verification.
disable-model-invocation: false
---

# Test Reviewing

Reviews generated tests to ensure quality and correctness before proceeding to spec verification. Acts as the quality gate between test generation and coverage verification.

## Workflow Position

```
Step 6: Test Generation (/test-generate)
    │
    ▼
Step 6.5: Test Review (/test-reviewing)       ← THIS SKILL
    │
    ├── All tests pass → Step 8: /spec-verify
    └── Failures → Step 7: /test-fixing
            │
            └── Loop back to Step 6.5
```

## Workflow

### Step 1: Accept Input

Usage patterns:
```bash
# Review tests for a specific class
/test-reviewing LiveViewRepository

# Review with verbose output
/test-reviewing AuthViewModel --verbose

# Review multiple classes (will use subagents)
/test-reviewing LiveViewRepository AuthViewModel SecureRepository
```

### Step 1.5: Evaluate Scope and Parallelize

When multiple targets are specified or a single target has many test groups (>50 tests), split the work across subagents for efficiency.

**Decision criteria:**

| Condition | Action |
|-----------|--------|
| Single target, <50 tests | Process directly |
| Single target, ≥50 tests | Split by test group, use subagents |
| Multiple targets (2-5) | One subagent per target, parallel execution |
| Many targets (>5) | Batch into groups of 3, sequential batches |

**Subagent invocation:**

IMPORTANT: When invoking subagents, you MUST instruct them to use the `/test-reviewing` skill explicitly.

```
Use Task tool with subagent_type="general-purpose" for each target:

Task(
  description="Review {ClassName} tests",
  prompt="Use the /test-reviewing skill to review tests for {ClassName}.
         Invoke the skill with: /test-reviewing {ClassName}
         Follow the skill workflow completely and return the review report.",
  subagent_type="general-purpose"
)
```

The subagent must invoke `/test-reviewing` - do NOT just describe the workflow in the prompt.

**Parallel execution example:**

When reviewing `LiveViewRepository`, `AuthViewModel`, and `SecureRepository`:

1. Launch 3 subagents in parallel (single message with multiple Task tool calls)
2. Each subagent runs Steps 2-7 independently
3. Main agent aggregates results into combined report

**Result aggregation:**

```markdown
## Combined Test Review Report

### Individual Results
| Class | Tests | Passed | Failed | Status |
|-------|-------|--------|--------|--------|
| LiveViewRepository | 135 | 130 | 5 | ⚠️ Issues |
| AuthViewModel | 24 | 24 | 0 | ✓ Pass |
| SecureRepository | 18 | 18 | 0 | ✓ Pass |

### Summary
- Total: 177 tests
- Passed: 172 (97.2%)
- Failed: 5 (2.8%)

### Next Actions
- LiveViewRepository: Run `/test-fixing` to resolve 5 issues
- AuthViewModel: Run `/spec-verify AuthViewModel`
- SecureRepository: Run `/spec-verify SecureRepository`
```

### Step 2: Locate Test File

Based on class type, find test file:

| Class Type | Test Location |
|------------|---------------|
| ViewModel | `test/unit_tests/ui/{feature}/{class}_test.dart` |
| Repository | `test/unit_tests/domain/repository/{class}_test.dart` |
| Service | `test/unit_tests/service/{class}_test.dart` |

If test file not found, report error and suggest running `/test-generate` first.

### Step 3: Run Tests

Execute tests and capture output:

```bash
flutter test <test_file> --no-pub 2>&1
```

### Step 4: Analyze Test Structure

Verify London School patterns:

| Check | Criteria | Pass |
|-------|----------|------|
| Mock Usage | All dependencies are mocked | ✓/✗ |
| No Real I/O | No network, file, or database calls | ✓/✗ |
| Isolation | Each test is independent | ✓/✗ |
| Naming | Follows `method_GivenScenario_ShouldResult` | ✓/✗ |
| Spec Tags | Tests have `@Tags(['SPEC-XXX'])` | ✓/✗ |

### Step 5: Validate Mock Configuration

Check mock setup quality:

| Check | Criteria |
|-------|----------|
| Complete Stubs | All used methods are stubbed |
| Correct Types | Return types match implementation |
| Named Parameters | Uses `anyNamed()` correctly |
| Dummy Values | `provideDummy` for complex types |

### Step 6: Categorize Failures

If tests fail, categorize each failure:

| Category | Code | Description | Next Action |
|----------|------|-------------|-------------|
| Structural | S | Test structure issues (missing setup, wrong patterns) | /test-fixing |
| Mock | M | Mock configuration problems | /test-fixing |
| Assertion | A | Assertion failures (expected vs actual) | /test-fixing |
| Runtime | R | Runtime errors (null, type, import) | /test-fixing |

### Step 7: Generate Review Report

Output the following format:

```markdown
## Test Review Report: {ClassName}

### Summary
| Metric | Value |
|--------|-------|
| Test File | `test/unit_tests/.../{class}_test.dart` |
| Total Tests | {count} |
| Passed | {count} |
| Failed | {count} |
| Skipped | {count} |

### Test Execution
{pass/fail status for each test group}

### London School Compliance
| Check | Status |
|-------|--------|
| Mock Usage | ✓ All dependencies mocked |
| No Real I/O | ✓ No external calls |
| Isolation | ✓ Tests are independent |
| Naming | ✓ Follows convention |
| Spec Tags | ✓ All tests tagged |

### Issues Found
{If any issues, list with category codes}

| # | Category | Test | Issue |
|---|----------|------|-------|
| 1 | M | fetchAccount_WhenSuccess_ShouldReturn | Wrong mock return type |
| 2 | A | delete_WhenNotFound_ShouldThrow | Expected exception not thrown |

### Next Action

{One of the following:}
- **All tests pass**: Run `/spec-verify {ClassName}` to check coverage
- **Issues found**: Run `/test-fixing` to resolve {count} issues
```

## Issue Categories Reference

| Code | Category | Common Causes |
|------|----------|---------------|
| S | Structural | Missing setUpAll, wrong test grouping, no tearDown |
| M | Mock | Wrong method stubbed, incorrect return type, missing stub |
| A | Assertion | Wrong expected value, matcher issue, async timing |
| R | Runtime | Null pointer, type cast error, missing import |

## Integration Points

### From /test-generate
- Receives: Newly generated test scaffolds
- Validates: Structure and mock configuration

### To /test-fixing
- Sends: Categorized failure list
- Expects: Fixed tests for re-review

### To /spec-verify
- Sends: Passing test file
- Enables: Coverage verification

## Step 8: Cross-Agent Consensus (Codex Review)

After completing your review, request a parallel review from Codex CLI to validate findings and build consensus.

### 8.1 Invoke Codex Review

Run Codex review using a **structured request**, not shell string interpolation.

Do not run commands like `codex exec "... {ClassName} ..."` where placeholders are directly embedded in a shell string.
Instead:

1. Validate dynamic inputs first (for example, class name with an allowlist such as `^[A-Za-z0-9_./-]+$`).
2. Build a structured request object with separate fields.
3. Invoke Codex via tool/subagent interface that accepts arguments as fields (not a single concatenated command string).

Example structured request:

```json
{
  "skill": "/test-reviewing",
  "class_name": "<validated_class_name>",
  "focus": [
    "test execution results",
    "London School compliance",
    "mock configuration",
    "issues found"
  ],
  "output": "detailed review report"
}
```

### 8.2 Analyze Codex Response

Compare Codex's review with your own:

| Aspect | Your Review | Codex Review | Agreement |
|--------|-------------|--------------|-----------|
| Test Results | X passed, Y failed | ... | ✓/✗ |
| London School | ... | ... | ✓/✗ |
| Issues Found | ... | ... | ✓/✗ |
| Next Action | ... | ... | ✓/✗ |

### 8.3 Resolve Disagreements

If there are disagreements:

1. **Identify the specific disagreement** - What exactly differs?
2. **Present your reasoning** - Why do you believe your assessment is correct?
3. **Request Codex clarification** - Ask Codex to explain its reasoning
4. **Iterate if needed** - Continue discussion until consensus is reached

Example dialogue:

```json
{
  "type": "consensus_followup",
  "codex_finding": "<summary_from_codex>",
  "reviewer_finding": "<summary_from_reviewer>",
  "reasoning": "<concise_reasoning>",
  "requested_action": [
    "explain_codex_reasoning",
    "or_acknowledge_correction"
  ]
}
```

Security note:
- Never interpolate `{Codex's finding}`, `{Your finding}`, or other dynamic text directly into shell commands.
- If CLI execution is unavoidable, pass data via safe argument lists or a prebuilt data file and sanitize inputs before use.

### 8.4 Document Consensus

Once consensus is reached, document the agreed findings:

```markdown
### Cross-Agent Consensus

| Reviewer | Agreement |
|----------|-----------|
| Claude Code | ✓ |
| Codex CLI | ✓ |

**Consensus Points:**
- Test execution: {agreed result}
- London School compliance: {agreed assessment}
- Issues: {agreed list}
- Next action: {agreed recommendation}

**Resolved Disagreements:**
- {topic}: Claude said X, Codex said Y, agreed on Z because {reason}
```

## Checklist

- [ ] Test file located
- [ ] Tests executed
- [ ] Structure analyzed (London School)
- [ ] Mock configuration validated
- [ ] Failures categorized (S/M/A/R)
- [ ] Review report generated
- [ ] Codex review requested
- [ ] Disagreements resolved
- [ ] Consensus documented
- [ ] Next action recommended

## References

- Test Plan: `docs/TEST_PLAN.md`
- Spec Files: `docs/specs/{feature}/{class}_spec.yaml`
- Test Fixing: `.claude/skills/test-fixing/SKILL.md`
- Spec Verify: `.claude/skills/spec-verifying/SKILL.md`
