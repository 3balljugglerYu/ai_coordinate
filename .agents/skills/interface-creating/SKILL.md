---
name: interface-creating
description: Creates interfaces to abstract external dependencies for testability. Use when wrapping Supabase, Stripe, Gemini / OpenAI image APIs, email, fetch, or other external dependencies behind a boundary module.
disable-model-invocation: false
---

# Interface Creating

Moves direct calls to an external dependency (an SDK, `fetch` to a third-party API, `Date.now()`) behind a small TypeScript interface, so tests can replace it with a mock and the call sites stop depending on the SDK.

## Prerequisites

Before creating an interface, ensure:
1. **Characterization tests exist** for the code that calls the external service
2. Run those characterization tests after the change to verify behavior is preserved

If characterization tests don't exist, use `/char-test {Target}` first.

## Where boundaries live

`docs/TEST_PLAN.md` Section 4.2 sets the boundary for each area. Put the interface there instead of creating a new layer:

| Area | Boundary |
|---|---|
| Auth / DB | `lib/supabase/*` |
| Billing | `features/credits/lib/*` (Stripe calls) |
| Image generation | `features/generation/lib/*` |
| Notifications / email | A helper function, not a direct SDK call in the route |

## Workflow

### Step 1: Accept Interface Name

```bash
/interface-create GenerationProvider
```

### Step 2: Identify the Direct Calls

Find every place that calls the dependency directly (`grep` for the SDK import, the API host, or `fetch(`), and list the operations the callers actually use. The interface covers those operations only.

### Step 3: Create the Interface, Implementation, and Factory

Follow `features/generation/lib/nanobanana-client.ts`, which wraps the Gemini `generateContent` endpoint. Read it before writing a new one. It has three parts in one file:

- an exported `interface` with only the operations callers use (`NanobananaClient`)
- a class that implements it against the real dependency (`HttpNanobananaClient`)
- a factory that callers use, with the low-level dependency injectable (`createNanobananaClient(fetchImpl = fetch)`)

Keep secrets and environment lookups out of the interface: pass them in as parameters, or read them through `lib/env.ts` inside the implementation.

### Step 4: Update Call Sites

Replace each direct call with the factory (`createNanobananaClient()`), or accept the interface as a parameter where the caller is already a function with dependencies passed in.

### Step 5: Verify Behavior Preservation

Run the characterization tests from the prerequisite step:

```bash
npx jest tests/characterization/{area}/
```

A snapshot diff means behavior changed: fix the refactoring, or confirm with the user that the change is intended.

### Step 6: Update Progress Tracker

Set the target's `status` in `docs/test-progress.yaml` to `interface_created`.

## Checklist

- [ ] Characterization tests exist for the calling code
- [ ] Interface placed in the boundary for its area (TEST_PLAN 4.2)
- [ ] Interface lists only operations callers use
- [ ] Every direct call site now goes through the factory or the interface
- [ ] Characterization tests pass (behavior preserved)
- [ ] `docs/test-progress.yaml` updated

## Output Summary

After running this skill, display:
1. Created files (interface, implementation)
2. Modified call sites
3. Characterization test result

## References

- `docs/TEST_PLAN.md` Section 4.2: Boundary modules
- `docs/TEST_PLAN.md` Section 8.4: /interface-create usage
- `features/generation/lib/nanobanana-client.ts`: Reference boundary module
