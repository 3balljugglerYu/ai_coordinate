---
name: interface-creating
description: Creates interfaces to abstract external dependencies for testability. Use when wrapping Amplify, Firebase, Platform APIs, or other external dependencies.
disable-model-invocation: false
---

# Interface Creating

Creates interfaces to wrap external dependencies (Amplify, Firebase, Platform APIs, etc.) for testability.

## Prerequisites

Before creating an interface, ensure:
1. **Characterization tests exist** for the class that depends on the external service
2. Run characterization tests after interface creation to verify behavior preservation

If characterization tests don't exist, use `/char-test ClassName` first.

## Workflow

### Step 1: Accept Interface Name

The skill accepts an interface name as an argument:

```bash
/interface-create IAuthService
```

### Step 2: Identify External Dependency

Analyze the external dependency being wrapped:
- Amplify Auth, Storage, Analytics
- Firebase Analytics, Crashlytics
- Platform APIs (Geolocator, SharedPreferences)
- System APIs (DateTime, Timer, File)

### Step 3: Create Interface File

Create interface at `lib/service/interfaces/{interface_name}.dart`:

```dart
// lib/service/interfaces/i_auth_service.dart

/// Interface for authentication operations.
/// Wraps Amplify.Auth for testability.
abstract interface class IAuthService {
  /// Signs in a user with email and password.
  Future<SignInResult> signIn({
    required String email,
    required String password,
  });

  /// Signs out the current user.
  Future<void> signOut();

  /// Fetches the current authentication session.
  Future<AuthSession> fetchAuthSession();

  // ... other methods
}
```

### Step 4: Create Implementation Wrapper

Create wrapper at `lib/service/impl/{implementation_name}.dart`:

```dart
// lib/service/impl/amplify_auth_service.dart

import 'package:amplify_flutter/amplify_flutter.dart';
import '../interfaces/i_auth_service.dart';

/// Production implementation of [IAuthService] using Amplify.
class AmplifyAuthService implements IAuthService {
  @override
  Future<SignInResult> signIn({
    required String email,
    required String password,
  }) async {
    return Amplify.Auth.signIn(username: email, password: password);
  }

  @override
  Future<void> signOut() async {
    await Amplify.Auth.signOut();
  }

  @override
  Future<AuthSession> fetchAuthSession() async {
    return Amplify.Auth.fetchAuthSession();
  }
}
```

### Step 5: Update locator.dart

Add interface registration to `lib/locator.dart`:

```dart
import 'service/interfaces/i_auth_service.dart';
import 'service/impl/amplify_auth_service.dart';

Future<void> setupLocator() async {
  await locator.reset();

  locator
    // Add interface registration
    ..registerLazySingleton<IAuthService>(AmplifyAuthService.new)
    // ... existing registrations
}
```

### Step 6: Update Dependent Classes

Update classes to use the interface instead of direct dependency:

```dart
// Before
class AuthViewModel {
  Future<void> signIn(String email, String password) async {
    await Amplify.Auth.signIn(username: email, password: password);
  }
}

// After
class AuthViewModel {
  final IAuthService _authService;

  AuthViewModel({IAuthService? authService})
      : _authService = authService ?? locator<IAuthService>();

  Future<void> signIn(String email, String password) async {
    await _authService.signIn(email: email, password: password);
  }
}
```

### Step 7: Verify Behavior Preservation

Run characterization tests to verify the refactoring didn't break behavior:

```bash
flutter test test/characterization/{feature}/
```

## Interface Priority Reference

Based on TEST_PLAN.md section 4.1:

### Phase 0: Characterization Test Foundation (Create First)

| Interface | Wraps | Purpose |
|-----------|-------|---------|
| IClock | DateTime.now() | Eliminate time dependency |
| IDioClient | Dio | Eliminate network dependency |
| IPreferencesProvider | SharedPreferences | Mock local storage |

### Phase A: Highest Priority (Test Foundation)

| Interface | Wraps | Impact |
|-----------|-------|--------|
| IAuthService | Amplify.Auth.* | AuthViewModel |
| IAuthSessionProvider | Amplify.Auth.fetchAuthSession() | Interceptors |
| ISecureStorageProvider | FlutterSecureStorage | SecureRepository |

### Phase B: High Priority (Core Features)

| Interface | Wraps | Impact |
|-----------|-------|--------|
| IAnalyticsService | FirebaseAnalytics | All ViewModels |
| ILocationProvider | Geolocator | LocationService |
| IFileService | File, Directory | HomeViewModel |

### Phase C: Medium Priority (UI/UX)

| Interface | Wraps |
|-----------|-------|
| INavigationService | Navigator |
| IDialogService | showDialog() |
| ISnackBarService | ScaffoldMessenger |
| IPermissionService | PermissionHelper |

### Phase D: Low Priority (Supporting Features)

| Interface | Wraps |
|-----------|-------|
| IMapControllerFactory | GoogleMapController |
| IVideoPlayerFactory | VideoPlayerController |
| IPlatformProvider | Platform.isIOS/Android |

## Example: IClock Interface

Simple but essential for deterministic tests:

```dart
// lib/service/interfaces/i_clock.dart
abstract interface class IClock {
  DateTime now();
}

// lib/service/impl/system_clock.dart
class SystemClock implements IClock {
  @override
  DateTime now() => DateTime.now();
}

// In tests
class MockIClock extends Mock implements IClock {}

when(mockClock.now()).thenReturn(DateTime(2025, 1, 30, 12, 0, 0));
```

## Checklist

- [ ] Characterization tests exist for dependent class
- [ ] Interface file created at `lib/service/interfaces/`
- [ ] Implementation wrapper created at `lib/service/impl/`
- [ ] `lib/locator.dart` updated with interface registration
- [ ] Dependent classes updated to use interface
- [ ] Characterization tests pass (behavior preserved)

## Output Summary

After running this skill, display:
1. Created files (interface, implementation)
2. Modified files (locator.dart, dependent classes)
3. Reminder to run characterization tests

## References

- TEST_PLAN.md Section 4.1: Required Interfaces
- TEST_PLAN.md Section 8.4: /interface-create Usage
- Appendix D: Full Interface List (26 interfaces)
