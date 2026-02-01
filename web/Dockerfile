FROM node:20-alpine AS deps
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY package.json tsconfig.json next.config.js next-env.d.ts /app/
COPY app /app/app
COPY public /app/public
RUN npm install

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
EXPOSE 3000
CMD ["npm", "run", "dev"]
