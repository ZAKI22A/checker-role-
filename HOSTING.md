# 🚀 دليل نشر وتشغيل البوت على الاستضافة (Hosting Guide)

هذا الدليل يشرح كيفية استضافة وتشغيل بوت **Kiliua Security Intelligence & Checker** على مختلف منصات الاستضافة المجانية والمدفوعة مع الحفاظ على سرية التوكنات وأمانها.

---

## 🔒 1. إدارة التوكنات والأمان (Secrets & Environment Variables)

> [!IMPORTANT]
> **لا تقم أبداً بمشاركة توكناتك أو رفعها على GitHub.** تم تجهيز البوت لقراءة التوكنات من **متغيرات البيئة (Environment Variables)** تلقائياً من خلال ملف `.env` أو لوحة تحكم الاستضافة.

المتغيرات الأساسية المطلوبة:
| المتغير | الوصف | مثال |
| :--- | :--- | :--- |
| `MAIN_BOT_TOKEN` | توكن البوت الأساسي من Discord Developer Portal | `MTQ5NjQ...` |
| `CHECKER_USER_TOKEN` | توكن حساب الديسكورد (Selfbot) المستخدم للفحص | `MTM3MT...` |
| `FALLBACK_USER_TOKEN` | توكن احتياطي في حال تم حظر التوكن الأول بمعدل الطلبات | `MTM3MT...` |
| `MAIN_BOT_ID` | آيدي البوت | `1496429744801972284` |
| `CHECKER_USER_ID` | آيدي حساب الفاحص | `1371904200228868096` |
| `OWNER_IDS` | آيدي صاحب البوت أو المسؤولين (مفصولة بفاصلة) | `1155753199307870268` |
| `CHECKER_PORT` أو `PORT` | المنفذ الداخلي للفاحص | `4567` |

---

## 🌐 2. خيارات الاستضافة السحابية الموصى بها

### الخيار أ: الاستضافة على Railway (موصى به جداً وسهل)
1. قم بإنشاء حساب على [Railway.app](https://railway.app).
2. اضغط على **New Project** ثم اختر **Deploy from GitHub repo**.
3. اختر مستودعك `ZAKI22A/checker-role-`.
4. اذهب إلى تبويب **Variables** (أو **Environment**)، وأضف المتغيرات المذكورة في الجدول أعلاه.
5. ستقوم المنصة تلقائياً ببناء وتشغيل البوت بواسطة `index.js` أو `Dockerfile`.

### الخيار ب: الاستضافة على Render (Render.com)
1. سجّل الدخول إلى [Render.com](https://render.com).
2. اضغط على **New +** ثم اختر **Background Worker** (أو **Web Service**).
3. اربط حسابك بـ GitHub واختر المستودع `ZAKI22A/checker-role-`.
4. حدد:
   - **Environment**: `Node` (أو `Docker`)
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
5. في قسم **Environment Variables**، أضف التوكنات والإعدادات الخاصة بك.
6. اضغط **Create Service**.

### الخيار ج: الاستضافة على خادم خاص أو VPS (Ubuntu / Debian)
إذا كنت تستخدم VPS (مثل DigitalOcean, Hetzner, Contabo):

1. **تثبيت المتطلبات ومكتبات Canvas**:
```bash
sudo apt update
sudo apt install -y nodejs npm git build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

2. **نسخ المستودع وتثبيت الحزم**:
```bash
git clone https://github.com/ZAKI22A/checker-role-.git
cd checker-role-
npm install
```

3. **إعداد التوكنات**:
```bash
cp .env.example .env
nano .env
# الصق التوكنات واحفظ الملف (Ctrl+O ثم Enter ثم Ctrl+X)
```

4. **التشغيل باستمرار عبر PM2 (الخيار الأفضل للـ VPS)**:
```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🐳 3. التشغيل باستخدام Docker

إذا كنت تفضل Docker:
```bash
# بناء الصورة وتشغيل الحاوية
docker-compose up -d --build

# لمتابعة السجلات (Logs)
docker-compose logs -f
```

---

## ✅ التحقق من عمل البوت
عند التشغيل بنجاح، ستلاحظ في السجلات (Logs):
```
[START] Starting checker.js...
[START] Starting bot.js...
======================================================================
    KILIUA CHECKER ENGINE v10.11
======================================================================
Checker running on http://localhost:4567
======================================================================
    KILIUA SECURITY INTELLIGENCE v9.2
======================================================================
Logged in as Kiliua#0000!
```
