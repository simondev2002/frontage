# Unit economics

Prices from the Anthropic price list (September 2026), per million tokens:

| Model | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| Claude Opus 5 (default) | $5.00 | $25.00 | $6.25 | $0.50 |
| Claude Sonnet 5 (optional for edits) | $2.00 | $10.00 | $2.50 | $0.20 |
| Claude Haiku 4.5 (moderation) | $1.00 | $5.00 | $1.25 | $0.10 |

The server records real token usage and cost for every call in the `ai_calls` table and per user per month in `usage`. `GET /api/admin/stats` shows the month's spend by call type. Replace the estimates below with those numbers once you have traffic.

## Measured on 6 September 2026 (Opus 5, real calls)

| Operation | Time | Tokens | Cost |
|---|---|---|---|
| First generation, bakery brief with 2 photos | 36 s | 4.3k input + 8.4k cached system prompt, 2.8k output (633 thinking) | $0.14 |
| First generation, barber brief, no photos (through the API job) | 34 s | similar | ≈ $0.12 |
| Chat edit ("bolder, add an FAQ") | 11 s | spec + cached prompt, ≈ 1.5k output | $0.09 |
| Moderation (Haiku) | 3 s | ≈ 3k input | < $0.01 |

These are lower than the estimates below, which stay as a conservative planning basis. Note: the site schema is too large for the API's constrained-decoding grammar, so generation and edits run in "plain JSON" mode (schema in the cached system prompt, validated locally). The 8.4k-token system prompt is cached after the first call of each 5-minute window.

## Cost per AI operation (Opus 5)

**First generation (the expensive one)**
- System prompt ≈ 2,500 tokens, cached after the first call: $0.001
- Brief text ≈ 600 tokens: $0.003
- Photos: an image resized to 1600px on the long edge costs roughly 2,500 tokens; 8 photos ≈ 20,000 tokens: $0.10
- Output: site spec ≈ 6,000-8,000 tokens plus adaptive thinking at effort "high" ≈ 2,000-5,000 tokens: $0.20-0.32
- **Total ≈ $0.30-0.45 with photos, ≈ $0.20 without**

**One chat edit**
- System prompt cached: $0.001
- Current spec ≈ 6,000 tokens + short history: $0.035
- Output: ops ≈ 400-1,200 tokens plus thinking at effort "medium": $0.02-0.05
- **Total ≈ $0.05-0.09 on Opus 5, ≈ $0.02-0.04 on Sonnet 5** (`AI_EDIT_MODEL=claude-sonnet-5`)

**Moderation before publish** (Haiku): ≈ $0.003.

Hosting: static HTML rendered on the fly and cached; images from disk. A small VPS (2 vCPU, 4 GB, ~$10-15/month) comfortably serves a few thousand sites. Budget ≈ $0.05 per site per month at scale, plus ~$0.01 for email.

## Per subscriber per month

| | Starter $9.99 | Business $19.99 |
|---|---|---|
| Net after Apple 15% (Small Business Program) | $8.49 | $16.99 |
| Net after Apple 30% | $6.99 | $13.99 |
| Typical AI use (1 regeneration every ~3 months, 15-25 edits) | $1.20-2.20 | $2.00-3.50 |
| Hosting + email | $0.06 | $0.10 |
| **Typical gross margin (15% tier)** | **≈ 75-85%** | **≈ 80-88%** |
| Worst case at the plan cap (40 / 120 edits on Sonnet 5, about $0.08 each) | $3.20 | $9.60 |

The caps are the guardrail: a customer who hits the cap on Opus 5 costs more than they pay that month, but very few owners make 150 edits a month, and the caps reset. If measured usage skews heavy, the two knobs are `AI_EDIT_MODEL=claude-sonnet-5` (cuts edit cost by ~60% with little visible quality loss on edits) and lowering `STARTER_EDITS`/`BUSINESS_EDITS`. Keep Opus 5 for generation: the first impression is the product.

## Free preview

`FREE_FIRST_GENERATION=true` gives every sign-up one generation before paying; edits and publishing need a plan (`FREE_EDITS=0`). Cost ≈ $0.10-0.15 per sign-up on Opus 5. At a 15% free→paid conversion that is under $1 of AI cost per paying customer. There is no free trial at launch, but a 20% off first month introductory offer (about $2 to $4 of revenue given up per new subscriber, once); if sign-up abuse appears, set `FREE_FIRST_GENERATION=false`.

## Break-even sketch

Fixed costs: server $15, domain + wildcard DNS (Cloudflare) $0-10, Apple developer $8/month, email $0-20. Roughly $40-50/month. Eleven Starter subscribers cover it. At 300 subscribers (say 70% Starter, 30% Business) monthly gross revenue is ≈ $3,900, Apple takes ≈ $585, AI ≈ $500-700, infrastructure ≈ $100: about $2,500 a month net before your time.
