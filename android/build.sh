#!/usr/bin/env bash
# بناء تطبيق أندرويد "نظام المحاسب" بدون Android SDK (أدوات من Maven Central فقط)
# الاستخدام: ./build.sh [versionCode] [versionName]
# مفتاح التوقيع: android/.keys/acc-release.p12 وكلمة مروره في android/.keys/password.txt
# (لا يُرفعان إلى Git — احتفظ بنسخة منهما، فبدونهما لا يمكن تحديث التطبيق المثبت على الأجهزة)
set -euo pipefail
cd "$(dirname "$0")"
VC="${1:-1}"; VN="${2:-1.0}"
M=https://repo1.maven.org/maven2
mkdir -p .tools build/classes .keys
[ -f .tools/android-all.jar ] || curl -sfLo .tools/android-all.jar $M/org/robolectric/android-all/11-robolectric-6757853/android-all-11-robolectric-6757853.jar
[ -f .tools/dx.jar ] || curl -sfLo .tools/dx.jar $M/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar
[ -f .tools/apksig.jar ] || curl -sfLo .tools/apksig.jar $M/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar

javac -encoding UTF-8 --release 8 -nowarn -cp .tools/android-all.jar -d build/classes src/com/acc/erp/*.java
java -cp .tools/dx.jar com.android.dx.command.Main --dex --min-sdk-version=24 --output=build/classes.dex build/classes
python3 mkapk.py build/classes.dex build/unsigned.apk "$VC" "$VN"

if [ ! -f .keys/acc-release.p12 ]; then
  python3 -c "import secrets;print(secrets.token_urlsafe(18))" > .keys/password.txt
  keytool -genkeypair -storetype PKCS12 -keystore .keys/acc-release.p12 -alias acc -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=Nezam Almohaseb, O=ACC, C=EG" -storepass "$(cat .keys/password.txt)"
fi
javac --release 8 -nowarn -cp .tools/apksig.jar -d build Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED --add-opens java.base/sun.security.x509=ALL-UNNAMED --add-opens java.base/sun.security.pkcs=ALL-UNNAMED --add-opens java.base/sun.security.util=ALL-UNNAMED -cp build:.tools/apksig.jar Sign .keys/acc-release.p12 "$(cat .keys/password.txt)" acc build/unsigned.apk "build/nezam-almohaseb-v$VN.apk"
cp "build/nezam-almohaseb-v$VN.apk" build/sawah-erp.apk
printf '{"versionCode": %s, "versionName": "%s", "url": "https://adomja1212.github.io/nezam-almohaseb/sawah-erp.apk", "notes": "%s"}\n' "$VC" "$VN" "${NOTES:-تحسينات في التطبيق}" > build/version.json
echo "APK: android/build/nezam-almohaseb-v$VN.apk (+ build/sawah-erp.apk و build/version.json لقناة التحديث)"
