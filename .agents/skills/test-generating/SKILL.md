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
/test-generate AuthViewModel
```

If no class name is provided, ask the user which class to generate tests for.

### Step 2: Read the Specification File

1. Look for the spec file:
   ```
   docs/specs/{feature}/{class}_spec.yaml
   ```
2. Extract feature from class type:
   - ViewModel: feature from `lib/ui/{feature}/`
   - Repository: use class context (e.g., `live_view` for LiveViewRepository)
   - Service: use class context (e.g., `analytics` for AnalyticsService)
3. If spec file not found, suggest running `/spec-extract <ClassName>` first

### Step 3: Determine Output Location

Based on class type, determine the test file location:

| Class Type | Test Location |
|------------|---------------|
| ViewModel | `test/unit_tests/ui/{feature}/{class}_test.dart` |
| Repository | `test/unit_tests/domain/repository/{class}_test.dart` |
| Service | `test/unit_tests/service/{class}_test.dart` |

### Step 4: Generate Test File Structure

Create the test file with the following structure:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

// Import target class
import 'package:live_view/{path_to_class}.dart';

// Import dependencies for mocking
import 'package:live_view/{path_to_dependency}.dart';

// Import test helpers
import '../../../mocks/mock_locator.dart';
import '../../../helpers/test_listener.dart';

@GenerateMocks([
  // List all dependencies to mock
])
import '{class}_test.mocks.dart';

@Tags(['unit', '{SPEC_PREFIX}'])
void main() {
  // Declare mocks
  late Mock{Dependency} mock{Dependency};
  late {ClassName} viewModel;

  setUp(() async {
    // Initialize mocks
    mock{Dependency} = Mock{Dependency}();

    // Setup mock locator
    await setupMockLocatorForTest(
      {dependency}: mock{Dependency},
    );
  });

  tearDown(() async {
    await locator.reset();
  });

  // Test groups for each specification
}
```

### Step 5: Generate Test Methods for Each Specification

For each specification in the spec file, generate test methods:

```dart
group('{SPEC_ID} {methodName}', () {
  test('{methodName}_{条件の日本語}_{結果の日本語}', () async {
    // ============================================================
    // Arrange: Set up test preconditions
    // ============================================================
    when(mock{Dependency}.{method}(any))
        .thenAnswer((_) async => {expectedValue});

    // ============================================================
    // Act: Execute the method under test
    // ============================================================
    viewModel = {ClassName}();
    final result = await viewModel.{methodName}();

    // ============================================================
    // Assert: Verify the results
    // ============================================================
    // State assertions (primary)
    expect(result, equals({expectedValue}));
    expect(viewModel.state.{property}, {matcher});

    // Interaction assertions (for side effects only)
    verify(mock{Dependency}.{method}(any)).called(1);
  }, tags: ['{SPEC_ID}']);
});
```

### Step 6: Apply Test Naming Convention

Test method names follow the pattern using Japanese from spec file:
```
{methodName}_{preconditions_jaから条件}_{postconditions_jaから結果}
```

Use the spec file's `preconditions_ja` and `postconditions_ja` to generate readable Japanese test names.

Examples:
- `signIn_有効な認証情報の場合_成功を返す`
- `signIn_無効なパスワードの場合_エラーを返す`
- `fetchAccount_ネットワークエラーの場合_nullを返す`

### Step 7: Add Specification Tags

Add tags for traceability:

```dart
@Tags(['unit', '{SPEC_PREFIX}'])  // File level
void main() {
  group('{SPEC_ID} {methodName}', () {  // Group level
    test('{testName}', () async {
      // Spec: {SPEC_ID}  // Comment
      ...
    }, tags: ['{SPEC_ID}']);  // Test level
  });
}
```

## Test Template for Different Class Types

### ViewModel Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import 'package:live_view/ui/{feature}/{class}.dart';
import 'package:live_view/ui/{feature}/{class}_state.dart';
import 'package:live_view/domain/repository/{repository}.dart';
import 'package:live_view/di/locator.dart';

import '../../../mocks/mock_locator.dart';
import '../../../helpers/test_listener.dart';

@GenerateMocks([{Repository}, {Service}])
import '{class}_test.mocks.dart';

