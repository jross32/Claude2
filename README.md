# Web Scraper MCP

Local web scraping platform with three surfaces that work together:

- A browser UI for exploratory scraping and saved-session review
- A REST API for automation and wrappers
- An MCP server with 73 tools, 27 prompts, live resources, completions, logging, and subscriptions

This project is strongest when you use it as a power-user site analysis workbench rather than just a one-shot page scraper. It can discover site structure, capture REST and GraphQL traffic, inspect auth flows, extract structured business data, analyze security/privacy posture, generate code artifacts, and schedule or monitor recurring work.

## Quick Start

```bash
npm install
npm start
node mcp-server.js
```

Open:

- Landing: [http://localhost:3000](http://localhost:3000)
- Web Scraper Panel: [http://localhost:3000/wsp](http://localhost:3000/wsp)
- Live docs: [http://localhost:3000/docs](http://localhost:3000/docs)
- MCP architecture reference: [MCP.md](./MCP.md)

By default the MCP server talks to the local REST app at `http://localhost:3000`. Override with `SCRAPER_URL` if needed.

## What It Can Do

- Detect site type, auth requirements, tech stack, and likely scrape strategy before crawling
- Capture rendered pages, forms, links, images, assets, cookies, console logs, and REST/GraphQL traffic
- Extract products, deals, jobs, company info, reviews, entities, and higher-level business intelligence
- Analyze JWTs, DNS, TLS, security headers, broken links, robots.txt, sitemap coverage, and API surface area
- Generate React, CSS, Markdown, and sitemap output from saved scrapes
- Schedule recurring scrapes and monitor specific pages for changes

## Best Workflows

- Start with `detect_site` or `preflight_url` before a new scrape target
- Use `scrape_url` or `batch_scrape` to capture data, then read `scrape://save/{id}/overview`
- Use prompts such as `site_health_check`, `competitive_intel`, `security_full_audit`, and `plan_site_extraction_for_goal` when the task spans multiple tools
- Use `/docs` or `scrape://docs/tool-list` when choosing among the larger tool surface
- Call `server_info` to confirm runtime health, exposed toolset, writable directories, and environment readiness

## Testing

```bash
node tests/run.js smoke api integration unit
```

Security labs remain available separately:

```bash
node tests/run.js security
```
