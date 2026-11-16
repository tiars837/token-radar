# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tiars837/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/tiars837/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar for the [make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01) ($1,325). It reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still record no token, ranks them by what their launch would be worth, and hands in a web dashboard with the board, a detail view for each protocol, and the steps to farm it.

## The model — radar-2-comps

Every row starts from the sealed snapshot only: TVL, 7d change, listing date, chains, and whether a token is recorded. The implied value is calibrated on the snapshot itself:

- **Comps multiple** — the median market-cap/TVL of the live-token protocols in the same category, computed from this snapshot at run time (global median where a category has fewer than five live tokens). No protocol name is special-cased; the same function scores every row.
- **Growth** — `1 + clamp(change_7d, −60, 120)% × 0.5`
- **Maturity** — `0.6 + min(age_days, 1095) / 1095 × 0.4` (unknown age: 365 days)
- **Chains** — `1 + 0.04 × min(chains − 1, 5)`

`implied = round(TVL × comps × growth × maturity × chains)`

The board covers all 40 watchlist protocols plus the 200 largest pre-token protocols below the $50M floor — 240 rows, the early finds the radar exists to catch. Live-token protocols are shown apart, at the market's own value, and they are the comps the model is calibrated on.

"Pre-token" means the snapshot records no token for the protocol — no market cap, no CoinGecko id, no symbol. That is DefiLlama's record, not proof.

## The dashboard

A static page, no framework, no network: sortable and filterable board, a detail drawer for every protocol with the model's full working and a six-step farm plan (action, cost, time), a live-token view, a model sandbox that recomputes implied values live, and the comps calibration table. Hash routes: `#detail=<slug>`, `#cat=<Category>`.

## Run it

```sh
node --experimental-strip-types main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. Reads `/input/snapshot.json` (or `--input`), writes `/output/board.json`, `/output/data.js`, `/output/dashboard/`, `/output/screenshots/` and `/output/dossier.json` (via `vendor/makefun-board.ts`, the kit's library byte for byte). Outside the grader's container, set `MAKEFUN_OUTPUT_DIR`.

## Layout

- `main.ts` — the entry: read snapshot, score, write outputs, build the dossier.
- `lib/model.ts` — the comps-calibrated model, farm plans, board validation, snapshot parsing.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static radar.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
- `screenshots/` — the board, a detail view, a filtered view.

## License

MIT — see [LICENSE](LICENSE).