@Tags(['unit', '{PREFIX}'])
void main() {
  late Mock{Repository} mockRepository;
  late {ClassName} viewModel;

  setUp(() async {
    mockRepository = Mock{Repository}();
    await setupMockLocatorForTest(
      {repositoryParam}: mockRepository,
    );
  });

  tearDown(() async {
    await locator.reset();
  });

  group('{PREFIX}-001 {methodName}', () {
    test('{methodName}_成功の場合_状態を更新する', () async {
      // Spec: {PREFIX}-001
      // ============================================================
      // Arrange
      // ============================================================
      when(mockRepository.{method}(any))
          .thenAnswer((_) async => testData);

      // ============================================================
      // Act
      // ============================================================
      viewModel = {ClassName}();
      final result = await viewModel.{methodName}();

      // ============================================================
      // Assert
      // ============================================================
      expect(result, equals(expectedValue));
      expect(viewModel.state.{property}, isTrue);
      verify(mockRepository.{method}(any)).called(1);
    }, tags: ['{PREFIX}-001']);
  });
}
```

### Repository Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'package:live_view/domain/repository/{class}.dart';
import 'package:live_view/service/interfaces/i_dio_client.dart';
import 'package:live_view/di/locator.dart';

import '../../../mocks/mock_locator.dart';

@GenerateMocks([IDioClient, IClock])
import '{class}_test.mocks.dart';

@Tags(['unit', '{PREFIX}'])
void main() {
  late MockIDioClient mockDioClient;
  late MockIClock mockClock;
  late {ClassName} repository;

  setUp(() async {
    mockDioClient = MockIDioClient();
    mockClock = MockIClock();
    await setupMockLocatorForTest(
      dioClient: mockDioClient,
      clock: mockClock,
    );
  });

  tearDown(() async {
    await locator.reset();
  });

  group('{PREFIX}-001 {methodName}', () {
    test('{methodName}_有効なレスポンスの場合_データを返す', () async {
      // Spec: {PREFIX}-001
      // ============================================================
      // Arrange
      // ============================================================
      when(mockDioClient.get(any))
          .thenAnswer((_) async => Response(data: testData, statusCode: 200));

      // ============================================================
      // Act
      // ============================================================
      repository = {ClassName}();
      final result = await repository.{methodName}();

      // ============================================================
      // Assert
      // ============================================================
      expect(result, equals(expectedValue));
      verify(mockDioClient.get(any)).called(1);
    }, tags: ['{PREFIX}-001']);
  });
}
```

### Service Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'package:live_view/service/{class}.dart';
import 'package:live_view/service/interfaces/{interface}.dart';
import 'package:live_view/di/locator.dart';

import '../../mocks/mock_locator.dart';

@GenerateMocks([{ExternalInterface}])
import '{class}_test.mocks.dart';

@Tags(['unit', '{PREFIX}'])
void main() {
  late Mock{ExternalInterface} mockExternal;
  late {ClassName} service;

  setUp(() async {
    mockExternal = Mock{ExternalInterface}();
    await setupMockLocatorForTest(
      {externalParam}: mockExternal,
    );
  });

  tearDown(() async {
    await locator.reset();
  });

  group('{PREFIX}-001 {methodName}', () {
    test('{methodName}_成功の場合_期待する結果を返す', () async {
      // Spec: {PREFIX}-001
      // ============================================================
      // Arrange
      // ============================================================
      when(mockExternal.{method}(any))
          .thenAnswer((_) async => expectedResult);

      // ============================================================
      // Act
      // ============================================================
      service = {ClassName}();
      final result = await service.{methodName}();

      // ============================================================
      // Assert
      // ============================================================
      expect(result, equals(expectedResult));
      verify(mockExternal.{method}(any)).called(1);
    }, tags: ['{PREFIX}-001']);
  });
}
```

## Arrange-Act-Assert Pattern (from TEST_PLAN.md Section 6.3)

Each test method follows the AAA pattern:

```dart
test('methodName_{条件の日本語}_{結果の日本語}', () async {
  // ============================================================
  // Arrange: Set up test preconditions
  // ============================================================
  when(mockRepository.someMethod(any))
      .thenAnswer((_) async => expectedValue);

  // ============================================================
  // Act: Execute the method under test
  // ============================================================
  final result = await viewModel.someMethod();

  // ============================================================
  // Assert: Verify results
  // ============================================================
  // State verification (primary)
  expect(result, equals(expectedValue));
  expect(viewModel.state.someProperty, isTrue);

  // Interaction verification (for side effects only)
  verify(mockRepository.someMethod(any)).called(1);
});
```

## Checklist Before Completion

- [ ] All specifications have corresponding test methods
- [ ] Test file placed in correct location based on class type
- [ ] Each test follows `Method_{条件の日本語}_{結果の日本語}` naming
- [ ] Arrange-Act-Assert sections are clearly commented
- [ ] Tags added at file, group, and test levels
- [ ] @GenerateMocks includes all dependencies
- [ ] setUp/tearDown properly initializes and resets locator
- [ ] Run `flutter pub run build_runner build` to generate mocks

## Post-Generation Steps

After generating the test file:

1. Run build_runner to generate mocks:
   ```bash
   flutter pub run build_runner build --delete-conflicting-outputs
   ```

2. Run the tests:
   ```bash
   flutter test {test_file_path}
   ```

3. Fix any import issues or missing dependencies

4. Verify coverage with `/spec-verify`

## References

- TEST_PLAN.md Section 5.2: ViewModel test implementation procedure
- TEST_PLAN.md Section 6.3: Arrange-Act-Assert pattern
- TEST_PLAN.md Section 6.1: Test file locations
- TEST_PLAN.md Section 6.4: Traceability with tags
