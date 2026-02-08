# AGENTS.md: AI Contributor and Code Automation Guide

Welcome, agentic contributors! This document prescribes the build/test/linting process, code style, architectural boundaries, and review/commit guidelines for all agents (and developers) working in this repository. It is **mandatory reading** for agents operating here, including Copilot and similar LLM-based tools.

---

## 1. Build, Lint, and Test Commands

All code must be built, linted, and tested with full compliance to these steps:

### Build/Run

- **Install:**
  - `bun install` (preferred) or `npm install`
- **Dev:**
  - `bun run dev` or `npm run dev`
- **Build:**
  - `bun run build` or `npm run build`
- **Start:**
  - `bun run start` or `npm run start`

### Lint/Format

- **Lint:**
  - `npm run lint` (uses Next.js+ESLint rules)
- **Format All:**
  - `npx prettier --write .`
- **Pre-commit Hooks:**
  - On commit, Husky + lint-staged auto-run on `*.js,*.ts,*.tsx,*.jsx`:
    - `prettier --write`
    - `next lint --fix`

### Test/Coverage

- **Run All Tests:**
  - `npm test` or `npx vitest run`
- **Test Coverage:**
  - `npm test -- --coverage` or `npx vitest run --coverage`
- **Run Single Test File:**
  - `npx vitest run path/to/file.test.ts`

> **Note:** All PRs/commits must **pass lint, format, and tests**. Pre-commit hooks and CI checks are strictly enforced.

---

## 2. Code Style and Architectural Rules

### 2.1 Formatting (Prettier, Tailwind)

- **Enforced via `.prettierrc` and Prettier plugin:**
  - Max line width: 80
  - Use semicolons
  - Single quotes
  - Tab width: 2
  - Trailing commas: always
  - Tailwind CSS class order handled by `prettier-plugin-tailwindcss`
- **Command:** `npx prettier --write .`

### 2.2 Linting (ESLint)

- Uses Next.js+Prettier configs with plugins for TypeScript, React, order, accessibility.
- **No unused imports/variables allowed.**
- **Command:** `npm run lint` or via Husky on commit

### 2.3 Typing and Naming

- **TypeScript (`.ts/.tsx`) throughout;** no `any` in new/changed code
- **Filenames:** camelCase (except React components: PascalCase)
- **Types/Interfaces/Components:** PascalCase
- **Variables/functions:** camelCase
- **File placement:**
  - `lib/` for pure logic/core/domain/data
  - `components/` for React UI
  - `app/` for Next.js app routes/APIs
- **Absolute imports** (`@/lib/…`) preferred over long relative paths
- Import order:
  1. External packages
  2. Internal aliases (`@/…`)
  3. Relative imports

### 2.4 Functions & Error Handling

- Functions should be pure and unit-testable where possible
- All exported symbols **must** have explicit return and param types
- **No silent failure:** Always propagate or explicitly handle errors
- Use well-typed error objects; never throw raw strings
- Async code must handle and propagate errors/rejections

### 2.5 Comments, Docs, and Test Coverage

- Public/exported functions **require JSDoc/TSDoc** style summaries
- Inline comments: Only for non-obvious logic, not restating code
- New logic must be test-driven (write failure case first), especially for critical paths (`lib/`)
- **Test/coverage requirements:** Coverage cannot regress on PR/commit

### 2.6 Data Safety & Loading

- All data ingest (esp. new Pokémon/moves/rankings) **must** use safe, typed loader utilities (see `lib/data/`)
- New entries **must** be validated for uniqueness, reference validity, etc.—never inject directly

---

## 3. Copilot/AI Developer Rules

- Prefer clarity and explicitness over brevity.
- Always suggest strict typing in TypeScript, never use implicit `any`/`unknown` without explanation.
- Document intent for every new class/function, especially if logic is not self-explanatory.
- Favor small, composable, functional modules over large, tightly-coupled files.
- Test logic at the lowest practical unit. Prefer pure functions and stateless modules for critical logic.
- Surface architectural concerns: if rewriting/refactoring, clearly state your plan first, preserve Clean Architecture (core logic in `lib/`, APIs/UI as thin adapters).
- If a data update or new dependency is required, **describe the workflow in PRs or commit messages** (see contributing section in README).

---

## 4. Git Workflow (Mandatory)

- Branch names: `<type>/<scope>-shortdescription` (types: feat|fix|chore|docs|refactor)
- Commits: Conventional (`type(scope): summary`) — see skill/git-manager for details
- Atomic commits: Prefer many small, working commits over big ones
- All PRs must be reviewed and must **not** decrease test coverage or style compliance

---

## 5. Referenced Config Files

- `.prettierrc` — Prettier config and plugins
- `.eslintrc|eslint.config.js|mjs` — ESLint config; Next.js+Prettier+TS plugins
- `.github/copilot-instructions.md` — AI/agent best practices (referenced here for completeness)
- `.opencode/skills/` — full workflow automation for formatter, test-runner, refactor-specialist, feature-implementer, git-manager
- `package.json` scripts — authoritative scripts for build/test/lint

---

## 6. Summary Checklist (Enforced)

1. Lint (`npm run lint`) and format (`npx prettier --write .`) _before each commit._
2. Tests must pass, including targeted single-file runs for new logic (`npx vitest run path/to/file.test.ts`).
3. All types explicit. No unchecked any/unknown.
4. Direct data manipulation only via loader utilities; always validate new entries.
5. Code must be organized by domain boundaries: `lib/` for logic, `components/` for UI.
6. All PRs use conventional commits and branch naming; require review.
7. Never reduce test coverage or ignore style/lint errors.

---

**Your collaboration matters. By following these standards, all agents (AI or human) deliver robust, maintainable, and high-quality contributions for the Pokémon GO PvP Team Generator.**
