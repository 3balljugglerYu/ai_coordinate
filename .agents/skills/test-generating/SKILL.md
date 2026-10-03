---
name: test-generating
description: Generates test code from EARS specifications following London School (mockist) approach. Use when creating tests from specs, implementing test cases, or generating test scaffolds.
disable-model-invocation: false
---

# Test Generating

You are generating test code from EARS specifications. This skill creates structured test files using the London School (mockist) approach with Arrange-Act-Assert pattern.

## Workflow

### Step 1: Accept Class Name as Argument

Usage: `/test-generate <ClassName>`

Example:
```
/test-generate BulkBonusGrant
```

If no class name is provided, ask the user which class to generate tests for.

### Step 2: Read the Specification File

1. Look for the spec file:
   ```
   docs/specs/{feature}/{class}_spec.yaml
   ```
2. Take the feature from the source path (`features/{feature}/`, `app/api/{route}/`, or `lib/` for shared utilities).
3. If spec file not found, suggest running `/spec-extract <ClassName>` first

### Step 3: Determine Output Location

Based on target type, determine the test file location:

| Target Type | Test Location |
|------------|---------------|
| API Route | `tests/integration/api/{target}.test.ts` |
| Feature module | `tests/unit/features/{feature}/{target}.test.ts(x)` |
| Component | `tests/unit/components/{target}.test.tsx` |
| Server Utility | `tests/unit/lib/{target}.test.ts` |

### Step 4: Generate the Test File

Use `tests/integration/api/admin-bonus-bulk.test.ts` (generated from `docs/specs/admin/bulk_bonus_grant_spec.yaml`) as the reference for structure and style. Read it before writing a new file.

- Mock every dependency listed under the spec's `dependencies` with `jest.mock("@/...")` at the top of the file, and reset mocks in `beforeEach`.
- Wrap the file in one `describe` for the target, then one `describe("{SPEC_ID} {methodName}")` per specification.
- Add `/** @jest-environment node */` on the first line for route handlers and server utilities.

### Step 5: Generate Test Methods for Each Specification

For each specification in the spec file, write one or more `test(...)` blocks inside its `describe("{SPEC_ID} {methodName}")`, each split into `// Arrange`, `// Act`, and `// Assert` sections.

- Assert on the returned value or response first (status, body).
- Assert on mock calls only for side effects the spec names (an RPC call, an audit log, a cache revalidation).

### Step 6: Apply Test Naming Convention

Test method names follow the pattern using Japanese from spec file:
```
{methodName}_{preconditions_jaから条件}_{postconditions_jaから結果}
```

Use the spec file's `preconditions_ja` and `postconditions_ja` to generate readable Japanese test names.

Examples:
- `bulkLookup_有効なメール配列の場合_usersとnot_foundを返す`
- `bulkLookup_未認証管理者の場合_401を返す`
- `bulkLookup_RPCエラーの場合_500を返す`

### Step 7: Keep Specification Traceability

The spec ID in each `describe` title is the link between the spec and the test; `/spec-verify` matches on it. Keep exactly one `describe` per spec ID.

## Checklist Before Completion

- [ ] All specifications have corresponding test methods
- [ ] Test file placed in correct location based on target type
- [ ] Each test follows `Method_{条件の日本語}_{結果の日本語}` naming
- [ ] Arrange-Act-Assert sections are clearly commented
- [ ] Each spec ID appears in exactly one `describe` title
- [ ] Every dependency in the spec is mocked with `jest.mock`

## Post-Generation Steps

After generating the test file:

1. Run the tests:
   ```bash
   npx jest {test_file_path}
   ```

2. Fix any import issues or missing mocks

3. Verify coverage with `/spec-verify`

## References

- `docs/TEST_PLAN.md` Section 6: Test writing rules (6.1 Unit, 6.2 Integration)
- `tests/integration/api/admin-bonus-bulk.test.ts`: Reference test generated from a spec
