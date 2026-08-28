FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/gateway/package.json ./apps/gateway/

RUN npm ci --workspace=@agent-workspace/dashboard

COPY . .

ARG GATEWAY_INTERNAL_URL=http://gateway:8080
ENV GATEWAY_INTERNAL_URL=$GATEWAY_INTERNAL_URL

RUN npm run build --workspace=@agent-workspace/dashboard

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV GATEWAY_INTERNAL_URL=http://gateway:8080

COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public

WORKDIR /app/apps/dashboard

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (r) => process.exit(r.statusCode < 400 ? 0 : 1))"

CMD ["node", "server.js"]
