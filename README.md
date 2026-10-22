# The Rudy Report: NBA stats explorer (Axel Chenier)

An interactive NBA stats website. You can:

- **Ask** questions in plain English on the home page, for example *"Who leads the league in box plus minus?"*
- **Browse Players and Teams** in big sortable tables, with Per Game / Totals / Per 36 (or Per 100 possessions) / Advanced tabs.
  Each page has its own season dropdown. The season and tab are saved in the address, so you can share a link like `#/players?season=2019-20&mode=advanced`.
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
| `pipeline/fetch_more.py` | Python script that downloads standings, full game logs, clutch, hustle and more tracking stats (NBA.com). |
| `pipeline/update_reports.py` | The nightly script: refreshes the current season, writes the Reports, and runs `fetch_more.py` for the current season. |
| `pipeline/cache/` | Saved copies of Basketball-Reference pages, so they aren't downloaded twice. |
| `data/<season>/` | The JSON data files the website reads, one folder per season. |
| `data/meta.json` | Which seasons are loaded, where the data came from, and when it was pulled. Shown in the footer. |
| `screenshots/` | Pictures of each page. |

## Where the data comes from

- **NBA.com/stats**, through the free `nba_api` Python library:
  - player and team stats (basic and advanced)
  - per game, totals, per 36 minutes, and per 100 possessions
  - team and player game logs (for home/road splits and opening day)
  - player-tracking numbers (touches, catch-and-shoot, pull-ups, drives, passing, rebounding chances, rim defense, speed and distance)
  - standings (`LeagueStandingsV3`), clutch stats (`LeagueDashPlayerClutch` / `LeagueDashTeamClutch`),
    hustle stats (`LeagueHustleStatsPlayer` / `LeagueHustleStatsTeam`) and defended shots (`LeagueDashPtDefend`)
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
.venv/bin/python pipeline/fetch_more.py     # about 4 minutes: standings, game logs, clutch, hustle, more tracking
```

During the season you only need the nightly command (it refreshes the current season, including `fetch_more.py`):

```bash
.venv/bin/python pipeline/update_reports.py
```

Player game logs are stored in 40 small files per season (`data/<season>/gamelogs/p_00.json` … `p_39.json`, chosen by
player ID), so a player page downloads only about 80 KB instead of the whole league's 3 MB.

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

## Reports tab (Daily / Weekly / Monthly)

The **Reports** tab shows what happened in the current season, built only from NBA.com box scores:

- **Daily:** scores, top performers, and notable stat lines. Compared with the previous game day.
- **Weekly:** the last 7 days, compared with the 7 days before.
- **Monthly:** the last 30 days, compared with the 30 days before.

Each report has these sections:

- **What changed:** risers and fallers in points per game and TS%, team record and net rating changes, league-wide averages, and leader changes. Arrows are green or red.
- **Hottest / coldest:** players compared with their averages from last season.
- **Team trends, streaks, rookies, and efficiency outliers.**
- **Interesting trends:** plain sentences made by rules from those numbers. There are no predictions.

If the comparison period has no games (the season just started), the report compares with **last season's averages** instead and says so.

**Update the reports (run once a day, for example from cron):**

```bash
cd /path/to/nba-stats-app && .venv/bin/python pipeline/update_reports.py
```

Example cron line (every day at 10:00 UTC, after all US games are final):

```
0 10 * * * cd /path/to/nba-stats-app && .venv/bin/python pipeline/update_reports.py >> reports.log 2>&1
```

What the script does each run:

- Refreshes the current season's data, including the season picker's newest season.
- Rewrites `data/reports/daily/<last game date>.json`, `weekly/latest.json` and `monthly/latest.json`.
- Saves a dated weekly copy on Mondays and a dated monthly copy on the 1st (add `--archive` to save them today).
- Rebuilds `data/reports/index.json`.

Running it twice gives the same result. If anything fails it prints `ERROR: ...` and exits with code 1.
`--no-refresh` rebuilds the reports from already-downloaded data.

Team ratings for date ranges (ORtg, DRtg, Net, Pace, 3PA/100) are estimated from box scores. The formula is possessions = FGA + 0.44×FTA − OREB + TOV, averaged between the two teams. Last-season comparisons use the same formula.

## Percentiles, glossary, standings, game logs and stat hubs

- **Percentile chips** (player and team pages): each headline stat shows its percentile (100 = best, red → gray → green),
  its rank, and the league average. Players are compared with "qualified" players (70%+ of the season's games), teams with all teams.
  The **percentile profile** shows bars for every stat; blue bars are "style" stats (how much, not how good).
- **Glossary** (`#/glossary`, file `js/glossary.js`): a definition and formula for every stat. Hover any column header or
  stat name to see it. Typical ranges on the glossary page are computed from the real data, not typed in.
