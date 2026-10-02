# GongGo

[![CI](https://github.com/DipankerBaral/gonggo-api/actions/workflows/ci.yml/badge.svg)](https://github.com/DipankerBaral/gonggo-api/actions/workflows/ci.yml)

Find and join local games and community events around Wollongong: soccer, basketball,
running, table tennis and more. See how many spots are left and jump in.

A mobile-first web app (`public/`) on top of a Node.js + Postgres API (`src/`), deployed to
AWS by GitHub Actions and Terraform (`infra/`).

## Run it

Everything in Docker (API + Postgres):

```bash
docker compose up -d --build    # http://localhost:3000, with 3 sample games
docker compose logs -f api
docker compose down             # stop (data is kept in the pgdata volume)
docker compose down -v          # stop AND delete all data
```

Or run the API directly on your machine, with only the database in Docker:

```bash
docker compose up -d db
npm install
npm start
```

## Tests

```bash
docker compose up -d db
npx playwright install chromium            # once, for the UI tests
npm test                                   # everything: API + UI on desktop and mobile
npm run test:api                           # just the API tests
npm run test:ui                            # just the browser tests
BASE_URL=http://localhost:3000 npm test    # or test the full Docker stack
```

- **API tests** (`tests/*.spec.js`): every game rule, validation and permission
- **UI tests** (`tests/ui/`): browsing, filtering, the map, joining, leaving, posting and
  cancelling, run on a desktop browser and a phone-sized one, with automated WCAG 2.1 AA
  accessibility checks (axe) and an XSS check

## Web app

Plain HTML, CSS and JavaScript in `public/`, no build step. Leaflet and the fonts are served
from npm packages, not third-party CDNs. Map tiles come from OpenStreetMap.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 3000 | |
| `DATABASE_URL` | `postgres://gonggo:gonggo@localhost:5433/gonggo` | compose sets this to the `db` service |
| `ADMIN_KEY` | `dev-admin-key` | dev only, always set in real environments |
| `SEED` | true | adds 3 sample games to an empty database |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **API tests**: Playwright against the code, with Postgres as a service container
2. **Docker build and smoke test**: builds the image, starts the full stack with Compose, and runs the same tests against the containers
3. **Publish** (pushes to `main` only): pushes the image to GitHub Container Registry as
   `ghcr.io/dipankerbaral/gonggo-api`, tagged `sha-<commit>` and `latest`

```bash
docker pull ghcr.io/dipankerbaral/gonggo-api:latest
```

## Database

Postgres 16. Migrations live in `src/db/migrations` and run automatically on startup
(or `npm run migrate`). To change the schema, add a new numbered `.sql` file; never edit one
that has already run.

## Sign-in

Anyone can browse games. Joining, posting, commenting and My games need an account.

- **On AWS:** Amazon Cognito (email and password, plus Google and Apple when configured).
  The browser uses the OAuth code + PKCE flow; the API checks Cognito's signed ID token
  (`Authorization: Bearer ...`) on every request. GongGo never sees a password.
- **On your laptop and in tests:** dev sign-in. Type a first name, or send `x-user-id`
  (and optionally `x-user-name`) headers. The server refuses this mode in production
  unless `ALLOW_DEV_AUTH=true` is set on purpose, which docker-compose and CI do and AWS never does.
- **Admins:** people in the Cognito `admins` group (see `terraform output make_admin_command`)
  get the Admin page. Scripts and tests can still use `x-admin-key: <ADMIN_KEY>`. In dev
  sign-in, send `x-user-groups: admins` to act as an admin.

To turn on Google or Apple sign-in, see `infra/auth.tf`. Cognito only accepts `https://`
return addresses (plus `http://localhost`), so real sign-in on AWS needs a domain with HTTPS.

## Endpoints

| Method | Path | Who | What |
|---|---|---|---|
| GET | /health | anyone | health check |
| GET | /games?sport=&hasSpots=true&q=&when=&limit=&cursor= | anyone | upcoming open games, soonest first, 20 per page: `{ games, nextCursor, total, inNext7Days }`. `q` searches titles and places; `when` is `today`, `weekend` or `week` |
| GET | /games/:id | anyone | one game with its players |
| POST | /games | user | post a game (up to two upcoming games per person) |
| POST | /games/:id/join | user | take a spot |
| DELETE | /games/:id/join | user | give your spot back |
| PATCH | /games/:id | host | edit a game (send only the fields that change) |
| DELETE | /games/:id/players/:userId | host | remove a player (they can't rejoin) |
| DELETE | /games/:id | host | cancel your game |
| POST | /games/:id/report | user | flag a game for the admin |
| GET | /me/games | user | games I host or joined: upcoming, plus the last 30 days |
| GET | /me | user | my profile (`name` is null until chosen) |
| PATCH | /me | user | choose or change my name (`{"name": "Sam"}`) |
| POST | /me/consent | user | confirm 18+ and accept the terms (`{"dateOfBirth": "1996-04-23", "acceptTerms": true}`) |
| GET | /games/:id/comments | player | the game's comments, oldest first |
| POST | /games/:id/comments | player | post a comment (`{"body": "..."}`, up to 500 characters) |
| DELETE | /games/:id/comments/:commentId | author or host | delete a comment |
| GET | /config | anyone | what the browser needs to start sign-in (no secrets) |
| POST | /games/:id/comments/:commentId/report | player | report someone else's comment |
| DELETE | /me | user | delete my account and everything in it (incl. the Cognito sign-in) |
| GET | /admin/reported | admin | reported games and comments, with reasons |
| POST | /admin/games/:id/reports/dismiss | admin | clear a game's reports, keep the game |
| DELETE | /admin/comments/:commentId | admin | delete a comment |
| POST | /admin/comments/:commentId/reports/dismiss | admin | clear a comment's reports, keep it |
| GET | /admin/banned | admin | banned people |
| POST | /admin/users/:userId/unban | admin | unban someone |
| GET | /admin/games | admin | all games, most-reported first |
| GET | /admin/reports | admin | all reports |
| POST | /admin/games/:id/remove | admin | take a game down (`{"reason": "..."}`) |
| POST | /admin/games/:id/approve | admin | publish a paid tournament |
| POST | /admin/users/:userId/ban | admin | ban a user and remove their upcoming games |

## Rules

- Games last 90 minutes unless the host says otherwise (15 minutes to 12 hours). They stay
  listed, and joinable, until they end.
- Hosts can edit a game until it ends; everyone keeps their spot. Capacity can't drop below
  the people already in.
- Per-person rate limits on posting, editing, joining, commenting, reporting and profile
  changes (see `RATE_LIMITS` in `src/constants.js`). Over the limit returns 429 with Retry-After.
- Up to two upcoming games per host (open or awaiting payment, and not yet started).
- Locations must be inside the Illawarra region.
- Tournaments start as `pending_payment` and stay hidden until approved (Stripe comes later).
- Hosts take the first spot and can't leave their own game, only cancel it.
- Comments are visible only to the game's players and host.
- Everyone confirms they're 18+ and accepts the current Terms of Use and Privacy Policy
  (`TERMS_VERSION` in `src/constants.js`) before posting, joining or commenting. The date
  of birth is checked and never stored. Bump `TERMS_VERSION` to ask everyone again.
- `public/terms.html` and `public/privacy.html` are drafts: have them reviewed before launch,
  and fill in the `[contact email]`.
- Joining and posting are safe under concurrency: row locks stop two people taking the last
  spot, and an advisory lock stops one person double-posting.

## Known gaps

- **Rate limit counts live in memory**, per container. Move them to Redis if running several.
- **Tests share the database** with the app you run locally; a separate test database is planned.

## Backups and recovery

Production data is protected by default (`protect_data` in `infra/variables.tf`):

- **The database** has deletion protection, daily backups, and point-in-time recovery.
  Deleting it on purpose leaves a final snapshot, `gonggo-db-final`. Backups are kept for
  **1 day** while the AWS account is on the Free plan (its limit), and **7 days** after
  upgrading the account and setting `aws_free_plan = false` in `infra/variables.tf`.
- **Cognito** (the accounts) has deletion protection. It has no backups, which is why this matters.

### Restore the database to a point in time

For example, to just before a bad change. This creates a **new** database next to the old one;
nothing is overwritten.

```bash
aws rds describe-db-instances --db-instance-identifier gonggo-db \
  --query 'DBInstances[0].[EarliestRestorableTime,LatestRestorableTime]'   # the window you can restore within

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier gonggo-db \
  --target-db-instance-identifier gonggo-db-restored \
  --restore-time 2026-10-02T03:15:00Z \
  --db-subnet-group-name gonggo-db \
  --vpc-security-group-ids "$(aws ec2 describe-security-groups --filters Name=group-name,Values=gonggo-db --query 'SecurityGroups[0].GroupId' --output text)" \
  --no-publicly-accessible
```

Check the data in `gonggo-db-restored`, then point the app at it (update `/gonggo/database-url`
in Parameter Store and redeploy) or copy the rows you need back.

### Tearing everything down on purpose

1. Set the repo variable `PROTECT_DATA` to `false`.
2. Run **Actions → CI → Run workflow** so protection is switched off.
3. Run **Actions → Destroy AWS infrastructure**. While protection is on, it refuses.

## Monitoring

CloudWatch alarms (`infra/monitoring.tf`) email the address in the repo variable `ALERT_EMAIL`
when GongGo is down, returning server errors, slow, logging unexpected errors, or when the
containers or database are struggling, and again when things recover. AWS sends a confirmation
email first: click its link or no alerts arrive.

- Dashboard: `terraform output -raw dashboard_url`
- Send a test alert: `terraform output -raw test_alarm_command` (copy and run it)
