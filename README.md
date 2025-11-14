# TokenID checker for Polymarket & Opinion

## 1. What are tokenIDs and why they matter
Token IDs uniquely identify market outcomes on Opinion Trade and Polymarket. They are required when you interact with public APIs—whether you are analysing the Opinion Trade points system, wiring limit-order automation, or reconciling on-chain positions. With the IDs in hand you can script requests, match payouts, and keep your tooling aligned with each contract outcome.

## 2. Install the Chrome extension
1. Clone or download this repository to your machine.
2. Open `chrome://extensions/` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project directory.
5. Confirm that the “Opinion & Polymarket Helper” icon appears in the toolbar.

## 3. Using the extension on Opinion
- Ensure the extension icon is green—this means the helper is enabled.
- When enabled, solo events show a `TopicID` badge next to the header.
- Multi events display `(topicID: ...)` inline for every child outcome.
- Click the icon to toggle the helper on or off whenever you are not on a Polymarket event page.

## 4. Using the extension on Polymarket
- Open any event page such as `https://polymarket.com/event/...`.
- Click the extension icon; it opens a new tab with the Token ID viewer.
- The viewer lists every market, outcome, and token ID, ready to copy.
- You can also paste any event slug into the viewer to fetch data directly.

## 5. Credits

- My Twitter: [@kartashovio](https://x.com/kartashovio)
- Thread about this repository: https://x.com/kartashovio/status/1989238928243667065 
- Opinion referral link: https://app.opinion.trade/?code=hIOeW6
