# Gold Ledger PWA

This app starts with the entries from the screenshot and stores new rows in the browser. It can also append rows to a Google Sheet through a small Apps Script web app.

## Host it on GitHub Pages

Upload these files to a GitHub repository and enable GitHub Pages from the repository settings:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`
- `README.md`

The app is fully static, so GitHub Pages can host it directly.

## Google Sheet setup

1. Open the Sheet.
2. Go to Extensions > Apps Script.
3. Paste the script from `google-apps-script.gs`.
4. Change `SHEET_NAME` if your tab is not named `Sheet1`.
5. Click Deploy > New deployment.
6. Choose type: Web app.
7. Set "Execute as" to "Me".
8. Set "Who has access" to "Anyone".
9. Deploy and copy the Web app URL.
10. Paste that URL into the app's Google Sheet sync field.
11. If you change the Apps Script later, click Deploy > Manage deployments > Edit > New version > Deploy, then keep using the same web app URL.

Use **Load from Sheet** in the app when you edit dates, grams, price, or notes directly in Google Sheets and want the app to refresh its local rows. The app no longer has a bulk sync button, so it will not append old local rows back into the Sheet.

To test the deployed Apps Script URL, open it directly in a browser. It should show JSON with `"ok":true` and an `entries` list. If it asks you to sign in or says access is denied, redeploy with "Who has access" set to "Anyone".

```js
See google-apps-script.gs
```

## Manual IBJA price setup

Enter today's IBJA Gold 999 price per gram in the app.

The app keeps using your last saved manual rate until you enter a new one. If no manual rate is saved, current value and gain/loss stay blank.

IBJA rates are normally shown per 10 grams. Divide that number by 10 before entering it.

Example: if IBJA Gold 999 is `122000` per 10 grams, enter `12200`.

IBJA rates exclude GST and making charges.

Gain/loss shows both absolute return and XIRR. Absolute return ignores time. XIRR annualizes returns using each purchase date and today's current value.
