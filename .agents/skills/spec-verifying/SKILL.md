---
name: spec-verifying
description: Verifies consistency between EARS specifications and implemented tests. Use when checking test coverage, validating spec-test alignment, generating coverage reports, or auditing test completeness.
disable-model-invocation: false
---

# Spec Verifying

You are verifying consistency between EARS specifications and implemented tests. This skill cross-references spec files with test files to identify gaps and generate coverage reports.

## Workflow

### Step 1: Accept Class Name as Argument

Usage: `/spec-verify <ClassName>`

Example:
```
/spec-verify AuthViewModel
```

If no class name is provided, ask the user which class to verify.

### Step 2: Read the Specification File

1. Convert class name to path:
   - Determine feature from class name (e.g., `AuthViewModel` -> `auth`)
   - Look for spec at: `docs/specs/{feature}/{class_snake_case}_spec.yaml`

2. Read and parse the spec file
3. If spec file not found, inform the user:
   ```
   Specification file not found at docs/specs/{feature}/{class}_spec.yaml
   Please run /spec-extract {ClassName} first to generate specifications.
   ```

### Step 3: Read the Test File

1. Determine test file location based on class type:

   | Class Type | Test Location |
   |------------|---------------|
   | ViewModel | `test/unit_tests/ui/{feature}/{class_snake_case}_test.dart` |
   | Repository | `test/unit_tests/domain/repository/{class_snake_case}_test.dart` |
   | Service | `test/unit_tests/service/{class_snake_case}_test.dart` |
   | Widget | `test/widget_tests/{feature}/{widget_snake_case}_test.dart` |

2. Read the test file content
3. If test file not found, note it as "not implemented"

### Step 4: Extract Test Information

Parse the test file to extract:

1. **Test Groups**: `group('SPEC-ID description', () {...})`
2. **Test Cases**: `test('methodName_GivenScenario_ShouldResult', ...)`
3. **Tags**: `@Tags(['unit', 'AUTH-001'])` and `tags: ['AUTH-001']`
4. **Spec Comments**: `// Spec: AUTH-001`

Build a map of spec IDs to test cases:
```
AUTH-001 -> [test1, test2, test3]
AUTH-002 -> [test4]
AUTH-003 -> []  // No tests
```

### Step 5: Cross-Reference Specs and Tests

For each specification in the spec file:

1. **Check for corresponding tests:**
   - Look for tests with matching spec ID in tags
   - Look for tests with matching spec ID in comments
   - Look for tests with matching method name in test name

2. **Verify test naming convention:**
   - Pattern: `MethodName_GivenScenario_ShouldExpectedResult`
   - Flag tests that don't follow convention

3. **Check test coverage:**
   - Compare expected test cases from spec with actual tests
   - Identify missing test cases

### Step 6: Identify Orphan Tests

Find tests that don't have corresponding specs:

1. Extract all test names from test file
2. Compare with test cases listed in specs
3. List tests without spec references

### Step 7: Codex Review Integration

**重要**: Claudeが実行している場合は、Codexにもレビューを依頼すること。

#### 7.1 Codexレビュー依頼

1. `/codex` スキルを使用してCodexにレビューを依頼する
2. レビュー対象:
   - EARS形式の正確性
   - テストケースの網羅性
   - ソースコードとの整合性
   - 日本語翻訳の正確性

#### 7.2 レビュー結果の再検討

Codexのレビュー結果を受け取ったら:

1. **各指摘を個別に検証する**
   - ソースコードを読んで指摘の正確性を確認
   - Dart/Flutter固有の仕様を考慮（例：Dart 3のswitch文にfall-throughはない）

2. **必要に応じて反論する**
   - 指摘が誤りの場合、証拠を示して反論
   - Codexに再確認を求める

3. **議論を経て結論を出す**
   - 有効な指摘のみを採用
   - 無効な指摘は理由を記録して棄却

#### 7.3 バグの記録

レビューでバグが発見された場合:

1. **バグレポートファイルを作成/更新**
   - パス: `docs/specs/{feature}/{class}_bugs.md`
   - 形式:
     ```markdown
     # {ClassName} 検出バグレポート

     ## BUG-{PREFIX}-{NNN}: {タイトル}

     **対象メソッド**: {methodName}
     **該当行**: L{lineNumber}
     **重大度**: HIGH/MEDIUM/LOW

     **問題**:
     {問題の説明}

     **現在のコード動作**:
     {コードの動作}

     **期待される動作**:
     {期待される動作}

     **影響範囲**: {関連するSpec ID}
     ```

