# POSTNEO Карточки: калькулятор питания, база пациентов и печатные листы в одном контейнере.
# Сборка:  docker build -t postneo-kart .            (BASE_PATH по умолчанию пустой — приложение в корне)
#          docker build --build-arg BASE_PATH=/kart -t postneo-kart .   (приложение по адресу /kart)
# Данные:  том /data, в нём один файл postneo.sqlite и его журнал.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# База на встроенном node:sqlite: нативных модулей и компилятора не нужно
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH NEXT_TELEMETRY_DISABLED=1
RUN npm run build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.BASE_PATH||'')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","server.js"]
