import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin once at module level
initializeApp();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClioMatterPayload {
  clioMatterId?: string;
  clientEmail?: string;
  caseStage?: string;
  statusSummary?: string;
  [key: string]: unknown; // allow any additional Zapier/Clio fields
}

interface WebhookBody {
  topic?: string;
  action?: string;
  data?: ClioMatterPayload;
  // Zapier sends flat payloads — support both formats
  [key: string]: unknown;
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────

export const clioWebhook = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    // No invoker restriction — must be publicly accessible for Zapier/Clio
  },
  async (req, res) => {
    // 1. Method guard — only POST allowed
    if (req.method !== "POST") {
      console.warn(`[clioWebhook] Rejected ${req.method} request`);
      res.status(405).json({ error: "Method Not Allowed. Use POST." });
      return;
    }

    // 2. Parse and validate body
    let body: WebhookBody;
    try {
      // Firebase v2 onRequest auto-parses JSON when Content-Type is application/json
      // This handles cases where body arrives as string (e.g. from some Zapier configs)
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      if (!body || typeof body !== "object") {
        throw new Error("Body is not a valid JSON object");
      }
    } catch (parseError) {
      console.error("[clioWebhook] Invalid JSON body:", parseError);
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    // 3. Log full incoming payload (visible in Firebase Console → Functions → Logs)
    console.log("[clioWebhook] Received webhook payload:", JSON.stringify(body, null, 2));
    console.log("[clioWebhook] Headers:", JSON.stringify(req.headers, null, 2));

    // 4. Route to appropriate handler based on payload shape
    try {
      await handleWebhookPayload(body);
    } catch (handlerError) {
      // Log but don't fail — always return 200 to Zapier/Clio to prevent retries
      console.error("[clioWebhook] Handler error (non-fatal):", handlerError);
    }

    // 5. Always return 200 so Zapier/Clio doesn't retry
    res.status(200).json({
      success: true,
      message: "Webhook received successfully",
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Payload Handler (future Clio/Zapier logic lives here) ───────────────────

async function handleWebhookPayload(body: WebhookBody): Promise<void> {
  const db = getFirestore();

  // ── Detect payload format ──────────────────────────────────────────────────
  // Clio native webhook format: { topic: "matter", action: "updated", data: { object: {...} } }
  // Zapier format: flat object with fields mapped in Zapier UI

  const isClioNative = body.topic === "matter" && body.data;
  const isZapierFlat = !body.topic && body.clioMatterId;

  if (isClioNative) {
    await handleClioNativePayload(db, body);
  } else if (isZapierFlat) {
    await handleZapierPayload(db, body as ClioMatterPayload);
  } else {
    // Unknown format — log to webhook_events for inspection
    console.log("[clioWebhook] Unknown payload format — logging to webhook_events");
    await logWebhookEvent(db, "unknown", body);
  }
}

// ─── Clio Native Webhook Handler ─────────────────────────────────────────────

async function handleClioNativePayload(
  db: ReturnType<typeof getFirestore>,
  body: WebhookBody
): Promise<void> {
  const matter = (body.data as Record<string, unknown>)?.object as ClioMatterPayload | undefined;

  if (!matter?.clioMatterId) {
    console.warn("[clioWebhook] Clio payload missing matter ID — logging event");
    await logWebhookEvent(db, "clio_native_no_id", body);
    return;
  }

  console.log(`[clioWebhook] Processing Clio matter update: ${matter.clioMatterId}`);
  await syncCaseToFirestore(db, matter);
}

// ─── Zapier Flat Payload Handler ──────────────────────────────────────────────

async function handleZapierPayload(
  db: ReturnType<typeof getFirestore>,
  payload: ClioMatterPayload
): Promise<void> {
  if (!payload.clioMatterId) {
    console.warn("[clioWebhook] Zapier payload missing clioMatterId — logging event");
    await logWebhookEvent(db, "zapier_no_id", payload);
    return;
  }

  console.log(`[clioWebhook] Processing Zapier payload for matter: ${payload.clioMatterId}`);
  await syncCaseToFirestore(db, payload);
}

// ─── Firestore Sync (FUTURE: fully implement when clioMatterId is in cases) ──

async function syncCaseToFirestore(
  db: ReturnType<typeof getFirestore>,
  payload: ClioMatterPayload
): Promise<void> {
  // TODO (Phase 2): Uncomment and activate when cases have clioMatterId field
  //
  // const snapshot = await db.collection("cases")
  //   .where("clioMatterId", "==", String(payload.clioMatterId))
  //   .limit(1)
  //   .get();
  //
  // if (snapshot.empty) {
  //   console.log(`[clioWebhook] No case found for clioMatterId: ${payload.clioMatterId}`);
  //   await logWebhookEvent(db, "unmatched_matter", payload);
  //   return;
  // }
  //
  // await snapshot.docs[0].ref.update({
  //   caseStage: payload.caseStage ?? "",
  //   statusSummary: payload.statusSummary ?? "",
  //   updatedAt: new Date().toISOString(),
  //   lastSyncedFromClio: new Date().toISOString(),
  //   dataSource: "clio_webhook",
  // });
  //
  // console.log(`[clioWebhook] Case updated for matter: ${payload.clioMatterId}`);

  // For now — log the event so you can inspect payloads before going live
  await logWebhookEvent(db, "pending_sync", payload);
  console.log("[clioWebhook] Payload logged to webhook_events (sync not yet active)");
}

// ─── clioNewMatter — Create case from Zapier when new Clio matter is created ──

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "cdp-webhook-2024-secret";

export const clioNewMatter = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    // 1. Method guard
    if (req.method !== "POST") {
      console.warn("[clioNewMatter] Rejected non-POST request:", req.method);
      res.status(405).json({ success: false, message: "Method Not Allowed. Use POST." });
      return;
    }

    // 2. Authorization check
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.toString().replace("Bearer ", "").trim();
    if (!token || token !== WEBHOOK_SECRET) {
      console.warn("[clioNewMatter] Unauthorized request — invalid or missing token");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    // 3. Parse body
    let body: Record<string, unknown>;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") throw new Error("Invalid body");
    } catch {
      console.error("[clioNewMatter] Invalid JSON body");
      res.status(400).json({ success: false, message: "Invalid JSON body" });
      return;
    }

    console.log("[clioNewMatter] Received payload:", JSON.stringify(body, null, 2));

    // 4. Validate required fields
    const { email, caseStage, statusSummary, clioMatterId } = body as Record<string, string>;
    if (!email || !caseStage || !clioMatterId) {
      console.warn("[clioNewMatter] Missing required fields", { email, caseStage, clioMatterId });
      res.status(400).json({ success: false, message: "Missing required fields: email, caseStage, clioMatterId" });
      return;
    }

    try {
      const db = getFirestore();

      // 5. Find user by email
      console.log(`[clioNewMatter] Looking up user with email: ${email}`);
      const usersSnapshot = await db.collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        console.warn(`[clioNewMatter] No user found for email: ${email}`);
        res.status(404).json({ success: false, message: "No user found with that email" });
        return;
      }

      const userDoc = usersSnapshot.docs[0];
      const userId = userDoc.id;
      console.log(`[clioNewMatter] Found user: ${userId}`);

      // 6. Create case document
      const caseRef = await db.collection("cases").add({
        userId,
        caseStage,
        statusSummary: statusSummary ?? "",
        clioMatterId: String(clioMatterId),
        dataSource: "clio_webhook",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[clioNewMatter] Case created: ${caseRef.id} for user: ${userId}`);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[clioNewMatter] Error creating case:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

// ─── Audit Log ────────────────────────────────────────────────────────────────

async function logWebhookEvent(
  db: ReturnType<typeof getFirestore>,
  status: string,
  payload: unknown
): Promise<void> {
  await db.collection("webhook_events").add({
    status,
    payload,
    receivedAt: new Date().toISOString(),
  });
}
