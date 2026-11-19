# Kapta backend

License server for the Kapta mobile app: the super admin creates client accounts (with the URL of each client's backend) and single-use activation codes with a validity period.

```bash
npm install
cp .env.example .env   # then fill it (JWT_SECRET, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD…)
npm run start:dev
npm run test:e2e       # uses a throwaway database "kapta_test", recreated on each run
```

The super admin is created at the first start from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (10 characters minimum); an existing one is never changed.

## API

Every protected route takes `Authorization: Bearer <accessToken>`. Unknown body fields are refused (400).

### Sign in
| Route | Body | Returns |
|---|---|---|
| `POST /auth/admin/login` | `{ email, password }` | `{ accessToken, email }` (super admin) |
| `POST /auth/login` | `{ email, password }` | `{ accessToken, email, client: { id, name } }` (client account, from the app) |

10 failed attempts per e-mail in 15 minutes → 429.

### Super admin (`/admin`, super admin token)
| Route | Body | Effect |
|---|---|---|
| `GET /admin/clients` · `GET /admin/clients/:id` | | Clients |
| `POST /admin/clients` | `{ name, backendUrl }` | New client; `backendUrl` must be https (http allowed for localhost outside production) |
| `PATCH /admin/clients/:id` | `{ name?, backendUrl?, active? }` | `active: false` stops every account and phone of the client |
| `GET /admin/clients/:id/users` · `POST /admin/clients/:id/users` | `{ email, password }` (8+ characters) | Client accounts (the password hash is never returned) |
| `PATCH /admin/client-users/:id` | `{ active?, password? }` | Deactivate an account or set a new password |
| `POST /admin/clients/:id/codes` | `{ durationDays, count?, validForDays? }` | Generates `count` (1–50) codes giving `durationDays` of license; `validForDays` = time left to use the code. **The codes are shown only in this response.** |
| `GET /admin/clients/:id/codes` | | Codes with status `DISPONIBLE`, `UTILISE`, `EXPIRE` or `REVOQUE` (last 4 characters only) |
| `POST /admin/codes/:id/revoke` | | Revokes an unused code |
| `GET /admin/clients/:id/licenses` | | Phones with status `ACTIVE`, `EXPIREE` or `REVOQUEE` |
| `POST /admin/licenses/:id/revoke` | | Stops a phone |

### Kapta app (client account token)
| Route | Body / query | Returns |
|---|---|---|
| `POST /license/activate` | `{ code, deviceId }` | License view (below). A code works once, for its client only. On a phone whose license still runs, the new duration is added to its end date. |
| `GET /license/status?deviceId=` | | License view; called at start and regularly |

License view: `{ valid, reason, expiresAt, daysLeft, client, serverTime }`
- `reason`: `null`, `NON_ACTIVEE`, `EXPIREE` or `REVOQUEE`;
- `client`: `{ id, name, backendUrl }` while `valid`, otherwise `{ name }` only: the app gets the client's backend URL only with a running license.

`deviceId`: 8–128 characters `A-Z a-z 0-9 . _ : -`, generated once per installation by the app.
