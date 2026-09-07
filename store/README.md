# Store assets

- `icon-1024.png`: App Store icon (also installed in the Xcode asset catalog). Source: `icon-source.html`.
- `screenshots/iphone-6.5/`: 1284x2778 frames for the iPhone 6.5" slot in App Store Connect (reused for all iPhone sizes).
- `screenshots/iphone-6.9/`: the same frames at 1290x2796 for the 6.9" slot in Media Manager, if ever wanted.
- `tools/`: Playwright generators. Run the dev server, then from this folder:
  `npm i playwright && npx playwright install chromium`, then
  `TOKEN=<dev bearer token> HERO=835 node tools/shots.mjs screenshots` and `node tools/icon.mjs ../ios/Frontage/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`.
