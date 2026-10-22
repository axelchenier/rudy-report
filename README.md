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
| `pipeline/fetch_extras.py` | Python script that downloads game logs, player tracking, and the Basketball-Reference BPM column (the only BBRef number used; credited on the site). |
| `pipeline/build_history.py` | Builds 1996-97 to 2015-16 from cached NBA.com data (dashboards, game logs) plus one NBA.com standings request per season. |
| `pipeline/build_indexes.py` | Combined player files (careers, Ask name index, Similar Players inputs). Run nightly by `update_reports.py`. |
| `pipeline/fetch_schedule.py` | NBA.com schedule for the Playoff Odds / Draft Lottery tools. Run nightly by `update_reports.py`. |
| `pipeline/fetch_more.py` | Python script that downloads standings, full game logs, clutch, hustle and more tracking stats (NBA.com). |
| `pipeline/update_reports.py` | The nightly script: refreshes the current season, writes the Reports, rebuilds the combined player files, and runs `fetch_more.py`, `fetch_schedule.py` and `fetch_advanced.py` for the current season. |
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
.venv/bin/python pipeline/fetch_extras.py   # about 3 minutes: game logs, tracking, Basketball-Reference BPM
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
- **2027 Draft** (`js/ask/draft.js`): "top 2027 draft prospects", "top 5 SEC draft prospects", "youngest draft prospects",
  "first round odds for Tyler Tanner", "most similar drafted player to Tyler Tanner" (answers from `data/draft/`, Model estimate)
