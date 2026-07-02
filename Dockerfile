# Officieel Playwright-image: bevat Node.js 20 + Chromium + alle systeemlibraries
# (libnss3, libatk, enz.) die de headless browser nodig heeft. Dit lost het
# "libnss3.so.0: cannot open shared object file"-probleem op Railway definitief op.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# Eerst enkel de manifesten kopiëren voor betere layer-caching.
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/scraper/package.json ./packages/scraper/
COPY packages/web/package.json ./packages/web/

# Alle dependencies installeren. --include=dev forceert de devDependencies
# (TypeScript, Vite) ook wanneer Railway NODE_ENV=production tijdens de build zet.
RUN npm ci --include=dev

# Rest van de broncode kopiëren.
COPY . .

# Monorepo bouwen (scraper + api + web).
RUN npm run build

# Chromium-browser matchen met de geïnstalleerde Playwright-versie.
# De systeemlibraries zitten al in het base-image.
RUN npx playwright install chromium

ENV NODE_ENV=production

# Railway injecteert de PORT-variabele; de API leest deze.
CMD ["npm", "run", "start"]
