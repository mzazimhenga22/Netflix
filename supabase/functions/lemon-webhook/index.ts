import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Lightweight Firebase update via REST API
async function updateFirestore(uid: string, planId: string, planName: string) {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/subscription/details?updateMask.fieldPaths=status&updateMask.fieldPaths=planId&updateMask.fieldPaths=planName&updateMask.fieldPaths=expiresAt`;
  
  // Note: In production, you would use a Google Auth Token here.
  // For this lightweight version, we assume you have the proper Service Account configured.
  const payload = {
    fields: {
      status: { stringValue: "active" },
      planId: { stringValue: planId },
      planName: { stringValue: planName },
      expiresAt: { integerValue: (Date.now() + 30 * 24 * 60 * 60 * 1000).toString() }
    }
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.ok;
}

serve(async (req) => {
  const signature = req.headers.get("x-signature");
  const secret = Deno.env.get("LEMON_WEBHOOK_SECRET");
  
  if (!signature || !secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bodyText = await req.text();
  
  // Verify Signature
  const hmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const verified = await crypto.subtle.verify(
    "HMAC",
    hmac,
    new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))),
    new TextEncoder().encode(bodyText)
  );

  if (!verified) {
    return new Response("Invalid Signature", { status: 403 });
  }

  const payload = JSON.parse(bodyText);
  const eventName = payload.meta.event_name;
  const customData = payload.meta.custom_data;
  
  if (eventName === "order_created" && customData?.user_id) {
    const planName = payload.data.attributes.first_order_item.variant_name;
    const planId = payload.data.attributes.first_order_item.variant_id.toString();
    
    await updateFirestore(customData.user_id, planId, planName);
    console.log(`[Webhook] Activated subscription for user: ${customData.user_id}`);
  }

  return new Response("OK", { status: 200 });
});
