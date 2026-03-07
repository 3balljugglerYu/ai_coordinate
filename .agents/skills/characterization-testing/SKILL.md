---
name: characterization-testing
description: Creates characterization tests to capture existing behavior before refactoring. Use when writing char tests, creating golden tests, preparing for refactoring, or preserving legacy code behavior.
disable-model-invocation: false
---

# Characterization Testing

You are helping the user create characterization tests that capture the current behavior of existing code before refactoring. This ensures that refactoring does not introduce regressions.

## What is Characterization Testing?

Characterization tests (also known as "Golden Master Tests" or "Snapshot Tests") record the current behavior of code, not necessarily the "correct" behavior. For legacy code with unclear specifications, the current behavior becomes the specification.

**Reference**: See `docs/TEST_PLAN.md` sections 4.3 and 8.3 for detailed patterns.

## Workflow

### Step 1: Accept Target

Accept the class name as argument:
- `/char-test AuthViewModel` - for ViewModel/Repository/Service
- `/char-test EventPage --widget` - for Widget with golden tests

### Step 2: Read and Analyze Target Class

1. Read the target file from `lib/` directory
2. List all public methods and their signatures
3. Identify state properties (for ViewModels)
4. Note dependencies (repositories, services, external APIs)

### Step 3: Identify Input Patterns

For each public method, identify test scenarios:

| Pattern | Description | Example |
|---------|-------------|---------|
| Normal | Valid inputs | `signIn(valid_email, valid_password)` |
| Error | Invalid/malformed inputs | `signIn("", "")` |
| Boundary | Edge cases | `signIn(max_length_email, min_password)` |
| Null | Nullable parameters | `fetchData(null)` |

### Step 4: Generate Test Code

#### For ViewModel/Repository/Service (ApprovalTests)

Generate test file at: `test/characterization/{feature}/{class}_char_test.dart`

```dart
import 'package:approval_tests/approval_tests.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

// Import target class
import 'package:live_view/ui/{feature}/{class}.dart';

// Import mocks
import '../../../mocks/mock_locator.dart';

@GenerateMocks([/* dependencies */])
import '{class}_char_test.mocks.dart';

@Tags(['characterization'])
void main() {
  group('Characterization: {ClassName}', () {
    late {ClassName} target;
    late MockIClock mockClock;
    late MockIDioClient mockDioClient;

    setUp(() async {
      mockClock = MockIClock();
      mockDioClient = MockIDioClient();

      // Fix time for deterministic tests
      when(mockClock.now()).thenReturn(DateTime(2025, 1, 30, 12, 0, 0));

      // Return recorded responses
      when(mockDioClient.get(any)).thenAnswer((_) async =>
        Response(data: recordedApiResponse, statusCode: 200));

      await setupMockLocatorForTest(
        clock: mockClock,
        dioClient: mockDioClient,
      );

      target = {ClassName}();
    });

    tearDown(() async {
      await locator.reset();
    });

    test('CHAR-{PREFIX}-001: {methodName} states snapshot', () async {
      final results = <String>[];

      // Pattern 1: Normal case
      try {
        final result = await target.{methodName}(/* normal inputs */);
        results.add('{methodName}(normal): $result, state=${target.state}');
      } catch (e) {
        results.add('{methodName}(normal): threw $e');
      }

      // Pattern 2: Error case
      try {
        final result = await target.{methodName}(/* error inputs */);
        results.add('{methodName}(error): $result');
      } catch (e) {
        results.add('{methodName}(error): threw $e');
      }

      // Pattern 3: Boundary case
      try {
        final result = await target.{methodName}(/* boundary inputs */);
        results.add('{methodName}(boundary): $result');
      } catch (e) {
        results.add('{methodName}(boundary): threw $e');
      }

      // Compare with approved snapshot
      Approvals.verify(results.join('\n'));
    });

    test('CHAR-{PREFIX}-002: {methodName} response snapshot', () async {
      final result = await target.{methodName}(/* inputs */);

      final snapshot = {
        'result': result?.toJson(),
        'state': {
          'property1': target.state.property1,
          'property2': target.state.property2,
        },
      };

      Approvals.verifyAsJson(snapshot);
    });
  });
}
```

#### For Widget (Golden Tests)

