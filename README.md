# DonutSMP Casino (unofficial fan project, 18+)

Not affiliated with or endorsed by DonutSMP or Mojang. Deposits and withdrawals use DonutSMP in-game money and are confirmed by hand by the owner.

## Run it
```
node server.js        # Node 18+, no npm install needed
# open http://localhost:3000
```

## Settings (environment variables)
| Variable | What it does |
|---|---|
| `RESEND_API_KEY` | Sends the owner emails through resend.com (free account). Without it, the confirm links are printed in the server console instead. |
| `MAIL_FROM` | Sender address. The default `onboarding@resend.dev` only delivers to the email you signed up to Resend with, so sign up with Henry1212uhuh@Gmail.com. |
| `OWNER_EMAIL` | Where confirmation emails go (default `Henry1212uhuh@Gmail.com`). |
| `PAY_TO` | In-game name players pay (default `Hellofortnitep`). |
| `BASE_URL` | Public address of the site, used in the email links (e.g. `https://yoursite.com`). |
| `ADMIN_TOKEN` | Password for `/admin?token=...`, a page listing every pending request. |
| `SESSION_SECRET`, `HTTPS=1`, `PORT` | Normal production settings. Always run behind HTTPS. |

## How money moves
1. **Sign up:** email is the username, password 8+ characters, 18+ checkbox required.
2. **Deposit:** the player enters an amount and their DonutSMP name, pays Hellofortnitep with `/pay`, then presses "I've paid". You get an email with "YES, I got it" and "NO" links. Each link opens a confirm page with a button (so email scanners can't approve by accident). YES credits the balance once. Replays do nothing.
3. **Withdraw:** login required, max 500m per request, and the player must first wager at least their total deposits. Their coins are held right away and you get an email to `/pay` them in-game. Press "I paid them" to finish, or "Reject" to refund.
4. Balances and game results are decided only on the server.

## Limits
- Only Coinflip, Roulette, Crash (auto cash-out), Cases and Jackpot run on the server. The other games are demo-only.
- Free coins are off (they would be withdrawable). Set `FREE_COINS=1` to turn them on.
- Data lives in `data.json`. Use a real database before heavy traffic.
- Live chat and rain only work on the hosted claude.ai demo.
