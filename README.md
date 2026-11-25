# Targeting Solution

A field-radio-styled fire-control computer for **BattleTech: Alpha Strike** (Commander's Edition), built for an iPhone 16 Pro held in landscape. It uses the optional **Multiple Attack Rolls (MAR)** rule: one 2D6 attack roll per point of damage.

## Controls

| Control | Values | Default | Target Number modifier |
|---|---|---|---|
| SKILL | 0–5 | 4 | base TN |
| RNG | SHT / MED / LNG | MED | +0 / +2 / +4 |
| TMM | 0–5 | 1 | +TMM |
| JUMP? | YOU:N TGT:N → YOU:Y TGT:N → YOU:N TGT:Y → YOU:Y TGT:Y | N/N | attacker jumped +2, target jumped +1 |
| COVER | +0 to +3 | +0 | +cover |
| OTHER | −4 to +6 | 0 | anything else (heat, standstill −1, secondary target +1, indirect fire, woods…) |
| DICE | 1–15 | 1 | number of attack rolls (damage at that range) |

The up/down keys auto-repeat when held (except RNG and JUMP, which step once per press). The status line shows the TN, the chance per roll, and the expected number of hits.

- **FIRE** rolls the attack. The rolls are animated one after another; press FIRE during the animation to skip to the result, or after it to re-roll with the same settings.
- **RESET** puts every control back to its default.
- **CFG** opens the options: housing colour, display colour scheme, and sound on/off. Your choices are remembered.

## Rules implemented

- TN = Skill + Range + TMM + Jump + Cover + Other (S.A.T.O.R.).
- A roll hits when 2D6 ≥ TN. If TN > 12 the attack misses automatically, and the unit shows **NO SHOT** instead of rolling. A 12 is not an automatic hit.
- If a hit is a natural 12, the unit shows **CRIT CHK** (under MAR you get at most one per target).
- Each die is drawn from `crypto.getRandomValues` with rejection sampling, so every face is exactly 1/6 and the sum of two dice has the true 2D6 distribution. `npm test` includes a chi-square check of that distribution.

## Running it

It's a static web app with no build step.

```bash
npm start          # serves on http://localhost:8080
npm test           # rules + dice distribution tests
```

To put it on the phone, host the folder over HTTPS (for example with GitHub Pages: Settings → Pages → deploy from the branch). Open the page in Safari and choose **Share → Add to Home Screen**. It then launches full-screen and works offline through the service worker.

Note: iOS mutes web audio when the ring/silent switch is set to silent.
