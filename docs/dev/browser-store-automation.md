# Browser store release automation

Yomu's `Release` workflow publishes the GitHub release first, then can submit the same reviewed packages to Chrome Web Store and Firefox Add-ons.

Store submission runs automatically for semantic-major tags such as `v2.0.0`. For another release, run the workflow manually and select **Also submit this release to Chrome Web Store and Firefox Add-ons**.

The first public version must still be completed in each store dashboard. Chrome requires the listing, privacy answers, visibility, and first public submission before API publishing can follow the saved visibility. Mozilla requires two-step authentication before it will issue API credentials.

## GitHub repository settings

Add these Actions variables:

- `CHROME_WEB_STORE_PUBLISHER_ID` — the publisher ID shown in the Chrome Web Store developer settings.
- `CHROME_WEB_STORE_ITEM_ID` — the extension ID from the Chrome Web Store dashboard.

Add these Actions secrets:

- `CHROME_WEB_STORE_CLIENT_ID`
- `CHROME_WEB_STORE_CLIENT_SECRET`
- `CHROME_WEB_STORE_REFRESH_TOKEN`
- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

For Chrome, enable Chrome Web Store API v2 in a Google Cloud project, create a Web application OAuth client, and create a refresh token with the `https://www.googleapis.com/auth/chromewebstore` scope. Use the Google account that owns the store item. The workflow exchanges the refresh token, uploads the release ZIP, waits for package processing, then submits it for review.

For Firefox, create personal API credentials in the Add-on Developer Hub after two-step authentication is enabled. The workflow uses the pinned `web-ext` release and [`config/amo-metadata.json`](../../config/amo-metadata.json) to submit the readable Firefox package for review.

The jobs deliberately download artifacts from the GitHub release instead of rebuilding them. That keeps the browser stores on the same version that was checked and published on the Releases page.
