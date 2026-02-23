import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "./env.js";

let _anthropic: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = ANTHROPIC_API_KEY.value();
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}
