# Contributing to Lire

Thanks for helping make Lire better. The project is in an early stage, so focused issues and small, reviewable pull requests are especially useful.

## Before you start

- Check existing issues and pull requests before starting overlapping work.
- For a substantial feature, open an issue or discussion first so the product scope can be agreed on.
- Keep changes focused on reading, library management, reliability, accessibility, or privacy.
- Do not add analytics, advertising, accounts, or third-party data sharing without an explicit product decision.

## Development

The browser client source and build configuration are in `apps/mobile`.

```sh
cd apps/mobile
npm ci
npm run web
npm run lint
npm run typecheck
```

Use `npx expo install` when adding Expo or React Native dependencies so versions stay compatible with the project's Expo SDK.

## Pull requests

Include a short description of the user-facing change and the browser environments you checked. Note any data-model or migration changes. Never include real personal reading data, credentials, signing keys, or environment files in a pull request.
