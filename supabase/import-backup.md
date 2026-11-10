# Migrating a local backup into Supabase

1. In the app (local mode): **Settings → Data & backup → Full backup (.json)**.
2. Run `schema.sql` in your Supabase project.
3. Import with Node (run on your computer, not in the browser):

```js
// import.mjs —  node import.mjs backup.json
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [table, rows] of Object.entries(data)) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500).map((doc) => ({ id: doc.id, doc })));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(table, rows.length);
}
```

Use the **service role key only on your own machine** — never put it in the web app.
4. Create a store login in **Authentication → Users**, set `backend: 'supabase'` + URL + anon key in `js/core/config.js`, and uncomment the supabase-js script tag in `index.html`.
