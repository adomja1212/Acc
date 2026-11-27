#!/usr/bin/env bash
# ينشر ملفات البرنامج على رابط GitHub Pages: https://adomja1212.github.io/nezam-almohaseb/
set -euo pipefail
cd "$(dirname "$0")"
DEST="${1:-../nezam-almohaseb}"
[ -d "$DEST/.git" ] || git clone https://github.com/adomja1212/nezam-almohaseb "$DEST"
cp index.html styles.css app.js i18n.js login-hero.jpg "$DEST/"
cd "$DEST"
git add -A
git diff --cached --quiet && { echo "لا تغييرات"; exit 0; }
git commit -m "تحديث البرنامج"
git push origin main
