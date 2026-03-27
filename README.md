# WebScraper Pro

A full-featured web scraper with a browser-based UI. Intercepts GraphQL and REST API calls, handles authentication (including 2FA), and exports all scraped data as structured JSON.

## Features

- **GraphQL interception** — captures queries, mutations, variables, and responses
- **REST API interception** — captures all `/api/`, `/v1/`, `/v2/` calls
- **Authentication** — auto-fills login forms (username + password)
- **2FA / Verification** — supports TOTP, email code, SMS code (enter live during scrape)
- **CAPTCHA detection** — flags CAPTCHA-protected pages
- **Deep scraping** — follow internal links up to 3 levels
- **Asset capture** — collect image, script, font, and stylesheet URLs
- **JSON export** — download all scraped data as a formatted JSON file
- **Refactor scaffold** — generate a clean HTML scaffold from scraped data

## Install & Run

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000)

## Usage

1. Enter the target URL
2. Configure capture options (GraphQL, REST, assets)
3. Enable authentication if the site requires login
4. Select verification type if 2FA is used
5. Click **Start Scraping**
6. View results in the **Results**, **API Calls**, and **Assets** tabs
7. Download JSON or generate an HTML scaffold in the **Refactor** tab

## Output Structure

```json
{
  "meta": { "scrapedAt": "...", "targetUrl": "...", ... },
  "siteInfo": { "title": "...", "logoUrl": "...", "hasLoginForm": true, ... },
  "pages": [
    {
      "meta": { ... },
      "headings": { "h1": [...], "h2": [...] },
      "textBlocks": [...],
      "links": [...],
      "images": [...],
      "forms": [...],
      "tables": [...],
      "cssVariables": { "--primary": "#...", ... },
      "layoutTree": { ... },
      ...
    }
  ],
  "apiCalls": {
    "graphql": [ { "url": "...", "body": { "query": "..." }, "response": { ... } } ],
    "rest": [ { "url": "...", "method": "GET", "response": { ... } } ]
  },
  "assets": [...]
}
```
