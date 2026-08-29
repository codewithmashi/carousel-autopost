Build one Instagram carousel for @codewithmashi and queue it for the cloud publisher. Work autonomously — do not ask questions. If something is genuinely blocking, finish everything else and report what you skipped.

## Fixed values (do not guess these)
- Working root: /Users/mashi/Startup/carousels
- Netlify siteId: 2550463b-65c7-46d7-b560-f94d0a6ba639
- Public image base: https://mashi-carousels.netlify.app
- GitHub repo: codewithmashi/carousel-autopost

## 1. Read the skill first
Read ~/.claude/skills/carousel/SKILL.md, then references/channel.md (account, pillars, voice, CTA ladder) and references/design-system.md (Bold Editorial: Archivo Black, red #CE2027 on cream #F6EFD9, alternating fields).

Two rules are binding. The CTA is save + follow, never a comment keyword. And the deck must be readable by a founder with no mobile background — if a topic only makes sense to someone who writes Dart, it is the wrong topic.

## 2. Pick the topic
Read TOPICS.md and take the FIRST topic not marked [x]. Each line records how its proof slide is grounded — respect that.

Never invent a proof number. If the topic has no real figure, make the proof slide a concrete before/after or a verifiable constant, and say so in your report.

If the queue is empty, stop and report that. Do NOT auto-pick a trending topic — unreviewed posts go straight to a live account.

## 3. Build and export
Slug the topic in kebab-case. Then:
- Copy ~/.claude/skills/carousel/assets/template.html to decks/<slug>/deck.html and fill every SLOT_* placeholder.
- Grep the result for SLOT_ — any hit means an unfilled slot. Fix before continuing.
- Export: node ~/.claude/skills/carousel/scripts/export.mjs /Users/mashi/Startup/carousels/decks/<slug>/deck.html --out /Users/mashi/Startup/carousels/public/<slug>
- Check references/checklist.md.

## 4. Deploy the images
Call the Netlify MCP netlify-deploy-services-updater, operation deploy-site, with the siteId above. It returns an `npx @netlify/mcp ... --proxy-path ...` command — run that from /Users/mashi/Startup/carousels. The token is fresh each run; never reuse an old one.

That connector is flaky and intermittently returns "The connector's server isn't responding." Retry up to 4 times — it has recovered on the second and third attempt.

Then verify every slide is publicly readable:
  curl -sSL -o /dev/null -w "%{http_code} %{content_type}\n" https://mashi-carousels.netlify.app/<slug>/slide-01.png
Each must return "200 image/png". If any does not, stop and report. Never queue a post whose images fail to load.

## 5. Write the caption
Save to decks/<slug>/caption.md — the cloud publisher reads it from there, so no caption means no post.

Shape: hook line restated, 2-3 lines of real value, then "Save this ..." and "Follow @codewithmashi — ...", then 5-8 niche hashtags (#buildinpublic #indiehackers #startupfounder #mobiledev #flutterdev). Never broad tags like #startup, #coding or #apple — they rank for nothing at this account size.

## 6. Queue it and push
Append the slug as a new line at the end of QUEUE. Mark the topic [x] in TOPICS.md and move it to the Done section.

Then commit and push decks/<slug>/, QUEUE and TOPICS.md to codewithmashi/carousel-autopost on main. The GitHub Actions workflow publish-instagram.yml publishes the top of QUEUE at 19:12 IST on Mon/Wed/Fri.

Do NOT publish to Instagram yourself. Your job ends at the push.

## 7. Report
The hero word, the pillar, the slug, whether proof was a real figure or a before/after, how many topics remain in TOPICS.md, and anything needing attention.
