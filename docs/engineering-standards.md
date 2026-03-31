# Engineering Standards

## Core posture

- Components are UI boundaries, not the architecture.
- Keep decisions local until complexity proves otherwise.
- Optimize for maintainability, fast mobile flows, and low-context refactors.

## Angular application rules

- Use feature-first folders under `src/app/features`.
- Default to standalone components and lazy-loaded feature routes.
- Use signals for local state and `computed()` for derived state.
- Use `input()` and `output()` instead of decorator-based inputs and outputs.
- Use `ChangeDetectionStrategy.OnPush` on components.
- Prefer reactive forms only.
- Keep templates declarative and use native control flow.
- Do not use `@HostBinding`, `@HostListener`, `ngClass`, or `ngStyle`.

## NestJS backend rules

- Organize backend code by feature modules, not by technical layer alone.
- Keep controllers focused on transport concerns: routing, status codes, request parsing, and delegation.
- Keep services focused on orchestration and business rules. Push framework glue and transport concerns out of them.
- Define DTOs for every public write path and validate them with a global `ValidationPipe`.
- Use `whitelist`, `forbidNonWhitelisted`, and `transform` in validation defaults unless a route has a clear reason not to.
- Do not return ORM entities directly from controllers when the API contract needs stability or redaction.
- Prefer guards for authentication and authorization, interceptors for logging/metrics/response shaping, and exception filters for consistent API errors.
- Centralize configuration with validated env-based config modules. Avoid direct `process.env` access outside configuration bootstrap.
- Make multi-step persistence flows transactional. Avoid hidden side effects across repositories or services.
- Optimize queries deliberately. Avoid N+1 patterns, over-fetching, and unbounded relation loading.
- Add unit tests for domain services and e2e tests for critical API flows, especially auth, validation, and error paths.
- Use structured logging with request context and correlation identifiers where available.

## Architecture rules

- Components should be explainable in one sentence.
- Move orchestration, domain rules, and multi-source composition out of leaf UI components.
- Facades are recommended for complex features with multiple data sources, workflows, or derived state.
- Split service responsibilities between data access, orchestration/facade state, and pure transforms/helpers.
- For NestJS, split responsibilities between controllers, application services, data access, and pure domain helpers rather than collapsing them into one provider.

## Design system

- New style work must use the semantic token layer from `apps/ptt-kurskarten-ui/src/styles/tokens.css`.
- Build UI in layers: tokens first, then shared primitives in `apps/ptt-kurskarten-ui/src/styles/primitives.css`, then feature shells, then leaf components.
- Prefer semantic primitives such as `panel-shell`, `panel-list`, `status-badge`, `meta-line`, `button`, `surface-card`, and `form-control` over feature-local base classes.
- Use feature-local classes only for ownership, geometry, and one-off behavior. Do not recreate global primitives inside feature CSS.
- Keep naming strict and readable: primitives stay semantic and reusable, feature classes stay namespaced to the feature or component and follow BEM-like ownership.
- When Admin and Viewer need the same UI shape, extract or extend the shared primitive instead of copying the pattern twice.
- Do not introduce UI-library-specific design language into feature decisions.

## Accessibility and themes

- Every feature must pass AXE and WCAG AA.
- Focus states must remain visible in both light and dark themes.
- New UI must work in both themes and keep red reserved mostly for semantic errors.

## Size thresholds

- Review components for splitting once they exceed roughly 300-400 lines.
- Review services for splitting once they exceed roughly 500-700 lines.
- Review NestJS modules for splitting once they contain multiple unrelated workflows or start sharing providers that do not belong to the same domain boundary.
- Split earlier when a file becomes hard to explain, hard to test, or risky to change.
