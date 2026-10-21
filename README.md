# Lire

Lire is a calm, open-source reading companion for iOS and Android. It helps you make room for reading, keep a personal library, and see the time you spend with your books.

The first release is a free, local-first mobile app. Your library and reading history stay on your device. The initial build focuses on adding books, running a durable reading timer, and reviewing daily, weekly, and monthly reading time. Accounts, cloud sync, and Goodreads import are later milestones.

## Project status

Lire is in active development. The current build is the foundation for the offline reading loop; it is not yet a release build.

## Get started

The mobile app lives in apps/mobile.

Requirements: Node.js and npm. An iOS Simulator requires Xcode; Android development requires Android Studio and an Android SDK.

~~~
cd apps/mobile
npm install
npx expo start
~~~

Then open the project in an iOS Simulator or Android emulator. For device builds and store releases, see the [Expo EAS documentation](https://docs.expo.dev/eas/).

## Product direction

Lire is built around reading time rather than page counts or social activity. The first release is deliberately small:

- A personal library with manual book entry
- A reading timer that survives app restarts and works offline
- Daily, weekly, and monthly time summaries
- A private beta before a public release

See [the product plan](docs/product-plan.md) for the intended phases and deferred work.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Lire is released under the MIT License. See [LICENSE](LICENSE).
