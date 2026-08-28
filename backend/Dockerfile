# GriviTness API
#
# Base directory di Coolify WAJIB diarahkan ke /backend. Repo ini tiga folder
# yang berdiri sendiri tanpa package.json di akarnya, jadi build dari akar repo
# tidak akan menemukan apa pun untuk dipasang.

FROM node:20-slim

WORKDIR /app

# Manifest disalin lebih dulu, terpisah dari kode. Selama package.json dan
# lockfile tidak berubah, lapisan npm ci diambil dari cache dan deploy berikutnya
# melewati seluruh pemasangan dependency.
COPY package*.json ./

# npm ci, bukan npm install: versinya dikunci persis seperti lockfile, jadi yang
# jalan di server sama dengan yang diuji di sini.
#
# devDependencies ikut terpasang karena TypeScript dibutuhkan untuk build di
# baris bawah. NODE_ENV sengaja belum disetel production pada titik ini, sebab
# npm akan melewati devDependencies dan `npm run build` langsung gagal.
RUN npm ci

COPY . .

RUN npm run build

# Baru disetel SESUDAH build. Ini mematikan log level debug dan mengaktifkan
# jalur production di config/env.ts.
ENV NODE_ENV=production

# Sekadar keterangan. Port sesungguhnya dibaca dari env PORT, yang bawaannya
# 3000 di config/env.ts.
EXPOSE 3000

# Bentuk exec, bukan shell. Node jadi PID 1 dan menerima SIGTERM langsung dari
# Coolify saat deploy ulang, sehingga graceful shutdown di src/server.ts
# benar-benar berjalan dan request yang sedang diproses tidak terputus.
CMD ["node", "dist/server.js"]