Generate test file at: `test/characterization/widgets/{widget}_char_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Import target widget
import 'package:live_view/ui/{feature}/{widget}.dart';

// Import test helpers
import '../../helpers/test_app.dart';

@Tags(['characterization', 'golden'])
void main() {
  group('Characterization: {WidgetName}', () {
    testWidgets('CHAR-WIDGET-001: {WidgetName} loading state', (tester) async {
      await tester.pumpWidget(
        TestApp(child: {WidgetName}()),
      );

      await expectLater(
        find.byType({WidgetName}),
        matchesGoldenFile('goldens/{widget}_loading.png'),
      );
    });

    testWidgets('CHAR-WIDGET-002: {WidgetName} with data', (tester) async {
      await tester.pumpWidget(
        TestApp(
          overrides: [{provider}.overrideWith((ref) => mock{State})],
          child: {WidgetName}(),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType({WidgetName}),
        matchesGoldenFile('goldens/{widget}_loaded.png'),
      );
    });

    testWidgets('CHAR-WIDGET-003: {WidgetName} empty state', (tester) async {
      await tester.pumpWidget(
        TestApp(
          overrides: [{provider}.overrideWith((ref) => emptyMock)],
          child: {WidgetName}(),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType({WidgetName}),
        matchesGoldenFile('goldens/{widget}_empty.png'),
      );
    });

    testWidgets('CHAR-WIDGET-004: {WidgetName} error state', (tester) async {
      await tester.pumpWidget(
        TestApp(
          overrides: [{provider}.overrideWith((ref) => errorMock)],
          child: {WidgetName}(),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType({WidgetName}),
        matchesGoldenFile('goldens/{widget}_error.png'),
      );
    });
  });
}
```

### Step 5: Output Location

| Type | Output Path |
|------|-------------|
| ViewModel | `test/characterization/{feature}/{class}_char_test.dart` |
| Repository | `test/characterization/domain/repository/{class}_char_test.dart` |
| Service | `test/characterization/service/{class}_char_test.dart` |
| Widget | `test/characterization/widgets/{widget}_char_test.dart` |
| Golden files | `test/characterization/goldens/{widget}_{state}.png` |
| Approval files | `test/characterization/{feature}/{class}_char_test.{ID}.approved.txt` |

### Step 6: Provide Next Steps

After generating the test file, instruct the user:

**For ApprovalTests (ViewModel/Repository/Service):**
```bash
# 1. Run the test (first run generates .received files)
flutter test test/characterization/{feature}/

# 2. Review the .received files
# 3. If correct, rename to .approved
mv test/characterization/{feature}/{class}_char_test.CHAR-{PREFIX}-001.received.txt \
   test/characterization/{feature}/{class}_char_test.CHAR-{PREFIX}-001.approved.txt

# 4. Commit the .approved files
git add test/characterization/{feature}/*.approved.txt
```

**For Golden Tests (Widget):**
```bash
# 1. Generate golden files
flutter test --update-goldens test/characterization/widgets/

# 2. Review generated PNGs
ls test/characterization/goldens/

# 3. Commit golden files
git add test/characterization/goldens/*.png
```

### Step 7: Update Progress Tracker

**IMPORTANT**: After creating the characterization test file, you MUST update `docs/test-progress.yaml`:

1. Find the target class entry in the appropriate tier (tier1, tier2, tier3)
2. Update the following fields:
   - `status`: Change from `pending` to `char_test_created`
   - `char_test`: Set to the test file path

Example update:
```yaml
# Before
LiveViewRepository:
  status: pending
  char_test: null

# After
LiveViewRepository:
  status: char_test_created
  char_test: test/characterization/domain/repository/live_view_repository_char_test.dart
```

This step is mandatory. Do not skip it.

## Deterministic Testing Techniques

Characterization tests must produce the same output for the same input. Handle non-deterministic elements:

| Element | Solution |
|---------|----------|
| `DateTime.now()` | Mock with `IClock` interface |
| Random values | Seed fixed or mock |
| Network responses | Mock with `IDioClient` |
| File paths | Use relative or test directories |
| Platform differences | Run on CI environment (ubuntu-latest) |

## Post-Refactoring Verification

After completing the refactoring (e.g., `/interface-create`):

```bash
# Run characterization tests
flutter test test/characterization/{feature}/

# Expected results:
# - No diff = Refactoring successful
# - Diff found = Behavior changed, review and either:
#   - Fix the refactoring
#   - Approve as intentional change
```

## Checklist

Before completing characterization test generation:

- [ ] All public methods identified
- [ ] Normal, error, boundary patterns covered
- [ ] Non-deterministic elements mocked
- [ ] Test file created at correct path
- [ ] Import statements correct
- [ ] Mock generation annotations added
- [ ] Tags added (`@Tags(['characterization'])`)
- [ ] User instructed on next steps (generate/approve snapshots)
- [ ] **docs/test-progress.yaml updated** (status: char_test_created, char_test: path)

## References

- `docs/TEST_PLAN.md` section 4.3 - Characterization Test Implementation
- `docs/TEST_PLAN.md` section 8.3 - /char-test Skill Usage
- [ApprovalTests.Dart](https://github.com/approvals/ApprovalTests.Dart)
- [Flutter Golden Tests](https://api.flutter.dev/flutter/flutter_test/matchesGoldenFile.html)
