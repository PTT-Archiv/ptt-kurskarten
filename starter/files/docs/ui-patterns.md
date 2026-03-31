# UI Patterns

## Core UI posture

- Prefer simple, explicit UI state over clever abstractions.
- Keep feature shells responsible for layout and leaf components responsible for rendering.
- Keep shells and facades thin. Let child components own their markup, styles, and local interaction states instead of styling or coordinating them from a monolithic parent.
- Reuse semantic tokens before introducing one-off colors, spacing, or elevation values.
- Promote repeated UI patterns into shared primitives only when they are truly reused across features. Do not use a global primitive layer as a substitute for clear ownership.
- Centralize rhythm in tokens and primitives, but keep exact geometry local when it is specific to a map, panel, overlay, or single feature context.

## Angular template patterns

- Prefer native control flow with `@if`, `@for`, and `@switch`.
- Bind classes and styles explicitly instead of using `ngClass` or `ngStyle`.
- Keep templates declarative. Move multi-step conditionals and transforms into computed state or helpers.

## Component patterns

- Split components by responsibility, not only by file length.
- Refactor when ownership becomes unclear or when the same pattern is implemented in multiple feature components, even if file size still looks acceptable.
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
