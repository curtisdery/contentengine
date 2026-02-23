"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnthropic = getAnthropic;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("./env.js");
let _anthropic = null;
function getAnthropic() {
    if (!_anthropic) {
        const key = env_js_1.ANTHROPIC_API_KEY.value();
        if (!key)
            throw new Error("ANTHROPIC_API_KEY not configured");
        _anthropic = new sdk_1.default({ apiKey: key });
    }
    return _anthropic;
}
//# sourceMappingURL=anthropic.js.map