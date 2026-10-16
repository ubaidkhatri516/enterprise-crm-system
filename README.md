# Orbit CRM — Enterprise CRM System

A full-stack customer relationship management application built with **React (Vite), Node.js (Express), MongoDB (Mongoose), and REST APIs**. The responsive dashboard includes lead tracking, customer records, deal pipeline stages, activity/email logs, sales charts, and role-based access.

## Features

- Secure login with bcrypt password hashes and expiring JWTs.
- **Leads:** create, search, update, qualify and track estimated value.
- **Customers:** store company, email, phone and industry details.
- **Deals:** manage Prospecting → Qualification → Proposal → Negotiation → Won/Lost stages.
- **Dashboard:** live lead/customer/deal counts, won revenue, stage breakdown and recent activities.
- **Activity logs:** manually log emails, calls, meetings and notes against CRM records. **This is an email log, not an email-sending integration.**
- **RBAC:** admins manage team members and roles; managers can see/manage all CRM records; sales reps can see/edit only records they own. Managers/admins can delete records.
- Responsive interface with charts and CRUD modals; API validation, rate-limited login and basic HTTP hardening.

## Requirements

- Node.js **20.19+** (or 22.12+), npm, and MongoDB 7+ (local or MongoDB Atlas).
- Two terminal windows or use the root `npm run dev` command.

## Local setup

1. Extract this ZIP, open the project folder in VS Code.
2. Create `server/.env` by copying `server/.env.example` and set a strong random `JWT_SECRET` (32+ characters), MongoDB connection string, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`. The example credentials are placeholders; **change them**.
3. Optionally copy `client/.env.example` to `client/.env` and set the API URL (default `http://localhost:4000/api`).
4. Start MongoDB (if using local MongoDB).
5. Run:

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run seed
npm run dev
```

6. Open **http://localhost:5173** and sign in using your seeded admin credentials.
7. For a production frontend build: `npm run build`.

> The seed command is idempotent for demo data: it creates sample leads, customers, deals, activities only if their respective collections are empty. It does **not** overwrite an existing admin account/password.

## REST API

Base URL: `http://localhost:4000/api`. All endpoints except `/health` and `/auth/login` require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` | Login, receive JWT |
| GET | `/auth/me` | Current user |
| GET | `/auth/users` | List team (admin/manager) |
| POST | `/auth/users` | Create team member (admin) |
| PATCH | `/auth/users/:id/role` | Change role (admin) |
| GET | `/dashboard` | Aggregated sales dashboard |
| GET | `/leads`, `/customers`, `/deals`, `/activities` | List records (pagination + search) |
| POST | `/leads`, `/customers`, `/deals`, `/activities` | Create record |
| PATCH | `/:resource/:id` | Edit record |
| DELETE | `/:resource/:id` | Delete record (admin/manager) |

Example login:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_SEEDED_PASSWORD"}'
```

## Folder structure

```text
enterprise-crm-system/
├── client/
│   ├── src/App.jsx       # React pages, tables, modals and dashboard
│   ├── src/api.js        # API client
│   ├── src/style.css     # Responsive UI styles
│   └── .env.example
├── server/
│   ├── src/index.js      # Express app and MongoDB connection
│   ├── src/models/       # Mongoose schemas
│   ├── src/routes/       # Authentication and REST resources
│   ├── src/middleware/   # JWT authentication and RBAC
│   ├── src/seed.js       # Demo data and admin bootstrap
│   └── .env.example
├── package.json          # Combined development scripts
└── README.md
```

## Permissions

| Action | Admin | Manager | Sales |
|---|---|---|---|
| View dashboard / records | All | All | Own only |
| Create records | Yes | Yes | Yes (self-owned) |
| Update records | All | All | Own only |
| Delete records | Yes | Yes | No |
| View team | Yes | Yes | No |
| Create users / change roles | Yes | No | No |

## Deployment notes and limitations

- **Demo/portfolio-ready starter**, not a production-certified enterprise system. Review security, tenancy, auditing, backup, test coverage and monitoring before production use.
- The app assumes a **single organization/workspace**; multi-tenant isolation is not implemented.
- Email activities are **manually recorded**; there is no SMTP, Gmail, or Outlook connection.
- JWTs are stored in browser localStorage for a straightforward demo. Production apps should consider secure httpOnly cookies, CSRF strategy, token rotation and revocation.
- Deleting CRM records does not cascade to related activity records; implement soft deletes or cascade policies for production.
- The dashboard tracks won deal amounts, **not actual booked/collected revenue**.
- Never commit `.env` files or production secrets. Use HTTPS and set `CLIENT_ORIGIN` to your deployed frontend URL.
- Currency is displayed as USD in this demo. Change `money()` in `client/src/App.jsx` to use your preferred currency.

## GitHub upload

Create a new repository, extract the ZIP and upload the **contents** of this folder, not `node_modules` or `.env`. GitHub's web UI can upload files and folders; alternatively:

```bash
git init
git add .
git commit -m "Initial commit: Orbit CRM"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/enterprise-crm-system.git
git push -u origin main
```

MIT licensed for educational and portfolio use.