- **Standings** (`#/standings`): NBA.com standings plus **model estimates** (purple badge): Pythagorean expected record
  (PF^13.91 ÷ (PF^13.91 + PA^13.91)), Luck (wins − expected wins), and for an in-progress season, projected wins.
- **Game log & splits** tab on player and team pages: every game, rolling 5/10-game averages, and splits
  (home/road, wins/losses, days of rest, month, opponent).
- **Stat hubs** (`#/hubs/clutch`, `#/hubs/hustle`, `#/hubs/tracking`): leaderboards, plus a "Clutch · Hustle · Tracking"
  tab on player pages ("Clutch · Hustle" on team pages). Clutch = last 5 minutes, score within 5 (NBA.com's definition).
  Hustle stats start in 2015-16 and tracking in 2013-14; older seasons say "not tracked in this era".
- The Ask bar understands the new stats too, e.g. "who leads the league in deflections", "most screen assists",
  "top 10 players in potential assists", "best rim protectors".

| File | What it is |
|---|---|
| `js/glossary.js` | Stat definitions and formulas (tooltips + glossary page). |
| `js/gamelog.js` | Loads game logs; Game Score, rolling averages, rest days and splits. |
| `js/hubs.js` | Which files and columns make up the clutch / hustle / tracking sections. |
| `js/pages/shared.js` | Percentile cards, percentile bars, the game-log view, and page tabs. |
| `js/pages/standings.js`, `hubs.js`, `glossary.js` | The new pages. |

## College basketball (NCAA men's Division I)

The **College** tab has its own Teams and Players tables (sortable, with Ratings / Four Factors / Scoring tabs for teams and
Per Game / Advanced / Shooting tabs for players), a season switcher (2007-08 to today, plus Torvik's preseason ratings for a
season that hasn't started), team and player pages, and a College Compare page (2-4 players or teams, bar + radar charts).
The Ask bar also answers college questions ("best offense in college basketball", "Duke adjusted efficiency",
"top college scorers"). The NBA stays the default; a question goes to college data when it says college/NCAA, names a
college conference, or names a college team that isn't also an NBA city.

| File | What it is |
|---|---|
| `pipeline/college_fetch.py` | Downloads Bart Torvik's public CSV files + ESPN box scores and writes `data/college/`. |
| `data/college/<season>/teams.json`, `players.json` | One season of college teams / players (players are stored column-wise to keep files small). |
| `data/college/careers/<n>.json` | Every college season of every player, split into 100 files (`player id % 100`). |
| `js/college/cstats.js`, `js/college/cdata.js` | College stat dictionary and data loading. |
| `js/pages/college.js`, `js/pages/college_compare.js` | The College pages. |
| `js/ask/college.js` | The college part of the Ask bar (rules, no AI). |

**Sources:** [barttorvik.com](https://barttorvik.com/) T-Rank bulk CSV files (`<year>_team_results.csv`, `<year>_fffinal.csv`,
`getadvstats.php?year=<year>&csv=1`). Bart Torvik publishes these for public use; we credit him on every page and only use the CSV links.
ESPN box scores (turnovers, fouls, starts, home/away records) come through the free `sportsdataverse` package.
Sports-Reference is **not** used (its terms don't allow building a database from it).

Refresh college data (current season; add `--seasons 2008-2027` to rebuild everything):

    .venv/bin/python pipeline/college_fetch.py --seasons 2027

## Shot charts

Every player and team page has a **Shot chart** tab (NBA.com `ShotChartDetail`, all seasons loaded):
- **Heat map**: hexagons sized by how many shots came from that spot and colored by FG% compared with the
  league average *from the same zones* (green = better, red = worse, gray = fewer than 5 shots). "Every shot" shows each make/miss.
- **Shot diet**: share of shots at the rim, in the paint, mid-range, corner 3 and above-the-break 3, against the league.
- Team charts can switch to **opponents' shots** (colors flip: green = good defense).
- Data: `data/<season>/shots/p_NN.json` (40 files, by player ID) and `data/<season>/shot_zones.json`
  (league zone averages + team hexagons), made by `pipeline/fetch_advanced.py` (also run nightly by `update_reports.py`).

## Play types

Player and team pages have a **Play types** tab: how often each play type is used (isolation, pick & roll,
spot-up, transition, …), points per possession, the difference from league average, and NBA.com's percentile.
Teams (and players) also have a defense view. Leaderboards: `#/hubs/playtypes`. Data: Synergy Sports play types as
published on NBA.com/stats (`SynergyPlayTypes`, from 2015-16), saved to `data/<season>/playtypes.json`.
