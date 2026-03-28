import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

async function updateFirestore(uid: string, planId: string, planName: string) {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/subscription/details?updateMask.fieldPaths=status&updateMask.fieldPaths=planId&updateMask.fieldPaths=planName&updateMask.fieldPaths=expiresAt`;
  
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
  const signature = req.headers.get("x-paystack-signature");
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  
  if (!signature || !secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bodyText = await req.text();
  
  // Verify Paystack Signature (HMAC-SHA512)
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify"]
  );
  
  const verified = await crypto.subtle.verify(
    "HMAC",
    hmacKey,
    new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))),
    new TextEncoder().encode(bodyText)
  );

  if (!verified) {
    return new Response("Invalid Signature", { status: 403 });
  }

  const payload = JSON.parse(bodyText);
  const eventName = payload.event;
  
  // Paystack sends 'subscription.create' or 'charge.success'
  if (eventName === "charge.success" || eventName === "subscription.create") {
    const customerEmail = payload.data.customer.email;
    // We can find the user by email in Firestore or use metadata
    // For simplicity in this demo, we assume the customer email matches a user.
    // In production, you'd pass the UID in metadata.
    
    // We'll try to find the user_id if we passed it in metadata during init
    const userId = payload.data.metadata?.custom_fields?.find((f: any) => f.variable_name === 'user_id')?.value;
    
    if (userId) {
      const planName = payload.data.plan?.name || "Premium Plan";
      const planCode = payload.data.plan?.plan_code || "standard";
      
      await updateFirestore(userId, planCode, planName);
      console.log(`[Webhook] Paystack activated subscription for user: ${userId}`);
    }
  }

  return new Response("OK", { status: 200 });
});
