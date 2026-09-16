# Push campaigns — plan

Send Firebase Cloud Messaging notifications to many apps from IndexForge, so
nobody logs into the Firebase Console once per app to announce a release.

---

## 1. The constraint that decides the whole design

**The public FCM API cannot "send to all users of an app."** There is no such
endpoint. `POST /v1/projects/{id}/messages:send` accepts exactly one of:

| Target | Reaches | Needs |
| --- | --- | --- |
| `token` | one device | that device's registration token |
| `topic` | every device subscribed to it | the app to call `subscribeToTopic` |
| `condition` | a boolean combination of topics | same |

The "Send to all users" button in the Firebase Console is **not** this API. The
Console is backed by Firebase's own device registry, which Google does not
expose publicly. No third-party tool can reproduce it, and any that claims to is
either using topics underneath or holding a token list.

### What that means in practice

This is still worth building, because **topics are how apps do this anyway**. An
app that calls `subscribeToTopic("all")` on first launch — one line in the
client — gets a working broadcast channel. The plan therefore treats a topic as
the primary target and says so in the UI, rather than implying a reach the API
cannot deliver.

Three honest capability levels, surfaced in that order:

1. **Topic** — the broadcast case. Works today if the app subscribes.
2. **Condition** — `'news' in topics && 'en' in topics`. Same requirement.
3. **Tokens** — for apps that keep their own device list and can supply it.

A fourth, later: we can *create* the topic for an app that has tokens but no
subscription, via the Instance ID batch-subscribe endpoint
(`iid.googleapis.com/iid/v1:batchAdd`, 1000 tokens per call). That turns "we
have tokens" into "we have a broadcast channel" without an app update.

---

## 2. What the user actually gets

> Add each app's Firebase credentials once. Compose a notification. Pick any
> number of apps. Send.

The value is **not** that we can do something Firebase cannot. It is that
Firebase makes you do it once per project, in a console that has no idea the
other eleven apps exist. One composer across a portfolio is the product.

---

## 3. Credentials, and why this is the risky part

FCM v1 authenticates with a **Google service account**: a JSON key holding an
RS256 private key. We mint a short-lived OAuth2 access token from it
(`scope=https://www.googleapis.com/auth/firebase.messaging`).

That key is the most sensitive thing this product will ever hold — more so than
a read-only analytics token, because it *acts*. Handling:

- Encrypted at rest with the existing AES-256-GCM helper (`encryptJson`), same
  as every other stored credential. The plaintext never leaves the server and is
  never returned by any procedure.
- **We tell the user to scope it down.** The service account needs exactly one
  role: *Firebase Cloud Messaging API Admin* (`roles/firebasemessaging.admin`).
  Not Owner, not Editor. The UI says this at the point of upload, because a
  pasted Owner key is the difference between "can send push" and "can delete
  your database".
- Only `memberProcedure` and above can add or send. Every send writes an
  `AuditLog` row with who, what, which apps and how many targets.
- Sending is rate limited per organization. A push tool is a spam vector, and
  the org that gets its FCM project suspended will be ours to explain.

---

## 4. Data model

```prisma
model PushCredential {
  id             String   @id @default(cuid())
  organizationId String
  appId          String   @unique          // one Firebase project per app
  projectId      String                     // from the service account JSON
  clientEmail    String                     // shown in the UI; identifies the key
  /// AES-256-GCM ciphertext of the service account JSON. Server only.
  credentials    String   @db.Text
  status         PushCredentialStatus @default(UNVERIFIED)
  lastError      String?  @db.Text
  lastVerifiedAt DateTime?
}

model PushCampaign {
  id             String   @id @default(cuid())
  organizationId String
  title          String                     // notification title
  body           String
  imageUrl       String?
  /// Where a tap goes. Delivered as a data payload the client reads.
  linkUrl        String?
  target         PushTarget                 // TOPIC | CONDITION | TOKENS
  targetValue    String                     // "all", a condition, or a token count marker
  status         CampaignStatus @default(DRAFT)
  createdById    String?
  sentAt         DateTime?
}

model PushDelivery {
  id         String @id @default(cuid())
  campaignId String
  appId      String
  status     DeliveryStatus @default(PENDING)
  messageId  String?        // FCM's name field, for support tickets
  error      String?        @db.Text
  attempts   Int            @default(0)
  @@unique([campaignId, appId])
}
```