- **College game prediction:** "Duke vs UNC prediction", "Kansas at Duke", "who would win Houston or Purdue" (the Game Predictor's model)

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

**College Reports** (`#/college/reports`): Daily / Weekly / Monthly reports in the same style as the NBA Reports (scores,
top-25 matchups, upsets, top performers, notable lines, leaders, what changed vs the previous period, T-Rank movers,
hot/cold vs last season, freshmen). Before the season starts it shows the first game day and a recap of last season.
**Game predictor** (`#/college/predictor`, labeled *Model estimate*): score, margin and win chance from Torvik's
adjusted efficiencies, with the method and back-test on the page.
**2027 NBA Draft** (`#/draft`): the *Rudy Report Model Board* (labeled *Model estimate*: a logistic model of first-round
chances fit on 2008-2023 college seasons, with a back-test and a method note) and a report per prospect (percentiles,
rule-based strengths/weaknesses with numbers, most similar past drafted players, NBA Draft Combine data when it exists,
college career). No scouting opinions and no outside rankings.

**Draft classes 2008-2026** (`#/draft/history`, `#/draft/history?year=2016`; in the **Draft** menu): every pick from
NBA.com's DraftHistory, linked to our NBA player page (career stats, NBA.com) and, when he played Division I, to his
college stats (Torvik). Each class shows picks-by-range outcomes, longest careers, best value after pick 20, top scorers and a
"re-draft" by career NBA minutes. The overview page has hit rates by pick range (classes 2008-2020, 6+ NBA seasons each).
Outcome labels use NBA.com regular-season minutes only (no Basketball-Reference stats): **Starter** = 2+ seasons with
2,000+ minutes, **Rotation** = 5,000+ career minutes, **Played** = 1+ game. Built by `pipeline/college_nba.py`
(DraftHistory cached and refreshed daily; NBA careers read from `data/careers/`, college lines from `data/college/`) into
`data/draft/history/` and `data/draft/translation.json`. 906 of 914 college picks are linked; the rest never played D-I
(e.g. Shaedon Sharpe, Ricky Ledo) or NBA.com lists a non-college club as their school.

**College → NBA** (`#/draft/translation?x=C_PTS&y=R_PPG`, Draft menu): how drafted D-I players' final college seasons
(Torvik) lined up with their NBA.com rookie and career numbers. A stat-by-stat table (correlation r, players, and the
median NBA ÷ college ratio, e.g. rookies typically kept ~38% of their college scoring), a scatter explorer for any college stat vs
any NBA outcome (by pick range, click a dot for the player), a ranking of which college numbers went with long careers, both raw and
*beyond draft slot* (minutes minus a fitted minutes-by-log-pick curve), and a searchable table of every matched player. Correlations
and medians are descriptive; the fitted lines and the beyond-slot column are labeled **Model estimate**. Sample rules: rookie
numbers need 20+ games, career per-game numbers 50+ games, career minutes use classes 2008-2020 (non-players count as 0).

**Prospect pages** (`#/draft/<pid>`) add *What similar past players became in the NBA*: the NBA.com careers of the 6 listed
comparisons, a summary of his 20 closest matches drafted 2008-2020 (`nn_outcomes` in the prospect file, written by
`college_draft.py`), and a similarity-weighted share reaching rotation/starter level, labeled **Model estimate**.

**Ask bar, past drafts** (`js/ask/draft_history.js`, rules only): "who was drafted 5th in 2019", "best pick of the 2016
draft", "steal of the 2012 draft", "best scorer from the 2009 draft", "where was Draymond Green drafted", "who did the Celtics draft
in 2016", "Duke draft picks", "hit rate for picks 11-20", "how often do number 3 picks become rotation players", "which school
produced the most NBA rotation players since 2010", "does college FT% predict NBA 3P%", "which college stats predict NBA success".
"Best" always means most career NBA minutes (or scoring average when asked), stated in the answer; each answer links to the class
or College → NBA page.

**2027 Mock Draft simulator** (`#/draft/mock`, Draft menu, everything labeled **Model estimate**): choose a draft order
(projected standings from the Playoff Odds simulation, one simulated 3-2-1 lottery using the NBA side's `js/lottery.js` +
`js/sim.js` unchanged, last season's real records, or your own by swapping teams), set how much team needs matter, and the
first round fills from the Model Board. Team needs = bottom-half NBA.com team-stat ranks (last complete season) in ten areas
(3P%, assist %, turnover %, blocks, steals, defensive/offensive rating, DREB%/OREB%, TS%); fit = the prospect's D-I percentiles
in those areas (new `pct` field on each board row from `college_draft.py`). Each pick = best *board log-odds + weight × 2 × fit*;
any pick can be overridden (the choice follows the team through swaps and new lottery rolls) and later picks re-fill. Not modeled: traded picks, protections, the 2nd round, players not on the board
(incoming freshmen, internationals).

**College team and player pages, history extras** (`js/pages/college_extras.js`): team pages end with *Program history*:
NCAA tournament runs 2008-2026 (seed, region, result, from the saved ESPN brackets), best finish, titles, and every NBA draft pick
since 2008 from that school with his NBA.com career and outcome label. Player pages show a *transfer path* (schools in order,
from Torvik's season rows) and, for drafted players, the draft pick plus final college season vs NBA rookie season vs NBA
career, with links to his NBA page and draft class.

**College player game logs** (player pages, *Game log*): every game of 2024-25 and 2025-26 (plus the current season nightly,
November-April) from ESPN box scores via sportsdataverse, linked to Torvik players by ESPN id: a per-game chart with rolling
averages, the game table (opponents link to their team pages; postseason tagged) and splits (home/away, wins/losses, starts,
postseason, vs top-50 T-Rank, by month). Built by `pipeline/college_gamelogs.py` into `data/college/gamelogs/<season>/g_NN.json`
(about 7.6 MB per season; run `college_gamelogs.py 2023 2024` for older seasons).

**College team schedule & results** (team pages): every game of 2024-25 / 2025-26 (+ current season nightly) from ESPN team box
scores: margin chart with a 5-game average, game table with opponent T-Rank, possessions and per-game offensive/defensive rating
(points per 100 possessions, not opponent-adjusted), and splits (home/away as ESPN lists them, conference/non-conference, vs top-25
and top-100, vs non-D-I, postseason, close games, by month). `data/college/gamelogs/<season>/teams.json` (~1.2 MB per season).

**College Compare across seasons**: `#/college/compare?type=players&ids=<pid>@<season>,...` compares players (or teams) from
different seasons (e.g. Zion 2018-19 vs Anthony Davis 2011-12). Changing the season keeps your picks so you can add someone from
another year; percentiles are against each one's own season. Old links with plain ids still work (they mean the page's season).

**College Leaders** (`#/college/leaders`, College menu): season leaders (top 10 in 12 stats; filter by conference and class, e.g.
freshmen), the best single seasons since 2007-08 (21 stats, all players or freshmen only) and career leaders since 2007-08 (8 stats,
transfers combined). Qualified = 40%+ of team minutes and 15+ games (Torvik's rule); shooting % lists need 200 FGA / 100 3PA / 100 FTA.
All-time lists are precomputed by `pipeline/college_leaders.py` → `data/college/leaders.json` (~90 KB, rebuilt nightly by
`update_college.py`). Torvik counts D-I games only, so totals can sit slightly below official NCAA totals.

**Transfer what-if** (`#/college/transfer?season=&pid=&to=`, College menu, **Model estimate**): move a player to another team
in the same season and see both teams' AdjO/AdjD/AdjEM, Barthag, estimated T-Rank and record change. Method (fit by
`pipeline/college_transfer.py` → `data/college/transfer_model.json`, 2 KB): across 6,689 D-I team-seasons, AdjEM = 0.837 ×
Σ(Torvik BPM × Min%) − 0.25 (r = 0.9997); AdjO and AdjD use the same fit on OBPM and DBPM. The old team gives his minutes to its
bench (minute-weighted bench OBPM/DBPM); the new team gives him the slider's minutes, taken from the end of its bench first.
"Typical transfer carryover" uses how 3,213 real transfers' OBPM/DBPM and minutes changed the next season. Record = log5 vs
Torvik's SOS, change added to the real record. Not modeled: position fit, usage overlap, coaching, eligibility.

**College what-if sliders** (team pages, labeled *Model estimate*): change adjusted offense, adjusted defense, 3P% or
opponents' 3P% and see AdjEM, Barthag (Torvik's formula, exponent 11.5), an estimated T-Rank, expected wins against the same
strength of schedule (log5 vs Torvik's SOS; preseason uses the opponent strength that reproduces Torvik's projected record),
and the win chance against the best other team. 3P% converts to points with 3-point attempts per possession from Torvik's four factors.

**Conferences** (`#/college/conferences`, `#/college/conference/<code>`): every conference ranked by average adjusted
efficiency margin (plus top-4 AdjEM, offense, defense, tempo, best team, and NCAA bids/wins/best run when a real bracket exists),
and one page per conference with standings (by conference win %), rating cards, player leaders (points, rebounds, assists, BPM,
TS%, steals, blocks, 3P%), NCAA seeds/results, and a season-by-season history. Season switcher on both.

**Tournament Simulator** (`#/college/tournament`, labeled *Model estimate*): pick a field, either a **real NCAA bracket**
(2008-2026, seeds/regions/results from ESPN's scoreboard, saved by `pipeline/college_bracket.py`) or a **model-seeded field**
(each conference's best T-Rank team + the best remaining teams, seeded 1-16 by T-Rank on an S-curve) for any season, including
2026-27 preseason. It plays the bracket 20,000 times with the Game Predictor's model (neutral court) and shows every team's odds to
reach each round, a one-click simulated bracket, the real results with the model's pre-game chances, and a back-test. "Edit the field"
swaps teams in/out or adds rating points ("what if Minnesota were 5 points better?"). The nightly `update_college.py` saves a new
year's bracket automatically once its title game is final (it does nothing outside mid-March to April). By hand:

    .venv/bin/python pipeline/college_bracket.py --current       # or --years 2027

Nightly college job (Torvik refresh + ESPN games + reports + draft board):

    .venv/bin/python pipeline/update_college.py

| File | What it is |
|---|---|
| `pipeline/update_college.py` | Nightly job → `data/college/reports/` (and runs `college_draft.py`). |
| `pipeline/college_draft.py` | Draft model + prospect reports → `data/draft/`. |
| `pipeline/college_gamelogs.py` | College player game logs (ESPN box scores) → `data/college/gamelogs/`. |
| `pipeline/college_leaders.py` | All-time single-season and career college leaderboards (2007-08+) → `data/college/leaders.json`. |
| `pipeline/college_transfer.py` | Fits the Transfer what-if's player→team link and transfer carryover → `data/college/transfer_model.json`. |
| `pipeline/college_nba.py` | Draft classes 2008-2026 + college-to-NBA data → `data/draft/history/`, `data/draft/translation.json`. |
| `pipeline/college_bracket.py` | Real NCAA brackets (ESPN) → `data/college/brackets/<year>.json`. |
| `js/pages/college_tourney.js` | Tournament Simulator page. |
| `js/pages/college_conf.js` | Conference pages (all conferences + one conference). |
| `js/pages/college_whatif.js` | What-if sliders on college team pages. |
| `js/pages/college_reports.js`, `college_predictor.js`, `draft.js` | Those pages. |
| `js/nav.js` | Top-nav dropdowns (College, More) and the mobile menu. |

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

## Lineups, on/off and WOWY

- Team pages → **Lineups & on/off**: 5-man lineups and 2-man pairs (NBA.com `LeagueDashLineups`) with a minimum-minutes
  slider, plus every player's team net rating on vs off the floor (`TeamPlayerOnOffSummary`).
- Player pages → **Lineups & on/off**: his on/off card and most-used lineups.
- **WOWY explorer** (`#/wowy?team=…`): click players ON or OFF and see the team's ratings in exactly those minutes.
  This asks the free [PBP Stats API](https://www.pbpstats.com) live (credited on the page) and caches each answer in the
  browser for 12 hours, so the hobby server isn't hammered. If it's down, the page says so.

## What if… sliders (Model estimate)

Player and team pages have a **What if** tab: change 3P%, 3PA, 2P%, FT% or FTA per game and see points, TS%, eFG%,
team net rating and Pythagorean wins move. It's labeled **Model estimate** because it changes one number and holds
everything else fixed (no extra rebounds off misses, no defensive or usage changes). Points → net rating uses the team's
possessions per game; wins use the same Pythagorean formula (exponent 13.91) as the Standings page. A player's effect is
spread over only the games he played.
