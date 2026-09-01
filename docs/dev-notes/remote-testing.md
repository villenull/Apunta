# Letting her test from her own laptop

Workflow scratch, not part of the app. The practice owner wants to try Apunta
from her MacBook while the model runs on the partner's Linux PC, before
anything is installed on her machine.

**This is a testing bridge, not a change of direction.** Hard rule 1 stands
for what ships: the server binds `127.0.0.1` and speaks to nothing else.
Nothing here changes a line of the app.

## What was verified on this machine (2026-08-31)

- **A reverse proxy in front of the app needs no code change.** The server
  does not inspect the `Host` header, so a request arriving as
  `fbi-pc.tail1234.ts.net` is served normally — health, the SPA and the API
  all answered through a proxy bound to a second loopback address.
- **SSE survives the proxy.** A draft's first frame arrived immediately and
  29 frames spread across the 20-second generation, so she would watch the
  note assemble rather than wait and receive it whole.
- **The app stayed loopback-only throughout.** `ss -ltn` showed the server on
  `127.0.0.1:7717` and only the proxy on another address. The proxy is a
  separate process; the app's own invariant is untouched.

## The constraint that picks the method

**A microphone needs a secure context.** Browsers refuse `getUserMedia` over
plain `http://` to anything except localhost. Over a bare tailnet address
like `http://100.x.y.z:7717`, dictation — her primary input — would simply
not work, with nothing on screen explaining why.

So the method must give her **either HTTPS with a certificate her browser
already trusts, or a URL that is literally localhost on her machine.**

## Recommended: Tailscale Serve

A private WireGuard mesh between the two machines, with an HTTPS front door
only devices in the tailnet can reach.

1. Install Tailscale on both machines and sign in on each. **Yours to do** —
   installing system software and creating an account are not things to hand
   to an agent.
2. In the Tailscale admin console, enable **MagicDNS** and **HTTPS
   certificates** for the tailnet. Without HTTPS the microphone problem above
   comes straight back.
3. Start Apunta on the PC exactly as now — unchanged, on `127.0.0.1:7717`.
4. Publish it to the tailnet only:

   ```sh
   tailscale serve --bg 7717
   tailscale serve status
   ```

   `status` prints the `https://<machine>.<tailnet>.ts.net` address. The flag
   spelling has changed across Tailscale versions; if that form is rejected,
   `tailscale serve --help` carries the current one. What matters is that it
   proxies to **`127.0.0.1:7717`** and that the verb is `serve`.

5. Give her the printed URL. It resolves only from devices signed into the
   same tailnet.

Stop sharing with `tailscale serve reset`.

### Never `tailscale funnel`

`serve` publishes to your tailnet. **`funnel` publishes to the public
internet.** Apunta has no login of any kind, so a funnel URL is an
unauthenticated clinical-notes application open to whoever finds it.

## Alternatives, and why they rank lower

| Method | Microphone | Who can see the notes | Cost |
| --- | --- | --- | --- |
| Tailscale Serve | works, real certificate | the two devices | account and install |
| SSH tunnel (`ssh -L 7717:127.0.0.1:7717`) | works — it arrives as localhost | the two devices | the PC must be reachable from the internet, and she runs a terminal command every time |
| Hand-rolled WireGuard | blocked until a self-signed certificate is trusted by hand | the two devices | most setup, worst microphone story |
| Cloudflare Tunnel / ngrok | works | **a third party terminates TLS and can read note content**, and anyone with the URL reads everything | least setup, wrong trade |

## What she should know before starting

- **Her notes will live on the PC**, not on her Mac. The Mac is only a screen.
- **There is no login.** Anyone on that tailnet reads every note.
- **It will feel faster than her own Mac will.** The PC's CPU beats an 8 GB
  M2, so this tests the workflow, not the speed she will actually get.
- **Fabricated content only.** Real session material crossing to someone
  else's machine is a confidentiality problem for her professionally, quite
  apart from the app. The seeded names — John Smith, Maria Ruiz — exist for
  exactly this.
