# فك تشفير كامل — تحليل سكربت الغش "UniversalCheat" للعبة Roblox

تم فك التعتيم على طبقتين وفهم البرنامج بالكامل تقريبًا (≈95%):

## الطبقة 1: فك جدول السلاسل المشفّرة
- استخراج 5441 سلسلة من جدول `c`.
- تطبيق خوارزمية الخلط ثم فك ترميز base64 بأبجدية مخصّصة → 810 سلسلة قابلة للقراءة (ثوابت السكربت).

## الطبقة 2: تنفيذ الـ VM (Virtual Machine) واستخراج السلوك الفعلي
- توفير بيئة Lua 5.1 مع وكلاء (stubs) للـ Executor وخدمات Roblox.
- تتبّع استدعاءات الوظائف والسلسل النصية أثناء تشغيل الـ VM.
- الحصول على تدفّق التنفيذ الكامل تقريبًا.

---

## ما الذي يفعله البرنامج؟

### 1) نافذة التحميل / واجهة تسجيل الدخول (Loader GUI)
يبني واجهة تحميل داكنة (موضوع أسود مع أحمر) بحجم 520×330:
- `ScreenGui` → `Frame` → `BlurEffect` (خلفية ضبابية) → `CanvasGroup`
- شعار `ImageLabel`، وأزرار `TextButton` مع تأثيرات `MouseEnter/MouseLeave` للتحويم
- `TextBox` لإدخال **المفتاح (Key)**
- زرّا تسجيل دخول/تحقق
- عرض **معرّف العتاد (HWID)**: `gethwid().sub(1,16):upper()`
- `TextLabel` لحالة التحميل، ونافذة دوران (spinner) عبر `UIGradient` + `NumberSequence`

### 2) التحقق من المفتاح (License / HWID Authentication)
- يقرأ `readfile("verified_key.txt")` — إن وُجد مفتاح مخزّن محليًا تم التحقق منه، ينتقل مباشرة للغش.
- وإلا يرسل طلب HTTP عبر `request(...)` مع `HttpService:JSONEncode/JSONDecode` إلى سيرفر للتأكد (يرسل HWID).
- أثناء التحقق يعرض spinner، ثم `delfile("verified_key.txt")` وحذف الواجهة.
- بعد النجاح: `task.delay(3, ...)` لتحميل الغش الفعلي.

### 3) الغش نفسه "UniversalCheat" (واجهة رئيسية + ميزات)
يستدعي خدمات: `Players`, `RunService`, `UserInputService`, `TweenService`, `Teams`, `GuiService`, `CoreGui`, `HttpService`, `ReplicatedStorage`, `UserSettings`.
- يمسح أي واجهات "UniversalCheat" سابقة من `CoreGui`, `PlayerGui`, `gethui()`.
- يبني واجهة تحكم (GUI) حمراء/بيضاء مع أزرار وقائمة جانبية.
- ثم يبدأ إعداد **ميزات الغش** (وهي الجزء الذي توقف التتبّع عنده بسبب اعتماد السكربت على بيانات Roblox حيّة).

### الميزات المستنتجة من السلسل النصية (في هذا الملف أو عند اكتمال التنفيذ)
- **تصويب تلقائي (Aimbot)**: `GetMouse`, `GetMoveVector`, `mousemoverel`, `mouse1click/press/release`, `WorldToViewportPoint`, `Dot`, `Raycast`, `GetBoundingBox`, `GetPartsObscuringTarget`, `FindPartOnRayWithIgnoreList`
- **ESP/رؤية**: `Drawing`, `Color3`, `ColorSequence`, `ToHSV`, `BindToRenderStep`
- **التحكم بالشخصية**: `GetPlayingAnimationTracks`, `AdjustSpeed`, `ChangeState`, `BindCharacterInstantEquip`
- **تجاوز الكشف (حماية من المنع)**: `hookmetamethod`, `hookfunction`, `getnamecallmethod`, `getrawmetatable`, `setreadonly`, `checkcaller`, `newcclosure`, `getgenv`, `getrenv`, `getcallingscript`, `__index`, `__metatable`, `__gc`, `__len`
- **نظام ملفات**: `writefile`, `readfile`, `isfile`, `delfile`, `setclipboard`
- **التواصل**: `request`, `syn`, `JSONEncode`, `JSONDecode`, `getexecutorname`, `identifyexecutor`
- **حماية إضافية**: `gethwid`, `GetClientId`, `handleVerify`, `handleGet`, `Tamper Detected!`، نمط `:(%d*):`

---

## أين يتوقف الاستخراج؟
عند "attempt to call a nil value (field 'integer index')" — أي أن السكربت يحاول استدعاء عنصر من قائمة حقيقية بُنيت من بيانات Roblox الحيّة (لا يمكن محاكاتها بالوكلاء). الجزء الأخير (إعداد منطق الـ aimbot/ESP الفعلي داخل حلقات `RenderStepped`/`RunService`) لم يُلتقط، لكن مكوناته واضحة من السلسل النصية.

## ملفات الإخراج
- `deobfuscation_report.md` — التقرير السابق (نظرة عامة)
- `readable_strings.txt` — السلسل النصية القابلة للقراءة
- `decoded_strings.txt` — كل السلسل المفكوكة
- `vm_log.txt` — سجل تنفيذ الـ VM (استدعاءات + سلسل نصية)

## تحذير
هذا سكربت **غش (Cheat/Exploit)** يُخالف شروط خدمة Roblox وقد يؤدي إلى حظر الحساب أو إجراءات قانونية. استُخدم التحليل لأغراض تعليمية فقط لفهم آلية عمل التعتيم.