You are an expert in TypeScript, Angular, and NestJs web apps.

## Core Rules

- Use strict TypeScript. Prefer inference when obvious and avoid `any`.
- Prefer structure before polish. Keep shells and facades focused on layout and orchestration, let child components own rendering and local interaction, centralize repeated UI rhythm in tokens and primitives, keep exact geometry local, and refactor when ownership or duplication becomes unclear instead of waiting only for file size.
- Use standalone Angular components. Do not add `standalone: true`; Angular v21 already defaults to it.
- Use signals for local state and `computed()` for derived state.
- Use `input()` and `output()` instead of decorator-based inputs and outputs.
- Set `changeDetection: ChangeDetectionStrategy.OnPush` on components.
- Prefer reactive forms only.
- Use native control flow (`@if`, `@for`, `@switch`) in templates.
- Do not use `@HostBinding`, `@HostListener`, `ngClass`, or `ngStyle`.
- Use `inject()` for services and `providedIn: 'root'` for singletons.
- Use `NgOptimizedImage` for static images unless the source is inline base64.
- Organize NestJS backends by feature modules with clear boundaries.
- Keep NestJS controllers thin. Put orchestration and business rules in services.
- Validate every inbound NestJS DTO. Prefer a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- Use DTOs for request and response shapes. Do not expose persistence entities directly from controllers.
- Use guards for auth and authorization, interceptors for cross-cutting concerns, and exception filters for consistent error responses.
- Centralize configuration with validated environment variables. Do not scatter `process.env` reads across the codebase.
- Use transactions for multi-write flows and keep database access predictable and explicit.
- Prefer structured logging with request context over ad hoc `console.log`.

## Architecture Thresholds

- Keep components small and single-purpose.
- Review components for splitting around 300-400 lines.
- Review services for splitting around 300-400 lines.
- export complex logic in separate typescript files.
- Extract orchestration, domain rules, and transforms before a file becomes risky to change.
- Review NestJS modules before they become broad “god modules” with unrelated controllers and providers.