One `PushDelivery` per app per campaign is what makes partial failure legible:
nine apps sent, one has an expired key, and the UI can say which.

---

## 5. Sending

A campaign to twelve apps is twelve independent FCM calls to twelve projects.
That belongs on the queue, not in a request:

- `push.send` job per campaign; it fans out one delivery per app.
- Access tokens are cached per project for their lifetime (Google issues them
  for an hour) so a twelve-app campaign mints one token per project, not one per
  message.
- FCM errors are mapped rather than surfaced raw, because the useful ones are
  specific and actionable:

| FCM error | Means | What we say |
| --- | --- | --- |
| `UNREGISTERED` | token is dead | Drop it; not an error for topic sends |
| `SENDER_ID_MISMATCH` | token belongs to another project | The key and the app do not match |
| `THIRD_PARTY_AUTH_ERROR` | APNs credentials missing | iOS needs an APNs key uploaded in Firebase |
| `QUOTA_EXCEEDED` | rate limited | Retry with backoff |
| `UNAVAILABLE` | transient | Retry |
| `INVALID_ARGUMENT` | malformed | Do not retry; show the payload problem |

Only the retryable ones go back on the queue. Retrying `INVALID_ARGUMENT` three
times just delays the truth.

---

## 6. Surfaces

- **Web** — `/push`: credential setup per app, composer, campaign history with
  per-app delivery results. This is the primary surface.
- **Desktop** — free. The Electron client is a window onto the web app.
- **Mobile** — a compose screen. Sending a push from a phone is genuinely useful
  ("the release is live, tell everyone") and it is the surface most likely to be
  used in a hurry, so it gets the same confirmation step as the web.

---

## 7. What is deliberately not in the first version

Stated so the gaps are chosen rather than discovered:

- **Scheduling.** Send now only. Scheduled sends need a durable timer and a
  cancel path; the queue can do it, but it doubles the state machine.
- **Segmentation beyond topics.** No "users who opened in the last 7 days" —
  that is Firebase's device registry again, which we cannot read.
- **Per-device token import UI.** The model supports token targets; the first
  version ships topic and condition, which is what a broadcast needs.
- **Localisation per locale.** One title and body per campaign.
- **A/B testing.** Belongs with store-listing experiments, not here.
- **Delivery analytics.** FCM reports accepted/rejected at send time. Open and
  conversion rates come from the *client* SDK reporting back to Firebase, which
  we cannot read either. Claiming an open rate we cannot measure would be
  exactly the kind of confident wrong number this codebase avoids everywhere
  else.

---

## 8. Status

All built.

| | |
| --- | --- |
| Schema + migration | `PushCredential`, `PushCampaign`, `PushDelivery` |
| FCM client | `src/server/push/fcm.ts` |
| tRPC router | `src/server/api/routers/push.ts` |
| Worker job | `src/server/jobs/handlers/push.ts` |
| Web | `/push` |
| Mobile | Push tab |
| Desktop | free — the client is a window onto the web app |

```bash
npm test            # 15 unit tests: message building, error mapping, key validation
npm run smoke:push  # 15 checks: real handler, real DB, stubbed Google and Firebase
```

### What the smoke test actually proves

It runs the real worker handler against a real database with a genuine RSA key
and a genuinely signed assertion; only Google's token endpoint and Firebase's
send endpoint are stubbed.

- Fan-out: one delivery row per app, and one app failing does not stop the rest.
- An app with no credential is `SKIPPED`, not dropped.
- A campaign with a skipped app is `PARTIAL`, never `SENT`.
- A non-retryable failure is `FAILED`; a rate-limited one stays `PENDING` and the
  handler rethrows so the queue retries it.
- A key Firebase rejects outright flips the credential to `INVALID`, so the next
  composer shows the app as not ready rather than failing again silently.
- Re-running a finished campaign sends nothing — the duplicate-notification
  failure mode is the one users notice immediately.
- An access token is reused across campaigns: **2 token calls across 4 sends**.
  Two apps and two tokens on a single campaign would have proved nothing, since
  that is also what minting per message looks like.

### Not verified

No Firebase project was available. Everything above is against a stub, so what
remains unproven is that Google accepts a real assertion and that a real device
receives the notification. The message shape follows the documented v1 schema;
the first live send is where that gets confirmed.
