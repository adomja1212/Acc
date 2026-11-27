# تعليمات المشروع

## النسخ على Google Drive
بعد كل تحديث للبرنامج (أي commit جديد)، ارفع نسخة مضغوطة من الكود على Google Drive بدون انتظار طلب:

1. `git archive --format=zip -o <scratchpad>/acc-program-vN.zip HEAD`
2. ارفعها بأداة Google Drive (`create_file`) داخل الفولدر **"نظام المحاسب - نسخ البرنامج"**
   (معرّف الفولدر: `1s1ZC4mivSyYf060MU_0AnhfIoEffIG-Y`).
3. اسم الملف: `vN - YYYY-MM-DD - وصف التحديث (الأحدث).zip`، وأزل كلمة "(الأحدث)" من اسم النسخة السابقة.
4. أخبر المستخدم برابط النسخة الجديدة.

## البرنامج المنشور
- الرابط: https://claude.ai/artifact/TYazG5Y6QwK2zjpyHDPfAc — حدّثه بنشر `index.html` مع `styles.css` و `app.js` و `i18n.js` و `login-hero.jpg` و `app-icon.png`.
- قاعدة البيانات السحابية تُعدَّل بأداة ArtifactData، و `seed.js` يُحدَّث بنفس التغييرات للوضع المحلي.

## النسخة العامة على GitHub Pages
- الرابط: https://adomja1212.github.io/nezam-almohaseb/ — منشور من مستودع `adomja1212/nezam-almohaseb` فرع `main` (مستودع Acc رابطه للعبة، لا تغيّر إعدادات Pages فيه).
- بعد كل تحديث للبرنامج: انسخ `index.html` و `styles.css` و `app.js` و `i18n.js` و `login-hero.jpg` و `app-icon.png` إلى ذلك المستودع وارفعها (`./publish-pages.sh`).
- قاعدة البيانات خارج claude.ai: Supabase (إعدادها في `supabase/setup.sql`).

## تحديث تطبيق أندرويد
- التطبيق (من 1.7) يفحص `version.json` على رابط GitHub Pages ويعرض للمستخدم "تحديث جديد متاح".
- عند بناء نسخة جديدة من التطبيق: زِد versionCode، وانسخ الـ APK إلى `download/nezam-almohaseb.apk` و `version.json` إلى `download/version.json`، ثم `./publish-pages.sh`.
