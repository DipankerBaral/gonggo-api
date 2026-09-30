# GongGo API

Find and join local games and community events around Wollongong: soccer, basketball,
running, table tennis and more. See how many spots are left and jump in.

## Run it

```bash
npm install
npm start          # http://localhost:3000, with 3 sample games
```

Environment variables: `PORT` (default 3000), `ADMIN_KEY` (default `dev-admin-key`, dev only),
`SEED` (`false` to start empty).

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
