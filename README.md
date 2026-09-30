# GongGo API

[![CI](https://github.com/DipankerBaral/gonggo-api/actions/workflows/ci.yml/badge.svg)](https://github.com/DipankerBaral/gonggo-api/actions/workflows/ci.yml)

Find and join local games and community events around Wollongong: soccer, basketball,
running, table tennis and more. See how many spots are left and jump in.

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
npm test                                   # Playwright starts the API on port 3001
BASE_URL=http://localhost:3000 npm test    # or test the full Docker stack
```

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

## Database

Postgres 16. Migrations live in `src/db/migrations` and run automatically on startup
(or `npm run migrate`). To change the schema, add a new numbered `.sql` file; never edit one
that has already run.

## Auth (temporary)

Send `x-user-id: <any name>` to act as a user and `x-admin-key: <ADMIN_KEY>` for admin routes.
Real logins come later in the roadmap.

## Endpoints

| Method | Path | Who | What |
|---|---|---|---|
| GET | /health | anyone | health check |
| GET | /games?sport=&hasSpots=true | anyone | upcoming open games, soonest first |
| GET | /games/:id | anyone | one game with its players |
| POST | /games | user | post a game (one active game per person) |
| POST | /games/:id/join | user | take a spot |
| DELETE | /games/:id/join | user | give your spot back |
| DELETE | /games/:id | host | cancel your game |
| POST | /games/:id/report | user | flag a game for the admin |
| GET | /admin/games | admin | all games, most-reported first |
| GET | /admin/reports | admin | all reports |
| POST | /admin/games/:id/remove | admin | take a game down (`{"reason": "..."}`) |
| POST | /admin/games/:id/approve | admin | publish a paid tournament |
| POST | /admin/users/:userId/ban | admin | ban a user and remove their upcoming games |

## Rules

- One active game per person (open or awaiting payment, and not yet started).
- Locations must be inside the Illawarra region.
- Tournaments start as `pending_payment` and stay hidden until approved (Stripe comes later).
- Hosts take the first spot and can't leave their own game, only cancel it.
- Joining and posting are safe under concurrency: row locks stop two people taking the last
  spot, and an advisory lock stops one person double-posting.
