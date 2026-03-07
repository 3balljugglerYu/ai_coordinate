---
name: spec-writing
description: Clarifies and refines EARS specifications through interactive dialogue. Use when reviewing specs, adding missing conditions, validating requirements, or improving specification quality.
disable-model-invocation: false
---

# Spec Writing

You are helping the user interactively clarify and refine EARS specifications through dialogue.

## Bilingual Format (IMPORTANT)

All specifications MUST be written in bilingual format (English + Japanese).
For each field, always provide both the English version and the corresponding `_ja` (Japanese) version:

| English Field | Japanese Field |
|---------------|----------------|
| `ears` | `ears_ja` |
| `preconditions` | `preconditions_ja` |
| `postconditions` | `postconditions_ja` |
| `edge_cases` | `edge_cases_ja` |
| `test_cases` | `test_cases_ja` |

**NEVER remove existing `_ja` fields.** When adding or updating a field, always update both the English and Japanese versions.

See `docs/specs/repository/live_view_repository_spec.yaml` as the reference example for bilingual format.

## When to Use

- Reviewing existing specifications for completeness
- Adding missing preconditions, postconditions, or edge cases
- Validating requirements with stakeholders
- Improving specification quality before test generation

## Workflow

### Step 1: Accept Input

The user provides a class name as argument:
```
/spec-write AuthViewModel
```

### Step 2: Locate Specification File

Find the existing spec file:
```
docs/specs/{feature}/{ClassName}_spec.yaml
```

If the file doesn't exist:
1. Ask if user wants to run `/spec-extract` first
2. Or create a minimal spec template

### Step 3: Load and Display Current Spec

Read the spec file and display:
- Metadata (class, source, version)
- Dependencies
- State properties
- Each specification (id, method, type, EARS statement)

### Step 4: Interactive Refinement

For each specification, ask clarifying questions in this order:

#### 4.1 Preconditions

Ask about conditions that must be true BEFORE the method executes:

```
## Specification: {id} - {method}

Current preconditions:
{list current preconditions}

Questions:
1. Are there authentication/authorization requirements?
2. Are there state requirements (e.g., not busy, initialized)?
3. Are there data requirements (e.g., valid input, non-null)?
4. Are there timing requirements (e.g., not during another operation)?

Would you like to add any preconditions? (Enter to skip)
```

#### 4.2 Postconditions

Ask about outcomes that must be true AFTER the method executes:

```
Current postconditions:
Success:
{list success conditions}

Error:
{list error conditions}

Questions:
1. What state changes occur on success?
2. What events are emitted or callbacks triggered?
3. What external systems are notified?
4. Are there cleanup actions?

Would you like to add any postconditions? (Enter to skip)
```

#### 4.3 Edge Cases

Ask about boundary conditions and special scenarios:

```
Questions for edge cases:
1. What happens with empty/null input?
2. What happens at boundary values (min/max)?
3. What happens with concurrent/repeated calls?
4. What happens during network issues?
5. What happens if dependencies are unavailable?

Would you like to document any edge cases? (Enter to skip)
```

#### 4.4 Error Handling

Ask about error scenarios:

```
Questions for error handling:
1. What errors can the method throw/return?
2. How should each error be handled?
3. Should errors be logged/tracked?
4. What recovery actions are available?
5. Are there retry mechanisms?

Would you like to document any error cases? (Enter to skip)
```

### Step 5: Update Specification

After each specification is refined:
1. Show the updated EARS statement (both English and Japanese)
2. Confirm with user
3. Update the YAML file, ensuring all `_ja` fields are present

### Step 6: Summary Report

After all specifications are reviewed, provide:

```markdown
## Spec Refinement Summary

### Changes Made
| Spec ID | Changes |
|---------|---------|
| AUTH-001 | +2 preconditions, +1 edge case |
| AUTH-002 | +1 postcondition |

### Statistics
- Specifications reviewed: X
- Preconditions added: Y
- Postconditions added: Z
- Edge cases documented: W
- Error cases documented: V

### Next Steps
- Run `/test-generate {ClassName}` to generate tests
- Run `/spec-verify {ClassName}` to check coverage
```

## EARS Statement Templates

Use these templates when writing/refining EARS statements:

### Event-driven
```
When [trigger event],
the [System] shall [action/behavior]
[and update state/return value].
```

### State-driven
```
While [system state],
the [System] shall [action/behavior].
```

### Unwanted Behavior (Error)
```
If [error condition],
then the [System] shall [error handling action]
[and notify/log/recover].
```

### Optional Feature
```
Where [feature is enabled],
the [System] shall [action/behavior].
```

## Specification YAML Structure

```yaml
specifications:
  - id: {CLASS}-{NNN}
    method: methodName
    type: event-driven|state-driven|unwanted|optional
    ears: |
      EARS statement here (English)
    ears_ja: |
      EARS文をここに記述（日本語）
    preconditions:
      - Condition 1 (English)
      - Condition 2
    preconditions_ja:
      - 条件1（日本語）
      - 条件2
    postconditions:
      success:
        - Success outcome 1 (English)
        - Success outcome 2
      error:
        - Error outcome 1
    postconditions_ja:
      success:
        - 成功時の結果1（日本語）
        - 成功時の結果2
      error:
        - エラー時の結果1
    edge_cases:
      - description: Edge case description (English)
        expected: Expected behavior
    edge_cases_ja:
      - description: エッジケースの説明（日本語）
        expected: 期待される挙動
    test_cases:
      - methodName_GivenScenario_ShouldExpectedResult
    test_cases_ja:
      - methodName_条件の説明_期待される結果
```

## Output

Updated specification file:
```
docs/specs/{feature}/{ClassName}_spec.yaml
```

## Checklist

Before completing the refinement:

- [ ] All public methods have specifications
- [ ] Each spec has at least one precondition (or explicitly "None")
- [ ] Each spec has success and error postconditions
- [ ] Edge cases for null/empty inputs are documented
- [ ] Error handling for network/auth failures is documented
- [ ] Test case names follow naming convention
- [ ] EARS statements are grammatically correct
- [ ] **All `_ja` fields are present** (ears_ja, preconditions_ja, postconditions_ja, edge_cases_ja, test_cases_ja)
- [ ] **Japanese translations are accurate and consistent**
- [ ] Spec file is valid YAML

## References

- EARS format: docs/TEST_PLAN.md Section 7
- Spec extraction: `.claude/skills/spec-extracting/SKILL.md`
- Test generation: `.claude/skills/test-generating/SKILL.md` (if exists)
