# CV Match — Product Requirements Document

## Overview

CV Match is a web application that uses AI (Google Gemini) to evaluate the compatibility between candidate CVs and job descriptions. Users upload CVs and job descriptions, then get AI-powered analysis showing how well each candidate fits a given role.

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

- Upload CVs in PDF format (stored under `cvs-pdf/`, with text in `cvs-extracted/` and metadata in `cvs-meta/`)
- List, preview, and delete uploaded CVs
- Extract and display key information (name, skills, experience)

### 2. Job Description Management

- Upload or create job descriptions in the `job-descriptions/` folder
- List, preview, and delete job descriptions
- Support PDF and plain text formats

### 3. Compatibility Evaluation

- Select one or more CVs and a job description to evaluate
- Send content to Google Gemini API for analysis
- Display a compatibility score (0–100) with breakdown:
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

| Layer    | Technology                |
| -------- | ------------------------- |
| Frontend | TBD (React, Next.js, etc.) |
| Backend  | TBD                       |
| AI       | Google Gemini API          |
| Storage  | Local filesystem (initially) |

## Folder Structure

```
cv-match/
├── cvs-pdf/              # CV PDFs ({uuid}.pdf)
├── cvs-extracted/        # Extracted text per CV ({uuid}.extracted.txt)
├── cvs-meta/             # CV metadata JSON ({uuid}.meta.json)
├── job-descriptions/     # Uploaded job descriptions
├── evaluations/          # Saved evaluation runs
└── PRD.md
```

## Non-Functional Requirements

- Gemini API key stored securely (environment variable, never committed)
- File size limit for uploads (e.g., 10 MB)
- Responsive UI (desktop and mobile)

## Out of Scope (v1)

- User authentication and multi-tenancy
- Database-backed storage
- Batch processing / bulk imports
- Email notifications

## Open Questions

- Preferred frontend framework?
- Should evaluations be persisted in a database or kept in-memory / local files?
- Any specific scoring rubric or criteria beyond the defaults?
