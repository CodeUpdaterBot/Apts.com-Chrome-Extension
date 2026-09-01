# Apts.com Chrome Extension managed project

## Repository
- GitHub: https://github.com/CodeUpdaterBot/Apts.com-Chrome-Extension
- Managed path: `C:/Users/PC/Documents/Coding Projects/Apts.com-Chrome-Extension`
- Default branch: `main`
- Visibility: private
- Source seed: `C:/Users/PC/Documents/apts.com/apts-chrome-extension`
- No Vercel deployment.

## Product
Manifest V3 Chrome extension named **Apts.com Balances**. It reads the active Apartments.com Payments page and summarizes past-due rent balances.

## Verification

```bash
python -m json.tool manifest.json
node --check popup.js
```

For a manual test, follow `Install_Guide.txt` to load this folder unpacked in Chrome, then test only against an authorized Apartments.com rental-manager session.

## Safety
- Treat tenant names, balances, and payment data as confidential.
- Do not commit exports, screenshots, browser profiles, packaged `.crx` files, or signing `.pem` keys.
- Do not operate on a live Apartments.com account without explicit user authorization.

## Release workflow
1. Pull `origin/main` and work in this managed clone.
2. Validate the manifest and JavaScript.
3. Review permissions and the full diff.
4. Commit as `Steven <runcomps@gmail.com>` and push to `main` when authorized.
