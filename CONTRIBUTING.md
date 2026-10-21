# Contributing to Lire

Thanks for helping make Lire better. The project is in an early stage, so focused issues and small, reviewable pull requests are especially useful.

## Before you start

- Check existing issues and pull requests before starting overlapping work.
- For a substantial feature, open an issue or discussion first so the product scope can be agreed on.
- Keep changes focused on reading, library management, reliability, accessibility, or privacy.
- Do not add analytics, advertising, accounts, or third-party data sharing without an explicit product decision.

## Development

The mobile app is in apps/mobile.

~~~
cd apps/mobile
npm install
npx expo start
npx expo lint
npx tsc --noEmit
~~~

Use npx expo install when adding an Expo or React Native native dependency so its version matches the project's Expo SDK. Do not hand-edit generated ios/ or android/ directories.

## Pull requests

Include a short description of the user-facing change and the platforms you checked. Note any data-model or migration changes. Never include real personal reading data, credentials, signing keys, or environment files in a pull request.
