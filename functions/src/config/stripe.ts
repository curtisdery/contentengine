import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "./env.js";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = STRIPE_SECRET_KEY.value();
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    _stripe = new Stripe(key);
  }
  return _stripe;
}
