# The Rudy Report: NBA stats explorer (Axel Chenier)

An interactive NBA stats website. You can:

- **Ask** questions in plain English on the home page, for example *"Who leads the league in box plus minus?"*
- **Browse Players and Teams** in big sortable tables, with Per Game / Totals / Per 36 (or Per 100 possessions) / Advanced tabs.
- **Open any player or team** to see league ranks, season-by-season numbers, and team rosters.
- **Compare** 2 to 4 players or teams side by side, with a bar chart and a radar chart.

Every number comes from real data files in `data/`. Nothing is typed in by hand.
It's a **static site**: plain HTML, CSS and JavaScript files with no server code. That means it can be hosted for free (see "Putting it online" below).

## What each folder does

| Folder / file | What it is |
|---|---|
| `index.html` | The one web page. The header, footer and an empty area that JavaScript fills in. |
| `css/style.css` | Colors, fonts and layout, including the dark and light themes. |
| `js/app.js` | Chooses which page to show based on the address (`#/players`, `#/team/1610612750`, …). |
| `js/pages/` | One file per page: `ask.js`, `players.js`, `teams.js`, `player.js`, `team.js`, `compare.js`. |
| `js/ask/parser.js` | Turns a typed question into a plan (which stat, which seasons, players or teams…). It uses rules, not AI. |
| `js/ask/names.js` | Finds player and team names in a question, even with small typos or nicknames ("SGA", "Wolves"). |
| `js/ask/engine.js` | Answers the plan: leaderboards, lookups, comparisons, home/road splits, opening day, and two-player fit reports. |
| `js/ask/sql.js` | Optional "SQL mode" for power users. It runs a real database (DuckDB) inside the browser. |
| `js/ask/ai.js` | The plug-in spot for a future AI mode. It is **off** (see below). |
| `js/stats.js` | The dictionary of every stat: its name, how to display it, and the words people use for it. |
| `js/data.js`, `js/ui.js` | Loading the data files, plus shared pieces like the sortable table. |
| `vendor/chart.umd.min.js` | Chart.js, the chart library, saved locally. |
| `pipeline/fetch_data.py` | Python script that downloads player and team stats from NBA.com. |
| `pipeline/fetch_extras.py` | Python script that downloads game logs, player tracking, and Basketball-Reference advanced stats. |
| `pipeline/cache/` | Saved copies of Basketball-Reference pages, so they aren't downloaded twice. |
| `data/<season>/` | The JSON data files the website reads, one folder per season. |
| `data/meta.json` | Which seasons are loaded, where the data came from, and when it was pulled. Shown in the footer. |
| `screenshots/` | Pictures of each page. |

## Where the data comes from

- **NBA.com/stats**, through the free `nba_api` Python library:
  - player and team stats (basic and advanced)
  - per game, totals, per 36 minutes, and per 100 possessions
  - team and player game logs (for home/road splits and opening day)
  - player-tracking numbers (touches, catch-and-shoot, pull-ups, drives)
- **Basketball-Reference.com**: the season "Advanced" tables, for Box Plus/Minus (BPM, OBPM, DBPM), PER, Win Shares and VORP.
  These are downloaded slowly (one page every 4 seconds, under their 20-per-minute limit) and cached.
- **Seasons:** the 10 regular seasons from 2016-17 through 2025-26.

## Run it on your computer

You need Python 3. From this folder, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. (Double-clicking `index.html` won't work: browsers block loading data files that way.)

## Refresh the data (for example, during a new season)

```bash
python3 -m venv .venv                       # one time: make a private Python for this project
.venv/bin/pip install -r requirements.txt   # one time: install the libraries
.venv/bin/python pipeline/fetch_data.py     # about 2 minutes: player and team stats
.venv/bin/python pipeline/fetch_extras.py   # about 3 minutes: game logs, tracking, Basketball-Reference
```

To change which seasons are loaded, edit `SEASONS` at the top of `pipeline/fetch_data.py`.
To fetch Basketball-Reference again, delete the matching file in `pipeline/cache/`.

## How the Ask box works (and its limits)

There's no paid AI. `parser.js` recognizes common patterns:

- **Leaders:** "who leads the league in assists", "top 10 players in true shooting with at least 50 games", "best defensive rating among teams in 2023-24"
- **Filters:** "players averaging 25 points and 5 assists", "players shooting over 40% from three with at least 5 three point attempts"
- **Time spans:** "past 5 years", "last season", "in 2024", "2021-22", "since 2020"
- **Lookups and comparisons:** "Timberwolves net rating", "compare Anthony Edwards and Shai Gilgeous-Alexander"
- **Home/road:** "best home court advantage in the past 5 years", "worst road team"
- **Opening day:** "highest average points on opening days"
- **Fit report:** "will Anthony Edwards and LaMelo Ball be a good pairing"

Every answer shows grey tags explaining how the question was understood, plus its data source.
If a question isn't understood, the page shows examples and opens the **Question builder**.

## Optional: a true AI mode (not built; it would cost money)

To understand *any* wording, or to write opinions like "yes, they'd fit because…", you'd need an AI model. That means:

1. an account and an **API key** with an AI provider (paid, usually a few cents or less per question), and
2. a **tiny backend** (for example a free Cloudflare Worker) that keeps the key secret. A key must never go in this website's code.

`js/ask/ai.js` is where it plugs in. The AI would only translate the question into the same plan `parser.js` makes, so the numbers would still come from `data/`.

## Putting it online (not done yet)

The whole folder can go on **GitHub Pages** for free:

1. Make a GitHub account.
2. Create a repository and upload this folder (without `.venv/`).
3. Turn on Pages in the repository's settings.

The data files are about 19 MB. The SQL mode loads DuckDB from the jsDelivr CDN the first time it's used.
