/**
 * Billing API — 4 functions: createCheckout, createPortal, stripeWebhook (onRequest), getSubscriptionStatus.
 * Port of apps/api/app/services/billing.py.
 */

import { onCall, onRequest } from "firebase-functions/v2/https";
import { db } from "../config/firebase.js";
import { getStripe } from "../config/stripe.js";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO, FRONTEND_URL } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { CreateCheckoutSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError, ValidationError } from "../shared/errors.js";
import { FieldValue } from "firebase-admin/firestore";
import type { SubscriptionDoc } from "../shared/types.js";

const TIER_PRICE_MAP: Record<string, () => string> = {
  growth: () => STRIPE_PRICE_GROWTH.value(),
  pro: () => STRIPE_PRICE_PRO.value(),
};

async function getOrgSubscription(organizationId: string) {
  const subSnap = await db
    .collection(Collections.SUBSCRIPTIONS)
    .where("organizationId", "==", organizationId)
    .limit(1)
    .get();
  if (subSnap.empty) {
    throw new NotFoundError("Subscription not found", "No subscription found for this organization.");
  }
  return { id: subSnap.docs[0].id, ref: subSnap.docs[0].ref, data: subSnap.docs[0].data() as SubscriptionDoc };
}

// ─── createCheckout ──────────────────────────────────────────────────────────
export const createCheckout = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(CreateCheckoutSchema, request.data);

    const priceGetter = TIER_PRICE_MAP[input.tier];
    if (!priceGetter) {
      throw new ValidationError("Invalid tier", `Tier '${input.tier}' is not available.`);
    }
    const priceId = priceGetter();
    if (!priceId) {
      throw new ValidationError("Price not configured", `Stripe price for tier '${input.tier}' is not configured.`);
    }

    const { ref: subRef, data: sub } = await getOrgSubscription(ctx.organizationId);
    const stripe = getStripe();

    // Get or create Stripe customer
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.email,
        metadata: { organization_id: ctx.organizationId },
      });
      customerId = customer.id;
      await subRef.update({ stripeCustomerId: customerId, updatedAt: FieldValue.serverTimestamp() });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      metadata: { organization_id: ctx.organizationId, tier: input.tier },
    });

    return { checkout_url: session.url };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── createPortal ────────────────────────────────────────────────────────────
export const createPortal = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const { data: sub } = await getOrgSubscription(ctx.organizationId);

    if (!sub.stripeCustomerId) {
      throw new ValidationError("No billing account", "No Stripe customer found. Please set up a subscription first.");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${FRONTEND_URL.value()}/settings/billing`,
    });

    return { portal_url: session.url };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getSubscriptionStatus ───────────────────────────────────────────────────
export const getSubscriptionStatus = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const { id, data: sub } = await getOrgSubscription(ctx.organizationId);

    return {
      id,
      organization_id: sub.organizationId,
      tier: sub.tier,
      status: sub.status,
      stripe_customer_id: sub.stripeCustomerId,
      stripe_subscription_id: sub.stripeSubscriptionId,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      current_period_start: sub.currentPeriodStart?.toDate().toISOString() ?? null,
      current_period_end: sub.currentPeriodEnd?.toDate().toISOString() ?? null,
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── stripeWebhook (onRequest) ───────────────────────────────────────────────
export const stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const sig = req.headers["stripe-signature"] as string;
  if (!sig) {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).send(`Webhook signature verification failed: ${msg}`);
    return;
  }

  const data = event.data.object as unknown as Record<string, unknown>;

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(data);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(data);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(data);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(data);
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
  }

  res.status(200).json({ received: true });
});

async function handleCheckoutCompleted(data: Record<string, unknown>) {
  const customerId = data.customer as string;
  const subscriptionId = data.subscription as string;
  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const tier = metadata.tier || "growth";

  const subSnap = await db
    .collection(Collections.SUBSCRIPTIONS)
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!subSnap.empty) {
    await subSnap.docs[0].ref.update({
      stripeSubscriptionId: subscriptionId,
      tier,
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function handleSubscriptionUpdated(data: Record<string, unknown>) {
  const stripeSubId = data.id as string;
  const status = data.status as string;

  const subSnap = await db
    .collection(Collections.SUBSCRIPTIONS)
    .where("stripeSubscriptionId", "==", stripeSubId)
    .limit(1)
    .get();

  if (!subSnap.empty) {
    const updates: Record<string, unknown> = {
      status,
      cancelAtPeriodEnd: (data.cancel_at_period_end as boolean) ?? false,
      updatedAt: FieldValue.serverTimestamp(),
    };

    const periodStart = data.current_period_start as number | undefined;
    const periodEnd = data.current_period_end as number | undefined;
    if (periodStart) {
      const { Timestamp } = await import("firebase-admin/firestore");
      updates.currentPeriodStart = Timestamp.fromDate(new Date(periodStart * 1000));
    }
    if (periodEnd) {
      const { Timestamp } = await import("firebase-admin/firestore");
      updates.currentPeriodEnd = Timestamp.fromDate(new Date(periodEnd * 1000));
    }

    await subSnap.docs[0].ref.update(updates);
  }
}

async function handleSubscriptionDeleted(data: Record<string, unknown>) {
  const stripeSubId = data.id as string;

  const subSnap = await db
    .collection(Collections.SUBSCRIPTIONS)
    .where("stripeSubscriptionId", "==", stripeSubId)
    .limit(1)
    .get();

  if (!subSnap.empty) {
    await subSnap.docs[0].ref.update({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function handlePaymentFailed(data: Record<string, unknown>) {
  const customerId = data.customer as string;

  const subSnap = await db
    .collection(Collections.SUBSCRIPTIONS)
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!subSnap.empty) {
    await subSnap.docs[0].ref.update({
      status: "past_due",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
