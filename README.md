# StitchLog

Customer and job management for Aoife Stitch Studio (name still a placeholder).
Built from requirements v1.4, phase 1: the admin panel and the customer's private job page.
The public website and SEO come in phase 2.

## What's in phase 1

**Admin panel** (React, works on a phone at the counter)
- **Today**: one big phone-number box. Type a number, the customer appears with a *New job* button. Unknown number: *Add new customer* with the number filled in. Name or job number (SL-0042) works too.
- Overdue, due today and ready-for-pickup lists, plus waiting/in progress counts and money collected this week/month.
- **Customers**: search by name or any part of the phone number, details, notes, tags, consent for marketing messages and website photos, saved measurements reused on every job, full job history newest first, GDPR delete (removes jobs, photos, reviews, messages).
- **Jobs**: several items per visit (*Add another item*), garment type, colour, what needs doing, job price, garment cost, due date with quick picks, urgent flag, deposit, payment method, paid in full, notes. Prices can be filled from the price list.
- Job number printed as a tag (SL-0001, SL-0002...) to write on the garment ticket.
- Before/after photos straight from the phone camera. Shrunk on the phone before upload, then saved as WebP with a thumbnail. Location data (EXIF/GPS) is stripped.
- Status flow: Received, In progress, Ready, Collected (and Cancelled). *Mark ready* prepares the "your job is ready" message with the balance, job page link and Google review link.
- **Sending the message**: by default you tap *Send on WhatsApp* and it opens WhatsApp on your phone with the message typed in (free, no account needed). Automatic SMS/WhatsApp through Twilio can be switched on later in `.env`.
- **Settings**: business details, the ready-message text with a live preview, garment types, price list, password.

**Customer's job page** (`/j/<random token>`, no login)
- Status, expected date, amount to pay, address and opening hours, call/WhatsApp buttons, before/after photos.
- Star rating and comment once the job is ready. 4 or 5 stars then asks them to review you on Google.
- Never indexed by Google (`noindex` header and meta tag). Shows first name only.

## Run it on your computer

Needs Python 3.11+ and Node 20+.

```bash
# API
cd backend
pip install -r requirements.txt
cp .env.example .env          # for local use you can delete the DATABASE_URL line (uses SQLite)
                              # set SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
alembic upgrade head
python -m scripts.seed_services            # starter price list, edit prices in Settings
uvicorn app.main:app --reload             # http://localhost:8000/docs for the API

# Admin panel (second terminal)
cd frontend
npm install
npm run dev                                # http://localhost:5173
```

On your phone (same Wi-Fi), open `http://<your computer's IP>:5173`.

## Import existing customers

```bash
cd backend
python -m scripts.import_customers diary  Customer_Contacts.xlsx
python -m scripts.import_customers fresha customers_all_2024-10-31.csv   # optional, see note
```

- Phone numbers are cleaned up (087..., 353 87..., +353...) and used to spot duplicates. Running it twice is safe.
- The diary import keeps visit counts and notes in the customer's notes. Customers with 3+ visits are tagged *regular*.
- The "Georgian names" sheet: fill in names there and re-run the import. Customers saved as *Unknown* get the new name.
- **Fresha list** (nail clients): every one gets the note "Nail customer" and the tag *nail*, with their original Fresha "Added" date as the customer-since date. People already in the app (from the diary) get the note and tag added instead of a duplicate. SMS marketing consent from Fresha is kept. If the mobile number is blank but the Fresha note holds a number, that number is used.
- Add `--dry-run` to see the numbers first.

From the 2026 diary: 586 unique customers, 76 with names still to fill in.

## Put it online

`docker-compose.yml` runs PostgreSQL, the API and the website (nginx) on one small EU server:

```bash
cp backend/.env.example backend/.env    # fill in, with a long SECRET_KEY
export POSTGRES_PASSWORD=<strong password>
docker compose up -d --build            # site on port 8080
```

Put Caddy or Cloudflare in front for HTTPS and your domain, and set `PUBLIC_BASE_URL` to that address.
Back up the `pgdata` and `media` volumes.

## Tests

```bash
cd backend && pytest                    # 32 tests, SQLite by default
DATABASE_URL=postgresql+psycopg://... pytest   # same tests on PostgreSQL
```

## Project layout

```
backend/   FastAPI, SQLAlchemy 2, Alembic, PostgreSQL
  app/routers/   auth, customers, jobs (+ photos, reviews), dashboard, settings + price list, public job page
  scripts/       import_customers, create_admin, seed_services
frontend/  React + TypeScript, Vite, Tailwind, TanStack Query, React Hook Form + Zod
  src/pages/     Today, Customers, CustomerDetail, CustomerForm, Jobs, JobForm, JobDetail, Settings, PublicJob
```

## Not built yet (next phases)

- Public website: home, services, portfolio, updates, contact form, find us, reviews, FAQ, newsletter, full SEO (sitemap, JSON-LD, Next.js). The price list, reviews (with *Show on website*) and photo consent are already stored ready for it.
- Uncollected reminders, fitting appointments, printable receipts, reports.
- Automatic messages need a Twilio account (or WhatsApp Business API), and background workers if volume grows.
