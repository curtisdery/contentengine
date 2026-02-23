"use strict";
/**
 * Billing API — 4 functions: createCheckout, createPortal, stripeWebhook (onRequest), getSubscriptionStatus.
 * Port of apps/api/app/services/billing.py.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.getSubscriptionStatus = exports.createPortal = exports.createCheckout = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_js_1 = require("../config/firebase.js");
const stripe_js_1 = require("../config/stripe.js");
const env_js_1 = require("../config/env.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const firestore_1 = require("firebase-admin/firestore");
const TIER_PRICE_MAP = {
    growth: () => env_js_1.STRIPE_PRICE_GROWTH.value(),
    pro: () => env_js_1.STRIPE_PRICE_PRO.value(),
};
async function getOrgSubscription(organizationId) {
    const subSnap = await firebase_js_1.db
        .collection(collections_js_1.Collections.SUBSCRIPTIONS)
        .where("organizationId", "==", organizationId)
        .limit(1)
        .get();
    if (subSnap.empty) {
        throw new errors_js_1.NotFoundError("Subscription not found", "No subscription found for this organization.");
    }
    return { id: subSnap.docs[0].id, ref: subSnap.docs[0].ref, data: subSnap.docs[0].data() };
}
// ─── createCheckout ──────────────────────────────────────────────────────────
exports.createCheckout = (0, https_1.onCall)({ secrets: [env_js_1.STRIPE_SECRET_KEY, env_js_1.STRIPE_PRICE_GROWTH, env_js_1.STRIPE_PRICE_PRO] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.CreateCheckoutSchema, request.data);
        const priceGetter = TIER_PRICE_MAP[input.tier];
        if (!priceGetter) {
            throw new errors_js_1.ValidationError("Invalid tier", `Tier '${input.tier}' is not available.`);
        }
        const priceId = priceGetter();
        if (!priceId) {
            throw new errors_js_1.ValidationError("Price not configured", `Stripe price for tier '${input.tier}' is not configured.`);
        }
        const { ref: subRef, data: sub } = await getOrgSubscription(ctx.organizationId);
        const stripe = (0, stripe_js_1.getStripe)();
        // Get or create Stripe customer
        let customerId = sub.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: ctx.email,
                metadata: { organization_id: ctx.organizationId },
            });
            customerId = customer.id;
            await subRef.update({ stripeCustomerId: customerId, updatedAt: firestore_1.FieldValue.serverTimestamp() });
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── createPortal ────────────────────────────────────────────────────────────
exports.createPortal = (0, https_1.onCall)({ secrets: [env_js_1.STRIPE_SECRET_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const { data: sub } = await getOrgSubscription(ctx.organizationId);
        if (!sub.stripeCustomerId) {
            throw new errors_js_1.ValidationError("No billing account", "No Stripe customer found. Please set up a subscription first.");
        }
        const stripe = (0, stripe_js_1.getStripe)();
        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripeCustomerId,
            return_url: `${env_js_1.FRONTEND_URL.value()}/settings/billing`,
        });
        return { portal_url: session.url };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getSubscriptionStatus ───────────────────────────────────────────────────
exports.getSubscriptionStatus = (0, https_1.onCall)({ secrets: [env_js_1.STRIPE_SECRET_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── stripeWebhook (onRequest) ───────────────────────────────────────────────
exports.stripeWebhook = (0, https_1.onRequest)({ secrets: [env_js_1.STRIPE_SECRET_KEY, env_js_1.STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const sig = req.headers["stripe-signature"];
    if (!sig) {
        res.status(400).send("Missing stripe-signature header");
        return;
    }
    let event;
    try {
        const stripe = (0, stripe_js_1.getStripe)();
        event = stripe.webhooks.constructEvent(req.rawBody, sig, env_js_1.STRIPE_WEBHOOK_SECRET.value());
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        res.status(400).send(`Webhook signature verification failed: ${msg}`);
        return;
    }
    const data = event.data.object;
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
    }
    catch (err) {
        console.error("Webhook handler error:", err);
    }
    res.status(200).json({ received: true });
});
async function handleCheckoutCompleted(data) {
    const customerId = data.customer;
    const subscriptionId = data.subscription;
    const metadata = (data.metadata ?? {});
    const tier = metadata.tier || "growth";
    const subSnap = await firebase_js_1.db
        .collection(collections_js_1.Collections.SUBSCRIPTIONS)
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();
    if (!subSnap.empty) {
        await subSnap.docs[0].ref.update({
            stripeSubscriptionId: subscriptionId,
            tier,
            status: "active",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
}
async function handleSubscriptionUpdated(data) {
    const stripeSubId = data.id;
    const status = data.status;
    const subSnap = await firebase_js_1.db
        .collection(collections_js_1.Collections.SUBSCRIPTIONS)
        .where("stripeSubscriptionId", "==", stripeSubId)
        .limit(1)
        .get();
    if (!subSnap.empty) {
        const updates = {
            status,
            cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        const periodStart = data.current_period_start;
        const periodEnd = data.current_period_end;
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
async function handleSubscriptionDeleted(data) {
    const stripeSubId = data.id;
    const subSnap = await firebase_js_1.db
        .collection(collections_js_1.Collections.SUBSCRIPTIONS)
        .where("stripeSubscriptionId", "==", stripeSubId)
        .limit(1)
        .get();
    if (!subSnap.empty) {
        await subSnap.docs[0].ref.update({
            status: "canceled",
            cancelAtPeriodEnd: false,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
}
async function handlePaymentFailed(data) {
    const customerId = data.customer;
    const subSnap = await firebase_js_1.db
        .collection(collections_js_1.Collections.SUBSCRIPTIONS)
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();
    if (!subSnap.empty) {
        await subSnap.docs[0].ref.update({
            status: "past_due",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
}
//# sourceMappingURL=billing.js.map