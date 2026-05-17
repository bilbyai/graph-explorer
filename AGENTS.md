No need to run `pnpm --filter web dev` to check for changes.

If you need code references, Check `devrefs list`. In `.devrefs/references/*`

Do not read `.env` or `.env.*` files. Use `.env.example`, typed env config, and
git metadata instead. If a task truly requires inspecting local env values, ask
for explicit approval first and do not print secret values.
