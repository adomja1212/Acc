# تعليمات المشروع

## النسخ على Google Drive
بعد كل تحديث للبرنامج (أي commit جديد)، ارفع نسخة مضغوطة من الكود على Google Drive بدون انتظار طلب:

1. `git archive --format=zip -o <scratchpad>/acc-program-vN.zip HEAD`
2. ارفعها بأداة Google Drive (`create_file`) داخل الفولدر **"نظام المحاسب - نسخ البرنامج"**
   (معرّف الفولدر: `1s1ZC4mivSyYf060MU_0AnhfIoEffIG-Y`).
3. اسم الملف: `vN - YYYY-MM-DD - وصف التحديث (الأحدث).zip`، وأزل كلمة "(الأحدث)" من اسم النسخة السابقة.
4. أخبر المستخدم برابط النسخة الجديدة.

## البرنامج المنشور
- الرابط: https://claude.ai/artifact/TYazG5Y6QwK2zjpyHDPfAc — حدّثه بنشر `index.html` مع `styles.css` و `app.js`.
- قاعدة البيانات السحابية تُعدَّل بأداة ArtifactData، و `seed.js` يُحدَّث بنفس التغييرات للوضع المحلي.
