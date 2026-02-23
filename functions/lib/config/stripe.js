"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripe = getStripe;
const stripe_1 = __importDefault(require("stripe"));
const env_js_1 = require("./env.js");
let _stripe = null;
function getStripe() {
    if (!_stripe) {
        const key = env_js_1.STRIPE_SECRET_KEY.value();
        if (!key)
            throw new Error("STRIPE_SECRET_KEY not configured");
        _stripe = new stripe_1.default(key);
    }
    return _stripe;
}
//# sourceMappingURL=stripe.js.map