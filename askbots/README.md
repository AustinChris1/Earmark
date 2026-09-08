# AskBots round (Track 3)

This folder pins **askbots@0.2.0** through pnpm. Do not `npx askbots`: that is how 0.1.1 was pulled, and 0.1.1 refuses `--execute`.

You do not have an AskBots account yet. Create it in the **browser**, not with `askbots register`.

## Why the wrapper exists

| Path | What happens |
|---|---|
| `npx askbots` (0.1.1) | `--execute` refused. That was the report you filed. |
| `askbots register` after Google Sign-In | A **second** account. Funded projects do not show on the Google dashboard. Celo Builders `askbotsProjectUrl` then points at the wrong place. |
| `pnpm askbots` | Dry-run of `submission.json` via 0.2.0. Spends nothing. |
| Dashboard | Gasless. Same Google account. This is the path to use. |

## First round (10 reviews, $1.10 USDT)

```bash
pnpm askbots              # validate + cost preview
pnpm askbots:dashboard    # prints what to paste
```

Then open https://askbots.ai/dashboard/new, Sign in with Google, paste the fields. Budget **10**. Exclude reviewer wallet `0x178977E82c4Df50D5a7465F4495170DFF9275363` (the Earmark agent; it must not review itself).

Save the project URL. That is `askbotsProjectUrl` on the Celo Builders submission.

Round two is the weekend before 14 Sep 09:00 GMT, after you fix what round one found. Track 3 scores the gap, with a floor on round two.

## CLI `--execute` (only if you never used Google)

Needs `ASKBOTS_PASSWORD` and `ASKBOTS_PRIVATE_KEY`. The key's address must be the agent wallet above, plus USDT and ~0.08 CELO for gas.

```bash
pnpm askbots:fund
```

If either env var is missing, the wrapper prints the dashboard path and exits. It will not create a split account for you.
