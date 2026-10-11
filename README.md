# Water Tanker Fair Dispatch Board

Sends the next municipal water tanker to the colony with the greatest need: the least water per person in the last 7 days, counting tanker and piped supply. It also checks that the water actually arrives, and keeps everything public.

**The problem it solves.** Tanker water is often allocated by influence, and some of it never reaches the colony it was meant for. This app fixes the order with a published rule, and records every delivery from three independent sources:
1. **The hydrant fill:** litres and GPS, logged by the driver.
2. **The driver's delivery report:** litres, GPS and a photo.
3. **The colony's own report:** litres received.

Gaps between them are flagged to a ward officer and shown publicly.

**AWS:** API Gateway (HTTP API), Lambda (Python 3.12), DynamoDB (6 tables), S3 (website and private photo bucket), CloudFront (HTTPS), EventBridge schedule, SSM Parameter Store (sign-in secret), CloudWatch alarms with SNS email. All of it is defined in one SAM template (`template.yaml`) and stays in the AWS free tier (see [Free tier](#free-tier)).

## Who uses it

| Role | What they do |
| --- | --- |
| **Colony representative** | Requests water by voice or text in Hindi or English, confirms litres received, and files complaints. For their own colony only. |
| **Driver** | Logs the fill at the hydrant, starts the trip, and reports the delivery with litres, GPS and a photo. Works offline and can be installed on the phone's home screen. For their own tanker only. |
| **Dispatcher** | Assigns tankers; the nearest free tanker is suggested first. Puts tankers on or off duty, releases stuck trips, and requests water on behalf of residents without a phone. Skipping the queue needs a written reason, which is published. |
| **Ward officer** | Reviews alerts and repeat patterns, settles disputes (with the photo as evidence), answers complaints, sets each colony's piped supply and priority weight, and manages accounts. |
| **Public** (no sign-in) | Queue, fleet, ledger, fairness dashboard, queue overrides, complaints board, and open-data CSV. |

Everything is available in English and Hindi (toggle in the header).

## How fairness works

**Recent water, not a hard 7-day window.** Tanker water counts fully for 3 days, then a little less each day, and stops counting after 10 days. A colony's priority therefore changes smoothly instead of jumping when a delivery turns exactly 7 days old.

**Big colonies get enough water, one load at a time.** A request works out how much the colony needs to reach the weekly basic level (20 L × 7 days per person) and how many tanker loads that is (at most 3 per request). After each load, the next one is queued automatically, but only if the colony is still short. It keeps its original request time and competes in the queue like everyone else, so one big colony can't take every tanker. The colony can cancel when it has enough.

The **need score** is the water per person in the last 7 days, divided by the colony's priority weight:
- **Water per person** = tanker litres delivered, divided by people (households × 5), plus the estimated piped supply per person.
- **Priority weight** is 1 by default. The ward officer can set it up to 2 for a clinic, school and so on, with a public reason.

The queue is sorted by need score, lowest first; on a tie, whoever asked first goes first. "Why this position?" explains each place with the real numbers. Urgency words ("children sick", "no drinking water") and heat warnings are shown for context only and never change the order.

**Queue overrides.** The dispatcher can send a tanker out of order, for example for a fire or a hospital, but only with a written reason of at least 10 characters. The reason, the time, the dispatcher and the colonies that were skipped all appear on the Public tab.

**Colony settings** (piped supply, priority, households) can only be changed by the ward officer. Every change is logged on the colony with before and after values.

## How deliveries are checked

| Check | Rule | Result |
| --- | --- | --- |
| Driver vs colony | Litres reported within 10% of each other | **Verified**, colony's figure counted |
| | Further apart | **Disputed**: average counted, shown publicly, sent to the officer |
| Hydrant vs delivery | Delivered more than 10% below the litres filled | **Water missing** alert |
| Fill with no trip / trip cancelled after fill | – | **Filled, not delivered** alert |
| Driver GPS | More than 500 m (plus GPS accuracy) from the colony | Flagged |
| Fill GPS | More than 300 m from every hydrant in `FillPoints` | Flagged |
| Repeat patterns | 2 or more alerts for one tanker or colony in 14 days | Pattern alert to the officer |
| Litres | Never more than the tanker's capacity | Rejected |
| Driver vs hydrant | Driver reports delivering more than was filled for the trip | Rejected |
| Colony vs hydrant | Colony reports more than was filled (10% tolerance) | Flagged |
| Trip without a fill | Delivered with no fill logged, once hydrants are set up | Flagged |
| Escalation | A request waiting over 24 h, or a complaint open over 48 h | Flagged to the officer and shown publicly |
| Water quality | Free chlorine tested by the driver at the fill: below 0.2 mg/L (BIS IS 10500 minimum) or above 5 mg/L (WHO maximum) | The trip cannot start until the driver re-chlorinates and re-tests, or a dispatcher overrides with a published reason |
| Water quality | Above 1 mg/L (safe but strong), or no test logged | Flagged to the officer |
| Dirty water | A colony complains of dirty or short water | Linked to the tanker that delivered there in the last 3 days, and counted on its record |

The officer settles an alert with the litres they established (site visit, photo, phone call) and a note; the decision becomes part of the public record. Every action on a request is kept in its history: who did it (name, role, last 4 digits of their phone) and when.

## Tanker allocation and release

- **Allocation is manual.** The dispatcher assigns a free, on-duty tanker. The tanker becomes `BUSY` in the same DynamoDB transaction, so one tanker can never be given to two colonies.
- **Normal release is automatic.** When the driver reports the delivery, or the colony confirms it, the tanker goes back to `AVAILABLE`.
- **Dispatcher override.** **Release** in "In progress" closes a stuck delivery:
  - "Delivered" records the litres.
  - "Didn't arrive" puts the colony back in the queue with its original request time.
- **Auto-release.** An EventBridge schedule runs every 15 minutes. After `AutoReleaseHours` (default 4) with no report:
  - **On the way** is closed at the tanker's capacity and marked unconfirmed.
  - **Assigned but never left** goes back to the queue.
- **Shifts.** Drivers, dispatchers and the officer can mark a tanker off duty or under repair; it then cannot be assigned.
- **Plan all free tankers.** One click gives every free tanker a colony, strictly in queue order, each colony getting the nearest free tanker. The dispatcher sees the plan with distances and arrival times (at 18 km/h city speed, plus 10 minutes), can edit the times, then assigns them all.
- **Tanker scorecard.** For each tanker, over the last 30 days:
  - **On time:** the promised arrival is recorded when the tanker is assigned (in ward time, India UTC+5:30). A delivery within 15 minutes of it counts as on time.
  - **Average lateness** and **no-shows** (trips taken back because the tanker never came).
  - **Water safety:** the share of chlorine tests in the safe range.
  The scorecard is on the Public Ledger, and the key figures are on each fleet card.
- **Expected arrival for every waiting colony.** The app simulates the day forward, strictly in queue order. Busy tankers are counted from when they finish their current trip, plus 20 minutes to unload. Every trip includes the drive to the nearest hydrant, 20 minutes to fill, and the drive to the colony (at 18 km/h). Waiting colonies see "Expected ≈ 19:25", and the dispatcher sees the estimate on each queue item (`GET /schedule`).
- **Ward setup.** On the Ward Officer tab, the officer adds colonies and hydrants by tapping the map, adds tankers and changes their capacity. Hydrants are stored in the database; the `FillPoints` template setting is only used until the first hydrant is added.

## Smart features (zero cost, no paid AI services)

| Feature | How it works |
| --- | --- |
| Voice or text requests in Hindi or English | Browser speech recognition, then fuzzy matching of the colony name and urgency words in Lambda (`POST /assist/parse`) |
| Heatwave warning | 3-day forecast from Open-Meteo (free, no key); at 40°C or more it names the colonies already low on water. Demo: open the site with `?heat=44` |
| Nearest tanker | Last GPS fix of each tanker (from its latest fill or delivery) vs the colony's coordinates |
| Live ward map | Leaflet + OpenStreetMap (free). Colonies coloured by need (critical / heat risk / enough), tankers with their routes and an estimated position while on the way, hydrants |
| Heat early warning | For the next 3 days: need = 20 L/person/day (WHO basic access) × heat factor (+4% per °C above 35°C, max +60%); supply = last 7 days' rate (tanker + piped). Shows % of need covered, litres short and tanker loads; the dispatcher can queue a colony before it runs dry (`GET /forecast`) |
| Environmental impact | Each assignment records the trip distance and the average distance of all free tankers. Last 30 days: km and diesel saved (3.5 km per litre), CO₂ avoided (2.68 kg per litre of diesel), and litres of missing water caught by the checks (`GET /stats` → `impact`) |
| Voice and simple mode | "Listen" reads the colony's status or the driver's next trip aloud in Hindi or English (browser speech, free). "Simple mode" shows big text and buttons with fewer words |
| Fairness dashboard | Fairness score = 100 × (1 − Gini index of water per person), median waiting times, share of deliveries verified by both sides, 4-week trend |
| Offline driver app | Service worker caches the app; actions taken without signal are queued on the phone and sent when it is back online |

## Sign-in and accounts

Each account is a mobile number plus a 6–8 digit PIN.
- PINs are stored as salted PBKDF2 hashes, and 5 wrong PINs lock the account for 15 minutes.
- Tokens last 7 days and are signed with a secret that `deploy.ps1` creates once in SSM Parameter Store.
- Removing or disabling an account takes effect immediately.

**Adding accounts:**
- **Ward officer:** adds and disables dispatcher, driver and colony accounts on the Officer tab.
- **Officer accounts:** need AWS credentials:
```powershell
'{"addUser": {"phone": "98xxxxxxxx", "pin": "482613", "name": "Meena", "role": "officer"}}' | Out-File -Encoding ascii user.json
aws lambda invoke --function-name <FunctionName> --payload fileb://user.json out.json
# remove: {"removeUser": {"phone": "98xxxxxxxx"}}
```

**Demo accounts** are created by the seed and listed on the sign-in form while demo data is loaded. Do not seed a real deployment: deploy with `-NoSeed` and add real accounts instead.

| Account | Mobile | PIN |
| --- | --- | --- |
| Dispatcher | 9000000001 | 246810 |
| Ward officer | 9000000002 | 135790 |
| Drivers of tnk-01, tnk-02, tnk-03 | 9000000011, 9000000012, 9000000013 | 111111 |
| Reps of col-01 … col-07 | 9000000101 … 9000000107 | 123456 |

The demo data deliberately includes:
- a disputed delivery;
- 3,000 L missing between the hydrant and a colony;
- a fill with no trip behind it;
- a queue override for a fire;
- two complaints.

## Free tier

- **Always free:**
  - Lambda: 1M requests per month. The schedule uses about 2,900.
  - DynamoDB: 6 tables at 4 read and 4 write units each = 24 of the 25 free units.
  - CloudFront: 1 TB and 10M requests per month.
  - CloudWatch: 3 of the 10 free alarms.
  - SNS email: 1,000 per month free.
  - EventBridge schedules and SSM standard parameters: free.
- **12-month free tier, or covered by credits on newer accounts:** API Gateway and S3. Photos are about 150 KB each and are deleted after 365 days.
- **Not free, and off by default:** SNS **SMS**. SMS or missed-call requests and voice updates were left out for this reason.
- **Cost guard:** API throttling at 20 requests per second (burst 50) stops a runaway script from running up usage. Set a **Zero spend budget** in AWS Billing before deploying.

## Run locally with Docker (no AWS account needed)

```powershell
docker compose up -d        # DynamoDB Local + the same Lambda code + nginx
```
- **Site:** http://localhost:8080
- **API:** http://127.0.0.1:3001. `local/server.py` is a small adapter that calls `backend/app.handler`, the same handler that runs in Lambda.
- **Photos:** stored in the container instead of S3.
- **Demo data:** loaded on start.

Useful commands:
- **Run all tests (48):** `docker compose exec api python -m unittest discover -s tests -v`
- **Reset demo data:** `curl -X POST http://127.0.0.1:3001/local/seed`
- **Run the auto-release job now:** `curl -X POST "http://127.0.0.1:3001/local/auto-release?hours=0"`
- **After editing backend code:** `docker compose restart api`
- **Stop:** `docker compose down`

## Where the website is hosted

`deploy.ps1` supports three options:

| Option | Website | When to use |
| --- | --- | --- |
| *(default)* | S3 website behind **Amazon CloudFront** (HTTPS, CDN) | The account is verified for CloudFront |
| `-ApiSite` | Served by the **same API Gateway + Lambda** as the API, over HTTPS | Everything on AWS while CloudFront isn't available (new accounts must be verified for CloudFront) |
| `-ExternalSite` | Hosted elsewhere, e.g. GitHub Pages (the workflow in `.github/workflows/pages.yml` publishes `frontend/`) | Backend only on AWS |

With `-ApiSite`, the script bundles `frontend/` into the Lambda package, and the function serves only the listed app files (`index.html`, `app.js`, `styles.css`, `config.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`). Every other path is the API. The site and the API share one HTTPS address, so GPS, camera and microphone work on phones.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -NoSeed -ApiSite    # switch an existing stack to fully AWS-hosted
```

## Deploy (Windows, AWS CLI only)

You need the AWS CLI v2, configured with `aws configure`, using an IAM user with AdministratorAccess.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1                                  # ap-south-1 (Mumbai), with demo data
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -AlertEmail you@example.com      # also email on errors (click the AWS confirmation link)
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -NoSeed                          # redeploy and keep the data
```
The script:
1. Creates the sign-in secret, the first time only.
2. Packages and deploys the stack.
3. Writes `frontend/config.js` and uploads the site.
4. Loads the demo data, unless you pass `-NoSeed`.

At the end it prints the **Website URL**. Use that HTTPS link: the microphone, GPS and camera only work on HTTPS. The first deploy takes 5–8 minutes because of CloudFront.

**Ward settings** are template parameters; pass them with `--parameter-overrides` on the `aws cloudformation deploy` line:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `WardName`, `WardLatitude`, `WardLongitude` | Delhi | Location used for the heat forecast |
| `HeatThresholdC` | 40 | Temperature (°C) that triggers the heatwave warning |
| `AutoReleaseHours` | 4 | Hours before an unconfirmed tanker is released |
| `FillPoints` | Demo hydrants | The ward's hydrants, as JSON |
| `AlertEmail` | Empty | Email for error alarms |

**If the website gives 403, or the stack fails on the bucket policy,** your account has S3 Block Public Access turned on at account level. Turn it off under S3 → *Block Public Access settings for this account*, then re-run.

## Layout
```
template.yaml         SAM: 6 tables, Lambda, HTTP API (throttled), schedule, website + CloudFront, photo bucket, alarms
backend/app.py        handler, router, validation, role checks, all endpoints
backend/auth.py       phone + PIN sign-in, PIN hashing, signed tokens
backend/ranking.py    need score, queue order, ledger
backend/review.py     alerts, repeat patterns, fairness statistics, open-data CSV
backend/insights.py   heat early warning, trip distances, environmental impact
backend/assist.py     Hindi/English request parsing, "why this position", heat outlook
backend/store.py      DynamoDB and S3 reads/writes (transactions for every state change)
backend/seed.py       demo data
frontend/             index.html, app.js, styles.css, sw.js + manifest (offline, installable)
tests/                test_logic.py (rules), test_api.py (end to end against the local API)
deploy.ps1            one-command deploy
```

## API

**Public:**
`GET /colonies`, `/tankers`, `/queue`, `/schedule`, `/ledger`, `/stats`, `/forecast?simulateMaxC=`, `/overrides`, `/complaints`, `/fillpoints`, `/heat`, `/export/deliveries.csv`, `GET /requests?colonyId=&tankerId=&status=`, `POST /assist/parse`, `POST /auth/login {phone, pin}`.

**Signed in** (`Authorization: Bearer <token>`), by role:

| Role | Endpoints |
| --- | --- |
| Colony rep or dispatcher | `POST /requests {colonyId, note}` |
| Dispatcher | `POST /requests/{id}/assign {tankerId, eta, overrideReason?}`, `/release {outcome, litresDelivered?}` |
| Driver or dispatcher | `POST /requests/{id}/dispatch` |
| Dispatcher | `GET /dispatch/plan`; `POST /requests/{id}/dispatch {qualityOverride}` to send water that failed the chlorine test (reason is published) |
| Driver | `POST /fills/{id}/retest {chlorineMgL}` |
| Colony rep or dispatcher | `POST /requests/{id}/cancel {reason}` |
| Driver | `POST /fills {litres, chlorineMgL?, location?}`, `/requests/{id}/deliver {litresDelivered, location?}`, `/requests/{id}/photo {image}` |
| Colony rep | `POST /requests/{id}/confirm {litresDelivered}` |
| Ward officer | `POST /colonies`, `POST /tankers`, `POST /tankers/{id}/settings`, `POST /hydrants`, `POST /hydrants/{id}/delete`, `GET /review`, `GET/POST /users`, `POST /users/{phone}/disable`, `/requests/{id}/resolve {litresDelivered, note}`, `/fills/{id}/review`, `/colonies/{id}/settings`, `/complaints/{id}/resolve` |
| Driver, dispatcher or officer | `POST /tankers/{id}/status {status}` |
| Any signed-in user | `POST /complaints {type, text}`, `GET /requests/{id}/photo` (officer, dispatcher, that driver, that colony's rep) |

Errors come back as `{"error": "..."}` with status 400, 401 (not signed in), 403 (wrong role), 404, 409 (state changed) or 429 (account locked).

## Clean up
```powershell
aws s3 rm s3://<WebsiteBucketName> --recursive
aws s3 rm s3://<PhotoBucketName> --recursive
aws cloudformation delete-stack --stack-name tanker-dispatch --region ap-south-1
```
