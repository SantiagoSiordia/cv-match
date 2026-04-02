# CV Match — Product Requirements Document

## Overview

CV Match is a web application that uses **[Amazon Bedrock](https://aws.amazon.com/bedrock/)** to evaluate compatibility between candidate CVs and job descriptions. **Claude** (configurable text model) produces structured scores and narrative analysis; **Titan Embeddings** (configurable embedding model) supports semantic similarity where the app computes embeddings (e.g. job–CV matching helpers). Users upload CVs and job descriptions, run evaluations, then review AI-assisted analysis of how well each candidate fits a given role.

## Problem Statement

Recruiters and hiring managers spend significant time manually reviewing CVs against job requirements. This process is slow, inconsistent, and prone to human bias. An AI-powered tool can provide fast, structured, and objective compatibility assessments.

## Goals

- Provide an intuitive UI for managing CVs and job descriptions
- Deliver AI-powered compatibility scores and detailed analysis
- Reduce time-to-shortlist for hiring workflows

## Users

- Recruiters
- Hiring managers
- Small business owners handling their own hiring

## Core Features

### 1. CV Management

- Upload CVs as **PDF** (stored under `cvs-pdf/`, with text in `cvs-extracted/` and metadata in `cvs-meta/`)
- List, preview, **search**, and delete uploaded CVs
- Extract and display key information (name, skills, experience) via structured LLM output

### 2. Job Description Management

- Upload or create job descriptions under `job-descriptions/` (**PDF** or **plain text**)
- List, preview, **search**, and delete job descriptions

### 3. Compatibility Evaluation

- Select **one** job description and **one or more** CVs to evaluate (primary flow: **`/evaluate`**, also the default landing route)
- Send content to **Amazon Bedrock** for analysis (server-side only; requires AWS region, credentials, and model access in the account)
- Display a compatibility score (0–100) with breakdown, for example:
  - Skills match
  - Experience relevance
  - Education fit
  - Overall strengths and gaps
- Provide a written summary explaining the evaluation

### 4. Results Dashboard

- View evaluation history
- Sort and filter candidates by score
- Compare multiple candidates side-by-side for a single role

## Tech Stack

| Layer        | Technology |
| ------------ | ---------- |
| Frontend     | **Next.js** (App Router), **React**, TypeScript |
| Backend      | Next.js server routes / server actions; filesystem persistence |
| AI           | **Amazon Bedrock** — default text: **Claude 3.5 Haiku** (`BEDROCK_TEXT_MODEL_ID`); default embeddings: **Titan Embed Text v2** (`BEDROCK_EMBEDDING_MODEL_ID`). Override via environment variables. |
| Storage      | **Local filesystem** under the project root, or under **`CV_MATCH_DATA_ROOT`** (e.g. Docker bind mount / **EFS** in AWS) |
| Deploy (opt) | **Docker** (standalone Next output), **AWS** (e.g. ECS Fargate + ALB + EFS) — see `README.md` |

## Data layout

Default paths are relative to the process working directory unless **`CV_MATCH_DATA_ROOT`** is set:

```
cv-match/
├── cvs-pdf/              # CV PDFs ({uuid}.pdf)
├── cvs-extracted/        # Extracted text per CV ({uuid}.extracted.txt)
├── cvs-meta/             # Metadata JSON per CV ({uuid}.meta.json)
├── job-descriptions/     # Job description files + extracted text + meta sidecars
├── evaluations/          # Saved evaluation runs (JSON)
├── embeddings/           # Cached embedding artifacts (e.g. job index for matching)
└── PRD.md
```

## Non-Functional Requirements

- **AWS credentials** and **`AWS_REGION`** (or `AWS_DEFAULT_REGION`) configured for the server process; never commit secrets (use `.env`, IAM roles in AWS)
- **Bedrock model access** enabled in the AWS account/region for the models referenced by `BEDROCK_*` env vars
- File size limit for uploads (**10 MB** per app constants)
- Responsive UI (desktop and mobile)

## Out of Scope (v1 product UI)

- End-user authentication and multi-tenancy
- Database-backed storage (app uses JSON on disk)
- In-app bulk processing UX (developer **CLI ingest scripts** may exist for seeding data; not part of core recruiter UI)
- Email notifications

## Open Questions

- Any specific scoring rubric or criteria beyond the defaults?
- Regional / language requirements (affects optional model choices on Bedrock)
