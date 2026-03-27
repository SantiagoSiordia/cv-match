# Production image (Next.js standalone). Build from repo root:
#   docker build -t cv-match .
#
# Run with a writable data volume:
#   docker run -p 3000:3000 -v cv-match-data:/data -e CV_MATCH_DATA_ROOT=/data \
#     -e AWS_REGION=us-east-1 -e BEDROCK_TEXT_MODEL_ID=... cv-match

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV CV_MATCH_DATA_ROOT=/data

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
