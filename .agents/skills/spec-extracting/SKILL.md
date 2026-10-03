---
name: spec-extracting
description: Extracts EARS-format specifications from existing code by analyzing public methods, state properties, and behavior patterns. Use when analyzing code to generate specs, creating requirement documentation, or preparing for test generation.
disable-model-invocation: false
---

# Spec Extracting

You are extracting EARS-format specifications from existing code. This skill analyzes TypeScript route handlers, server utilities, and components to generate structured requirement specifications.

## Workflow

### Step 1: Accept Class Name as Argument

Usage: `/spec-extract <ClassName>`

Example:
```
/spec-extract BulkBonusGrant
```

If no class name is provided, ask the user which class to analyze.

### Step 2: Read the Target Class File

1. Find the source file: look the target up in `docs/test-progress.yaml` (`file:`), or search `app/api/**/route.ts`, `features/**/lib/*.ts`, and `lib/**/*.ts` for the matching name
2. Read the file content completely
3. If multiple files match, ask the user to select one

### Step 3: Extract Metadata

Create the metadata section:

```yaml
metadata:
  class: <ClassName>
  source: <relative/path/to/file.ts>
  version: "1.0"
  created_at: "<YYYY-MM-DD>"
```

### Step 4: List Dependencies

Analyze imports and constructor parameters:

```yaml
dependencies:
  repositories:
    - <RepositoryName>
  services:
    - <ServiceName>
  external:
    - <External API if directly called, or "None" if wrapped>
```

**Dependency Detection:**
- Read the `import` statements (`@/lib/auth`, `@/lib/supabase/*`, `@/features/*/lib/*`)
- Check parameters passed in as dependencies
- Identify direct external calls (Supabase RPCs and tables, Stripe, Gemini / OpenAI, `fetch`)

### Step 5: Identify State Properties

For React components or hooks that hold state, extract state properties (route handlers and server utilities usually have none: write `state_properties: []`):

```yaml
state_properties:
  - name: <propertyName>
    type: <Type>
    default: <defaultValue or null>
```

**Detection Method:**
- Look for `useState` / `useReducer` calls and context values
- Extract fields with their types
- Identify initial values

### Step 6: Generate EARS Specifications

For each public method, create an EARS specification:

```yaml
specifications:
  - id: <PREFIX>-<NNN>
    method: <methodName>
    type: <ubiquitous|event-driven|state-driven|unwanted|optional>
    ears: |
      <EARS format requirement text in English>
    ears_ja: |
      <EARS形式の要件記述（日本語）>
    preconditions:
      - <condition in English>
    preconditions_ja:
      - <事前条件（日本語）>
    postconditions:
      success:
        - <outcome in English>
      error:
        - <outcome in English>
    postconditions_ja:
      success:
        - <成功時の結果（日本語）>
      error:
        - <エラー時の結果（日本語）>
    test_cases:
      - <methodName>_Given<Scenario>_Should<ExpectedResult>
    test_cases_ja:
      - <メソッド名>_<条件の説明>_<期待される結果>
```

**Note**: Both English and Japanese (`_ja`) fields are required for `ears`, `preconditions`, `postconditions`, and `test_cases`.

### EARS Types Reference

| Type | English Syntax | Japanese Syntax | Use When |
|------|----------------|-----------------|----------|
| Ubiquitous | `The system shall [action]` | `システムは[アクション]しなければならない` | Always-true invariants |
| Event-driven | `When [trigger], shall [action]` | `[トリガー]の場合、[アクション]する` | Triggered by events |
| State-driven | `While [state], shall [action]` | `[状態]の間、[アクション]する` | Dependent on current state |
| Unwanted | `If [error], then shall [action]` | `[エラー]が発生した場合、[アクション]する` | Error handling |
| Optional | `Where [feature], shall [action]` | `[機能]が有効な場合、[アクション]する` | Optional features |

### EARS Format Examples

**Event-driven (most common for public methods):**
```yaml
- id: AUTH-001
  method: signIn
  type: event-driven
  ears: |
    When signIn is invoked with valid credentials,
    the auth service shall authenticate the user
    and update isLoggedIn to true.
  ears_ja: |
    有効な認証情報でsignInが呼び出された場合、
    認証サービスはユーザーを認証し、
    isLoggedInをtrueに更新する。
  preconditions:
    - User is not currently signed in
  preconditions_ja:
    - ユーザーが現在サインインしていない
  postconditions:
    success:
      - isLoggedIn becomes true
      - account is populated
      - returns SignInStatus.success
    error:
      - isLoggedIn remains false
      - returns SignInStatus.otherError
  postconditions_ja:
    success:
      - isLoggedInがtrueになる
      - accountが設定される
      - SignInStatus.successを返す
    error:
      - isLoggedInはfalseのまま
      - SignInStatus.otherErrorを返す
  test_cases:
    - signIn_GivenValidCredentials_ShouldSetLoggedInTrue
    - signIn_GivenInvalidPassword_ShouldReturnError
    - signIn_GivenNetworkError_ShouldReturnOtherError
  test_cases_ja:
    - signIn_有効な認証情報の場合_ログイン状態がtrueになる
    - signIn_無効なパスワードの場合_エラーを返す
    - signIn_ネットワークエラーの場合_otherErrorを返す
```