2. **仕様書にバグ参照を追加**
   - 該当する仕様に`known_bugs`フィールドを追加
   - 仕様の`postconditions`を実際の動作に合わせて更新

3. **コードは修正しない**
   - バグの修正はこのスキルの範囲外
   - バグレポートとして記録するのみ

### Step 8: Generate Coverage Report

Output the following report format:

```markdown
## {ClassName} Spec-Test Consistency Report

### Summary
| Metric | Count |
|--------|-------|
| Total Specifications | {N} |
| Expected Test Cases | {N} |
| Implemented Test Cases | {N} |
| Coverage | {X}% |

### Specification Coverage

| Spec ID | Method | Expected Tests | Implemented | Status |
|---------|--------|----------------|-------------|--------|
| AUTH-001 | signIn | 3 | 3 | COMPLETE |
| AUTH-002 | signOut | 2 | 1 | PARTIAL |
| AUTH-003 | fetchAccount | 4 | 0 | MISSING |

### Unimplemented Specifications

- **AUTH-002** signOut
  - Missing: `signOut_GivenNetworkError_ShouldReturnFalse`

- **AUTH-003** fetchAccount
  - Missing: `fetchAccount_GivenSuccess_ShouldReturnAccount`
  - Missing: `fetchAccount_GivenNotLoggedIn_ShouldReturnNull`
  - Missing: `fetchAccount_GivenNetworkError_ShouldReturnNull`
  - Missing: `fetchAccount_GivenCached_ShouldReturnCachedAccount`

### Tests Without Specifications

These tests exist but have no corresponding spec:
- `someMethod_GivenSomething_ShouldDoSomething` (consider adding spec or removing test)

### Naming Convention Violations

These tests don't follow the naming convention `Method_GivenScenario_ShouldResult`:
- `test signIn works` -> Should be: `signIn_GivenValidCredentials_ShouldSucceed`

### Recommendations

1. Run `/spec-extract {ClassName}` to update specifications
2. Run `/test-generate {ClassName}` to generate missing tests
3. Review orphan tests for removal or spec addition
```

## Output Example (from TEST_PLAN.md Section 8.6)

```
## AuthViewModel Spec-Test Consistency Report

### Summary
| Metric | Count |
|--------|-------|
| Total Specifications | 12 |
| Expected Test Cases | 24 |
| Implemented Test Cases | 20 |
| Coverage | 83.3% |

### Unimplemented Specifications
- AUTH-005: updatePassword_GivenInvalidOldPassword_ShouldReturnError
- AUTH-007: deleteAccount_GivenSuccess_ShouldLogoutAndReturnTrue
```

## Verification Rules

### Test-to-Spec Matching

A test is considered to match a spec if ANY of these conditions are true:

1. Test has `tags: ['SPEC-ID']` annotation
2. Test contains `// Spec: SPEC-ID` comment
3. Test is inside a group named with the spec ID: `group('SPEC-ID ...'`
4. Test name starts with the method name from the spec

### Coverage Calculation

```
Coverage = (Implemented Test Cases / Expected Test Cases) * 100
```

Where:
- **Expected Test Cases**: Sum of `test_cases` arrays in all specifications
- **Implemented Test Cases**: Count of tests that match a spec ID

### Status Definitions

| Status | Definition |
|--------|------------|
| COMPLETE | All expected test cases implemented |
| PARTIAL | Some but not all test cases implemented |
| MISSING | No test cases implemented |
| EXTRA | More tests than expected (may indicate spec needs update) |

## Checklist Before Completion

- [ ] Spec file was found and parsed
- [ ] Test file was found and parsed
- [ ] All spec IDs cross-referenced with tests
- [ ] Coverage percentage calculated
- [ ] Unimplemented specs listed with missing test cases
- [ ] Orphan tests identified
- [ ] Naming convention violations flagged
- [ ] Codex review requested (if not running as Codex)
- [ ] Codex review results validated and rebutted if necessary
- [ ] Discovered bugs recorded in {class}_bugs.md
- [ ] Spec updated to reflect actual code behavior for known bugs
- [ ] Recommendations provided

## References

- TEST_PLAN.md Section 8.6: /spec-verify skill usage
- TEST_PLAN.md Section 6: Test naming conventions
- TEST_PLAN.md Section 6.4: Traceability requirements
