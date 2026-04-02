# CV Match

Web app to **upload CVs (PDF)** and **job descriptions** (PDF or text), then **score candidates against a role** using **AI on the server** — **[Amazon Bedrock](https://aws.amazon.com/bedrock/)** when configured (Claude + Titan embeddings), or **[Google Gemini](https://ai.google.dev/)** as fallback or standalone (Flash-Lite + text embeddings). Results are stored on disk as JSON so you can compare runs over time.

Product goals and features are summarized in [PRD.md](./PRD.md).

---

## What you need installed

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **20.x or newer** (LTS recommended). [nodejs.org](https://nodejs.org/) |
| **npm** | Ships with Node; this repo uses `package-lock.json`. |
| **AWS credentials** | Optional if you use **Gemini** only: configure the [default credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) when using **Amazon Bedrock** (preferred when configured). The app calls AI APIs only from the server. |

Optional:

- **Git** — to clone this repository.
- **GitHub CLI (`gh`)** — only if you use it for other workflows; not required to run the app.
- **Docker** — optional; see [Deploy locally](#deploy-locally) (Docker Compose) and [Deploy to AWS](#deploy-to-aws).

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/SantiagoSiordia/cv-match.git
cd cv-match
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (same folder as `package.json`):

```bash
cp .env.example .env
```

Configure **at least one** AI backend (see [`.env.example`](.env.example)):

- **Amazon Bedrock (default when available):** set `AWS_REGION` and valid AWS credentials. Optional: `BEDROCK_TEXT_MODEL_ID`, `BEDROCK_EMBEDDING_MODEL_ID` (defaults in [`src/lib/constants.ts`](src/lib/constants.ts)).
- **Google Gemini (fallback or standalone):** set `GEMINI_API_KEY`. With **`AI_PROVIDER=auto`** (the default), the app tries Bedrock first and uses Gemini when Bedrock is not configured or returns credential/access errors. Set **`AI_PROVIDER=gemini`** to use only Gemini (e.g. local dev without AWS keys). Cheapest defaults are **`gemini-2.5-flash-lite`** for text and **`gemini-embedding-001`** for embeddings (override with `GEMINI_TEXT_MODEL` / `GEMINI_EMBEDDING_MODEL`). Transient **503 / rate limits** are retried with backoff (**`GEMINI_MAX_RETRIES`**, default 5). If Flash-Lite is often overloaded, try **`GEMINI_TEXT_MODEL=gemini-2.5-flash`** (slightly pricier, often more capacity).

```env
AWS_REGION=us-east-1
# GEMINI_API_KEY=your-key   # enables Gemini fallback or AI_PROVIDER=gemini
```

For **Docker / ECS**, set **`CV_MATCH_DATA_ROOT`** to the mounted volume path (e.g. `/data`) so uploads and evaluations persist.

**Bedrock model access:** In the AWS console, open Amazon Bedrock → **Model access** (or your org’s equivalent) and enable the foundation models you use. IAM permissions alone are not enough if a model is not enabled for the account/region.

Restart the dev server after changing `.env`.

### 3. Local data folders

By default the app writes under the project root (or under `CV_MATCH_DATA_ROOT` when set):

| Folder | Purpose |
|--------|---------|
| `cvs-pdf/` | CV PDFs (`{uuid}.pdf`) |
| `cvs-extracted/` | Text extracted from each CV |
| `cvs-meta/` | Metadata JSON per CV |
| `job-descriptions/` | Uploaded JD files + sidecars |
| `evaluations/` | One JSON file per evaluation run |
| `embeddings/` | Cached embedding vectors for job descriptions (used by CV “Match to jobs”) |

These directories are **gitignored** in this repo (only `.gitkeep` files are committed). They are created automatically when you use the app.

Add job descriptions in the app under **Jobs** (`/job-descriptions`); upload CVs under **CVs** (`/cvs`). Optional CLI helpers for bulk PDFs live under `scripts/` (see `ingest:cvs` and `ingest:cv-dataset` in `package.json`).

---

## Deploy locally

Run the app on your machine. Complete [Setup](#setup) first (including `.env` with Bedrock **or** Gemini as in [Environment variables](#2-environment-variables)). If you use Bedrock, enable the models under **Amazon Bedrock → Model access** in the AWS console and configure [AWS credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

### Development server (hot reload)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**If dev mode uses too much CPU or memory (common on smaller Macs):** the default uses **Turbopack** (`--turbopack`), which can be heavy. Try one of these:

| Command | What it does |
|---------|----------------|
| `npm run dev:webpack` | Webpack dev server instead of Turbopack — often steadier on low-RAM machines. |
| `npm run dev:minimal` | Webpack + no dev source maps — a bit less work for the bundler. |
| `npm run build && npm run start` | **Production server** — no hot reload, but much lower ongoing CPU/RAM while you click around. |

Also close other large dev tools (extra Docker containers, other Node servers) and avoid running the app from a huge monorepo root if you can open only this folder in the editor.

### Production build without Docker

```bash
npm run build
npm run start
```

Then open [http://localhost:3000](http://localhost:3000). Data is written under the project root (see [local data folders](#3-local-data-folders)).

### Docker Compose (production-like image)

Use this to run the same **standalone** image as in AWS, with uploads stored in **`./.local-data`** on your host (gitignored).

1. Copy [`.env.example`](.env.example) to `.env` and set at least `AWS_REGION`.
2. **Credentials in the container:** put short-lived keys in `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` if needed), **or** copy [`docker-compose.override.example.yml`](docker-compose.override.example.yml) to `docker-compose.override.yml` to mount `~/.aws` (works well with `aws sso login`).
3. Start:

```bash
npm run local:docker
```

Open [http://localhost:3000](http://localhost:3000). Stop with `Ctrl+C` or `npm run local:docker:down`.

If **port 3000 is already in use** (for example another `npm run dev`), use another host port:

```bash
HOST_PORT=3001 npm run local:docker
```

Without npm: `docker compose up --build`.

### Docker without Compose

```bash
docker build -t cv-match .
docker run -p 3000:3000 -v cv-match-data:/data \
  -e CV_MATCH_DATA_ROOT=/data \
  -e AWS_REGION=us-east-1 \
  cv-match
```

---

## Deploy to AWS

The [CloudFormation template](infrastructure/cv-match.yaml) creates an **Application Load Balancer**, **ECS Fargate** service, **EFS** (mounted at `/data` in the task), **CloudWatch Logs**, and an IAM **task role** that can invoke Bedrock. The task sets `CV_MATCH_DATA_ROOT=/data` so uploads and evaluations persist on EFS.

### Prerequisites

- AWS CLI configured (`aws sts get-caller-identity` works).
- A **VPC** with **two public subnets** in different Availability Zones (same subnets are used for the ALB, EFS mount targets, and tasks in this template).
- **Amazon ECR** repository in your Region to store the image (create one if needed).
- **Bedrock:** enable the text and embedding models matching your parameters (e.g. Claude Haiku, Titan Embeddings v2) under **Model access** for the account/Region.

### 1. Build and push the image to Amazon ECR

Replace `REGION`, `ACCOUNT_ID`, and `cv-match` with your AWS Region, account ID, and repository name.

```bash
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com

docker build -t cv-match .

docker tag cv-match:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/cv-match:latest

docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/cv-match:latest
```

### 2. Deploy the stack

Point `ImageUri` at the image you pushed. `VpcId`, `PublicSubnet1`, and `PublicSubnet2` must belong to the same VPC.

```bash
aws cloudformation deploy \
  --stack-name cv-match \
  --template-file infrastructure/cv-match.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    VpcId=vpc-xxxxxxxx \
    PublicSubnet1=subnet-aaaaaaaa \
    PublicSubnet2=subnet-bbbbbbbb \
    ImageUri=ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/cv-match:latest
```

Optional: add overrides such as `DesiredCount=2`, `ContainerCpu=1024`, `ContainerMemory=2048`, or `AllowedIngressCidr=203.0.113.0/24` (see template parameters).

### 3. Open the app

After the stack is `CREATE_COMPLETE`, get the load balancer DNS name:

```bash
aws cloudformation describe-stacks \
  --stack-name cv-match \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDns'].OutputValue" \
  --output text
```

Open `http://` plus that hostname in a browser (HTTP on port 80). Wait until the target group marks the task healthy.

### Networking note

The template uses **public subnets** and **AssignPublicIp=ENABLED** on tasks so Fargate can reach **ECR** and **Bedrock** without a NAT gateway (lower cost, fine for demos). For production, prefer **private subnets** with a **NAT gateway** or **VPC endpoints** (ECR, Logs, Bedrock) and TLS on the ALB.

---

## Optional: bulk CV dataset

This project includes scripts to import a **public dataset** of sample CV PDFs for testing. It is **not** required to run the app.

**Source repository:** [arefinnomi/curriculum_vitae_data](https://github.com/arefinnomi/curriculum_vitae_data)

- PDFs live under the `pdf/` folder on the default branch.
- The dataset is described in that repo’s README and licensed under **ODbL** / **Database Contents License** — see their [LICENSE](https://github.com/arefinnomi/curriculum_vitae_data/blob/master/LICENSE.md) before redistributing.

**Import all PDFs from that GitHub repo** (downloads over the network; does **not** call Bedrock per file unless you opt in):

```bash
npm run ingest:cv-dataset
```

- Default: **skips** AI metadata (fast, no Bedrock usage per CV).  
- To run Bedrock metadata on every file (slow, many API calls):  
  `INGEST_CV_AI=1 npm run ingest:cv-dataset`  
  (Legacy: `INGEST_CV_GEMINI=1` is still accepted.)

Tuning:

- `INGEST_CONCURRENCY=4` — parallel downloads/parsing (default `3`).
- `INGEST_MAX_FILES=50` — cap for a quick test.

**Import from a local folder of PDFs:**

```bash
npx tsx scripts/ingest-pdfs-from-directory.ts /path/to/folder-of-pdfs
```

If you ever had CVs in a **single** `cvs/` folder and move to the split layout (`cvs-pdf/`, `cvs-extracted/`, `cvs-meta/`):

```bash
npm run migrate:cvs-layout
```

---

## Quality checks (lint, types, tests)

```bash
npm run check
```

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint only |
| `npm run test` | Vitest once |
| `npm run test:watch` | Vitest watch mode |

---

## Security notes

- Never commit `.env` or long-lived access keys when avoidable; on AWS, prefer an **IAM role** on the workload (e.g. ECS task role) for Bedrock.
- Bedrock and file APIs run only on the server (Next.js Route Handlers); credentials are not exposed to the browser.
