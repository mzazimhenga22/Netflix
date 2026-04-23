import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

async function updateFirestore(uid: string, planId: string, planName: string) {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!projectId) {
    console.error("FIREBASE_PROJECT_ID not set");
    return false;
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/subscription/details?updateMask.fieldPaths=status&updateMask.fieldPaths=planId&updateMask.fieldPaths=planName&updateMask.fieldPaths=expiresAt`;
  
  const payload = {
    fields: {
      status: { stringValue: "active" },
      planId: { stringValue: planId },
      planName: { stringValue: planName },
      expiresAt: { integerValue: (Date.now() + 30 * 24 * 60 * 60 * 1000).toString() }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Firestore update failed: ${err}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Error updating Firestore: ${e}`);
    return false;
  }
}

serve(async (req: Request) => {

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("[PayHero Webhook] Received payload:", JSON.stringify(payload));

    // PayHero Lipwa Link sends Reference (user UID) and ResultCode
    const userId = payload.Reference || payload.ReferenceID || payload.ExternalReference;
    const resultCode = payload.ResultCode;
    const status = payload.Status; // Optional, usually 'Success' or 'Failed'

    if (!userId) {
      console.error("[PayHero Webhook] Missing Reference/UserID");
      return new Response("Missing Reference", { status: 400 });
    }

    // resultCode 0 or status 'Success' means payment was successful
    if (resultCode === 0 || resultCode === "0" || status?.toLowerCase() === 'success') {
      const amount = parseFloat(payload.Amount || "0");
      
      // Determine plan based on amount (matching app/subscription.tsx)
      let planId = "basic";
      let planName = "Basic Plan";
      
      if (amount >= 700) {
        planId = "premium";
        planName = "Premium Plan";
      } else if (amount >= 500) {
        planId = "standard";
        planName = "Standard Plan";
      } else if (amount >= 300) {
        planId = "basic";
        planName = "Basic Plan";
      }

      const success = await updateFirestore(userId, planId, planName);
      
      if (success) {
        console.log(`[PayHero Webhook] Activated ${planName} for user ${userId}`);
        return new Response("OK", { status: 200 });
      } else {
        return new Response("Firestore Update Failed", { status: 500 });
      }
    } else {
      console.log(`[PayHero Webhook] Payment failed or pending for user ${userId}. ResultCode: ${resultCode}`);
      return new Response("Payment not successful", { status: 200 }); // Still return 200 to acknowledge receipt
    }
  } catch (error) {
    console.error("[PayHero Webhook] Error processing request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
