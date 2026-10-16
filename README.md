# Pashu Premium Pet Care — Admin Console

A small, self-contained admin website for **Pashu Premium Pet Care Services**.
Create professional **quotations** and **bills**, save them, print them as PDF,
and email them to clients with **EmailJS**.

Everything is plain HTML + CSS + JavaScript. No build step, no server, no database.
All records live in the browser's `localStorage` on the machine you use.

---

## 1. Opening the app

Double-click **`index.html`**, or serve the folder (recommended, avoids any
browser file-access restrictions):

```powershell
cd D:\admin.pashupremiumpetcare
python -m http.server 8899
```

Then open <http://127.0.0.1:8899/>.

---

## 2. Connect EmailJS (one-time, ~5 minutes)

1. Sign up free at **<https://www.emailjs.com>**.
2. **Email Services → Add New Service** → connect your Gmail / Outlook / SMTP.
   Copy the **Service ID** (looks like `service_abc1234`).
3. **Email Templates → Create New Template**. In the template editor set:
   - **To Email** → `{{to_email}}`
   - **Cc** → `{{cc_email}}` (optional, gives you an automatic copy)
   - **From Name** → `{{from_name}}`
   - **Reply To** → `{{reply_to}}`
   - **Subject** → `{{subject}}`
   - **Body** → switch to the HTML/code view and paste the sample template from
     **Settings → Template variables → Sample template HTML** in the app.
   Copy the **Template ID** (`template_xyz9876`).
4. **Account → General** → copy your **Public Key**.
5. In the app open **Settings → EmailJS connection**, paste the three IDs, add
   your business email, tick *Also send a copy to the business inbox*, and press
   **Save connection**. Then press **Send test email**.

   > The account's **public key** and the **template ID** are already pre-filled
   > from `EMAILJS_PRESET` in `assets/js/store.js`, so normally you only have to
   > paste the **Service ID**. Only the public key belongs in that file — the
   > EmailJS *private* key is for server-side use and must never be shipped in
   > this app.

If the test arrives, you are done.

> **Free plan limits:** 200 emails / month, 2 templates. Sending a document uses
> 1 email; sending a copy to yourself uses 1 more. Turn the copy off if you are
> close to the limit (the template `Cc` field gives you a copy for free).

---

## 3. Daily workflow

**Quotation**

1. **New Quotation** in the sidebar.
2. Pick services from **＋ Add from price list…** (or the one-tap packages).
3. Adjust unit / no. of days / rate — the live preview on the right updates as you type.
4. Fill in the client's name, phone, email and pet details.
   *Pick saved* re-uses an existing client.
5. **Save** (or `Ctrl + S`), then **✉ Email to client**.

**Bill**

Same flow from **New Bill**. Bills get their own number series, a *payment due*
date, and an *amount already received* field so the sheet shows the balance due.

**Print / PDF** — press 🖨 Print, then in the browser print dialog choose
*Save as PDF* and **tick "Background graphics"** so the brown letterhead prints.

---

## 4. Pages

| Page | What it does |
|---|---|
| **Dashboard** | Quotation/bill counts, money collected vs outstanding, recent activity, most-quoted services. |
| **New Quotation / New Bill** | The document editor with a live A4 preview. |
| **Documents** | Every saved document — search, filter, open, print, email, duplicate, delete. |
| **Clients** | Auto-built client list with pets, document counts and billed totals. Export to CSV. |
| **Services & Prices** | Your service menu with default rates plus one-tap care packages. |
| **Settings** | Business profile, EmailJS connection, numbering, tax defaults, backup/restore. |

---

## 5. Where your data lives

`localStorage` keys under the `pppc.` namespace:

| Key | Contents |
|---|---|
| `pppc.settings` | Business profile, EmailJS IDs, numbering, defaults |
| `pppc.services` | Service menu and rates |
| `pppc.documents` | All quotations and bills |
| `pppc.clients` | Client records |

**Back up regularly** — *Settings → Data → Export backup (.json)*.
The backup restores via *Import backup*.

> Your EmailJS **public** key is safe in the browser: it is designed to be
> public. The API keys that must stay private are never used here.

---

## 6. File map

```
index.html                     single page, all screens
services.txt                   the service list that seeded the menu
assets/css/styles.css          all styling + the A4 document sheet + print rules
assets/js/store.js             localStorage, money maths, amount-in-words, stats
assets/js/ui.js                toasts, modals, confirms, escaping helpers
assets/js/render.js            builds the printable / emailable document sheet
assets/js/email.js             EmailJS wrapper + template variables
assets/js/views.js             every screen + the document editor
assets/js/app.js               hash router and bootstrap
```

---

## 7. Email template variables

Available to any EmailJS template (full list with descriptions is inside
**Settings → Template variables**):

`to_email`, `to_name`, `cc_email`, `from_name`, `reply_to`, `subject`, `message`,
`doc_type`, `doc_title`, `doc_number`, `doc_date`, `due_or_valid`, `status`,
`client_name`, `client_email`, `client_phone`, `client_address`, `pet_name`,
`pet_info`, `items_html`, `items_text`, `items_count`, `subtotal`, `discount_line`,
`tax_line`, `tax_label`, `tax_rate`, `total`, `total_raw`, `balance_due`,
`amount_in_words`, `notes`, `terms_text`, `business_name`, `business_phone`,
`business_email`, `business_address`, `business_website`, `gstin`, `sent_at`.

---

## 8. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` | Save the open document |
| `Ctrl + P` | Print the open document |
| `Esc` | Close a dialog / the send panel |

---

## 9. Currency and tax

Amounts use the Indian Rupee with Indian digit grouping (`₹1,23,456.00`), and each
document prints the total in words. Tax defaults to **0%** and is configurable per
document, so the same form works whether or not you charge GST. GSTIN, if you add
one in Settings, prints in the letterhead.
