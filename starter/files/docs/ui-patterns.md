# UI Patterns

## Core UI posture

- Prefer simple, explicit UI state over clever abstractions.
- Keep feature shells responsible for layout and leaf components responsible for rendering.
- Reuse semantic tokens before introducing one-off colors, spacing, or elevation values.

## Angular template patterns

- Prefer native control flow with `@if`, `@for`, and `@switch`.
- Bind classes and styles explicitly instead of using `ngClass` or `ngStyle`.
- Keep templates declarative. Move multi-step conditionals and transforms into computed state or helpers.

## Component patterns

- Split components by responsibility, not only by file length.
- Use container or facade components for orchestration and data composition.
- Keep presentational components input-driven and event-driven.
- Prefer `input()` and `output()` APIs over decorator-based bindings.

## Forms and interaction

- Use reactive forms for non-trivial forms.
- Validate close to the form model and surface errors consistently.
- Keep loading, empty, error, and success states explicit in the UI.

## Accessibility patterns

- Use semantic HTML first.
- Every interactive control needs an accessible name.
- Preserve visible focus styles and keyboard reachability in all themes.
- Treat accessibility regressions as functional regressions, not polish issues.
