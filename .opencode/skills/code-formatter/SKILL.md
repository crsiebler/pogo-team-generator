---
name: code-formatter
description: Formats JavaScript/TypeScript code with Prettier and lints with ESLint (Next.js) for code quality; runs Husky/lint-staged pre-commit hooks
---

## What I do

- Format code using Prettier (respects .prettierrc and plugins)
- Lint code using ESLint (Next.js rules via `next lint`)
- Run pre-commit hooks via Husky and lint-staged to auto-format/lint staged files
- Validate code style and formatting compliance

## When to use me

Use this skill for formatting and linting before every commit, after large code changes, or when preparing a PR/build. Husky and lint-staged will enforce checks automatically on commit.

## Procedure

1. (Optional) Ensure correct Node version (`nvm use` if required by project)
2. Format code: `npx prettier --write .`
3. Lint code: `npm run lint`
4. On commit, Husky will run lint-staged to format and lint staged files:
   - File types: js, jsx, ts, tsx
   - Commands run: `prettier --write` and `next lint --fix`
5. Fix any issues reported by Prettier, ESLint, or the pre-commit hook

## Related Guidelines

- Follow AGENTS.md code style guidelines
- Ensure all code passes Prettier, ESLint, and pre-commit (Husky/lint-staged) checks before commit or PR
- `.prettierrc` and `eslint.config.mjs` are automatically respected
- Mandatory pre-commit/CI checks must succeed for quality