**State-driven:**
```yaml
- id: AUTH-005
  method: refreshSession
  type: state-driven
  ears: |
    While the user is logged in,
    the auth service shall refresh the session token
    before it expires.
  ears_ja: |
    ユーザーがログイン中の間、
    認証サービスはセッショントークンの
    有効期限が切れる前にリフレッシュする。
  preconditions:
    - isLoggedIn is true
    - session token exists
  preconditions_ja:
    - isLoggedInがtrue
    - セッショントークンが存在する
  postconditions:
    success:
      - session token is updated
    error:
      - user is logged out if refresh fails
  postconditions_ja:
    success:
      - セッショントークンが更新される
    error:
      - リフレッシュ失敗時はユーザーがログアウトされる
  test_cases:
    - refreshSession_WhileLoggedIn_ShouldUpdateToken
    - refreshSession_WhileNotLoggedIn_ShouldDoNothing
  test_cases_ja:
    - refreshSession_ログイン中の場合_トークンを更新する
    - refreshSession_未ログインの場合_何もしない
```

**Unwanted (error handling):**
```yaml
- id: AUTH-010
  method: signIn
  type: unwanted
  ears: |
    If network error occurs during signIn,
    then the auth service shall return otherError status
    and not modify the logged-in state.
  ears_ja: |
    signIn中にネットワークエラーが発生した場合、
    認証サービスはotherErrorステータスを返し、
    ログイン状態を変更しない。
  preconditions:
    - Network is unavailable
  preconditions_ja:
    - ネットワークが利用不可
  postconditions:
    error:
      - isLoggedIn remains unchanged
      - error message is set
  postconditions_ja:
    error:
      - isLoggedInは変更されない
      - エラーメッセージが設定される
  test_cases:
    - signIn_IfNetworkError_ShouldReturnOtherError
  test_cases_ja:
    - signIn_ネットワークエラーが発生した場合_otherErrorを返す
```

### Step 7: Output Specification File

Save to: `docs/specs/{feature}/{class}_spec.yaml`

**Feature Detection:**
- Route handlers: `app/api/admin/...` -> feature = `admin`; other routes -> `api`
- Feature modules: `features/{feature}/` -> feature = `{feature}`
- Shared utilities: `lib/` -> feature = `lib`

### Prefix Convention

Use an uppercase abbreviation of the target name. Existing examples:

| Target | Prefix |
|------------|--------|
| BulkBonusGrant | BBG |
| AdminGenerateWebPByIdRoute | AGWPI |
| CommentDeleteRoute | CDR |
| ContactRoute | CONTACT |

Check `docs/specs/` for an existing prefix before choosing one, so prefixes stay unique.

## Output Template

```yaml
# docs/specs/{feature}/{class}_spec.yaml

metadata:
  class: <ClassName>
  source: <relative/path/to/file.ts>
  version: "1.0"
  created_at: "<YYYY-MM-DD>"

dependencies:
  repositories:
    - <RepositoryName>
  services:
    - <ServiceName>
  external:
    - <ExternalDependency or None>

state_properties:
  - name: <propertyName>
    type: <Type>
    default: <defaultValue>

specifications:
  - id: <PREFIX>-001
    method: <methodName>
    type: <ears-type>
    ears: |
      <EARS format text in English>
    ears_ja: |
      <EARS形式の要件記述（日本語）>
    preconditions:
      - <condition in English>
    preconditions_ja:
      - <事前条件（日本語）>
    postconditions:
      success:
        - <outcome in English>
      error:
        - <outcome in English>
    postconditions_ja:
      success:
        - <成功時の結果（日本語）>
      error:
        - <エラー時の結果（日本語）>
    test_cases:
      - <test_case_name>
    test_cases_ja:
      - <テストケース名（日本語）>
```

## Checklist Before Completion

- [ ] All public methods have specifications
- [ ] Each spec has a unique ID with correct prefix
- [ ] EARS type is appropriate for the method
- [ ] Preconditions and postconditions are complete
- [ ] Test cases follow naming convention: `Method_GivenScenario_ShouldResult` (English) / `メソッド名_条件_期待結果` (Japanese)
- [ ] Both `test_cases` and `test_cases_ja` are present
- [ ] Output file saved to correct location
- [ ] Dependencies correctly identified

## References

- TEST_PLAN.md Section 7: EARS format and specification structure
- TEST_PLAN.md Section 8.5: /spec-extract skill usage
- EARS Paper: https://ieeexplore.ieee.org/document/5328509
