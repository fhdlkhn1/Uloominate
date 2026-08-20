# Putting the prototype online

The prototype is plain static files. GitHub Pages serves them over `https://`,
which is all the "this needs to run from a server" message was ever asking for
— once it is hosted, that message can never appear again. Nobody needs Python,
a `.bat` file, or a local server. You send the client a link.

Everything needed is already in this folder. Follow the five steps below once.

---

## 1. Make a repository

On <https://github.com>, click **New repository**.

* **Name** — becomes part of the address. `uloominate-prototype` gives you
  `https://your-name.github.io/uloominate-prototype/`.
* **Public** — GitHub Pages is free on public repositories. A private
  repository needs a paid plan (GitHub Pro or above), and even then the
  published site is still readable by anyone who has the link.
* Do **not** tick "Add a README" — this folder already has one, and an empty
  repository pushes more cleanly.

Copy the `https://github.com/…/….git` address it shows you.

## 2. Push this folder

Double-click **`publish-to-github.bat`**. It asks for that address once,
commits everything and pushes it.

Prefer to type it yourself:

```bash
cd "D:\Web-Development\Professional\Clients Work\Sir Fahad PITB\Uloominate\prototype-2"
git init -b main
git add -A
git commit -m "Uloominate prototype"
git remote add origin https://github.com/your-name/uloominate-prototype.git
git push -u origin main
```

## 3. Turn Pages on

In the repository: **Settings → Pages → Build and deployment → Source →
GitHub Actions**.

That is the only setting to change. The workflow at
`.github/workflows/deploy-pages.yml` is already committed and takes over from
there.

*(If you would rather not use Actions, pick **Deploy from a branch**, then
`main` / `/ (root)`. That works too — the `.nojekyll` file in this folder is
what stops GitHub from trying to rebuild the site as a blog.)*

## 4. Wait for the green tick

Open the **Actions** tab. The first run takes about a minute. When it turns
green, the address appears under **Settings → Pages**:

```
https://your-name.github.io/uloominate-prototype/
```

## 5. Send that link

It opens the start page: a short description, the demo sign-ins, and one button
into the prototype. Every screen works from there.

---

## Publishing changes later

Edit files, then double-click `publish-to-github.bat` again — or:

```bash
git add -A
git commit -m "What changed"
git push
```

The site rebuilds itself within a minute of the push. Tell the client to
hard-refresh (**Ctrl + Shift + R**) if they still see the old version.

---

## Things worth knowing before you send the link

**The site is public.** Anyone with the address can open it. `robots.txt` keeps
it out of Google, but treat the link as semi-private and share it directly
rather than posting it anywhere.

**It needs an internet connection.** React and the web fonts come from a CDN on
first load. Before the real launch these should be self-hosted; for a demo it is
fine.

**Demo data lives in the visitor's own browser.** The client's changes are
theirs alone — they cannot break your copy, and you cannot see theirs. The dev
toolbar in the bottom-right (or <kbd>Ctrl</kbd> + <kbd>.</kbd>) resets it.

**Nothing is really bought, paid, emailed or stored on a server.** Payment
capture, email delivery and file storage are simulated, each marked in the code
with `TODO(backend):`.

---

## Other hosts

Any static host works with no changes at all — every path in the prototype is
relative, so it does not care what folder it is served from.

| Host | How |
|---|---|
| **Netlify** | Drag this folder onto <https://app.netlify.com/drop> |
| **Vercel** | `npx vercel --prod` in this folder |
| **Cloudflare Pages** | New project → Direct Upload → drop the folder |
| **Any web host** | Upload the folder by FTP into a public directory |

Netlify Drop is the fastest of these if you need a link in the next sixty
seconds and do not care about a repository.

---

## What was changed to make this hostable

Nothing about how the prototype works — only its packaging.

| File | Why |
|---|---|
| `index.html` | New start page: description, demo sign-ins, one button into the prototype. GitHub Pages serves it automatically at the root of the address. |
| `standalone.html` | The old `index.html`: the entire prototype compiled into one self-contained file. It never actually finished booting — it registered its screens before the runtime existed, and registered them under a key the runtime ignores, so every screen quietly fell back to fetching its sibling file. Both are fixed in it and in `tools/assemble.js`, so it now runs from disk with no server at all. Screens that read an id from the address still need the served copy. |
| `404.html` | GitHub Pages shows this for a mistyped address; it points back at the start page instead of showing GitHub's own 404. |
| `.nojekyll` | Stops GitHub from running the files through Jekyll, which ignores anything starting with `_` or `.`. |
| `robots.txt` | Keeps the demo out of search results. |
| `.gitignore` | Leaves the 40 MB delivery archive and the `uploads/` working files out of the repository. |
| `.github/workflows/deploy-pages.yml` | Publishes the site on every push. |
| `publish-to-github.bat` | One double-click to commit and push. |
| The 58 `.dc.html` screens | The "needs a server" notice — which only ever appears when a file is opened from disk, never when hosted — now offers `standalone.html` as its first suggestion, because that one does work from disk. |
| `start-windows.bat`, `start-mac-linux.command` | Open the new start page instead of the sitemap. |
