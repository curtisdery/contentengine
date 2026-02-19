"""Platform DNA profiles — all 18 platform configurations for content transformation.

Each platform profile defines the native tone, structural templates, hook patterns,
length constraints, CTA styles, algorithm signals, and audience intent that the
Transformation Engine uses to generate platform-optimized content.
"""

from dataclasses import dataclass, field


@dataclass
class AlgorithmSignals:
    primary: str
    secondary: str
    negative: str


@dataclass
class LengthRange:
    min: int
    ideal: int
    max: int


@dataclass
class PlatformProfile:
    platform_id: str
    name: str
    tier: int
    native_tone: str
    structural_templates: list[str]
    hook_patterns: list[str]
    length_range: LengthRange
    cta_styles: list[str]
    algorithm_signals: AlgorithmSignals
    audience_intent: str
    media_format: str  # text, text+image, carousel, video_script, audio
    posting_cadence: str


# ---------------------------------------------------------------------------
# Tier 1 — Primary text-first social platforms
# ---------------------------------------------------------------------------

_twitter_single = PlatformProfile(
    platform_id="twitter_single",
    name="Twitter/X Single Tweet",
    tier=1,
    native_tone=(
        "Punchy, opinionated, and conversational. Uses contrarian takes, "
        "surprising statistics, and bold one-liners. Feels like overhearing "
        "the smartest person at a dinner party. No fluff — every word earns its place."
    ),
    structural_templates=[
        "Bold claim → supporting stat or proof → mic-drop closer",
        "Contrarian opener → quick reasoning → invitation to discuss",
        "Stat or data point → implication → call to rethink",
    ],
    hook_patterns=[
        "Unpopular opinion: {contrarian_take}",
        "{Surprising_stat}. Let that sink in.",
        "Stop doing {common_mistake}. Here's why →",
        "The difference between {A} and {B}? {one_liner}",
        "Most people think {X}. The reality? {Y}.",
    ],
    length_range=LengthRange(min=80, ideal=200, max=280),
    cta_styles=[
        "Agree or disagree?",
        "What would you add?",
        "RT if this hit different.",
        "Bookmark this.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Replies and retweets within the first 30 minutes drive impressions",
        secondary="Bookmarks and quote tweets signal high-value content",
        negative="External links without context, thread starters with no engagement hook",
    ),
    audience_intent="Quick insight, hot take, or share-worthy stat during a scroll session",
    media_format="text",
    posting_cadence="3-5 tweets per day, spaced 2-4 hours apart",
)

_twitter_thread = PlatformProfile(
    platform_id="twitter_thread",
    name="Twitter/X Thread",
    tier=1,
    native_tone=(
        "Narrative arc with escalating value. Opens with an irresistible hook tweet, "
        "builds through numbered insights or a story, and closes with a clear takeaway. "
        "Each tweet is self-contained enough to be screenshotted but flows as a sequence."
    ),
    structural_templates=[
        "Hook tweet → 5-8 numbered insights → summary tweet → CTA",
        "Story opener → 3-5 lesson tweets with examples → takeaway → CTA",
        "Myth-busting hook → point-by-point rebuttal (3-7 tweets) → new framework → CTA",
    ],
    hook_patterns=[
        "I spent {time} studying {topic}. Here's what nobody tells you (thread):",
        "{Number} lessons from {experience} that changed how I think about {topic}:",
        "Everyone is wrong about {topic}. Let me explain why →",
        "The {topic} playbook that helped me {result}. A thread:",
        "In {year}, I {story_start}. What happened next changed everything →",
    ],
    length_range=LengthRange(min=840, ideal=2000, max=3360),
    cta_styles=[
        "Follow @handle for more threads like this.",
        "If this was valuable, RT the first tweet to help others find it.",
        "Bookmark this thread — you'll want to come back to it.",
        "Which tip resonated most? Reply and let me know.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Engagement on the first tweet determines total thread reach",
        secondary="Dwell time and click-through rate on individual tweets",
        negative="Threads longer than 12 tweets without engagement, first tweet that reads like clickbait with no payoff",
    ),
    audience_intent="Deep-dive learning, save-for-later reference, share a curated insight stream",
    media_format="text",
    posting_cadence="1-3 threads per week, posted between 8-10am audience timezone",
)

_linkedin_post = PlatformProfile(
    platform_id="linkedin_post",
    name="LinkedIn Post",
    tier=1,
    native_tone=(
        "First-person, experience-driven, and reflective. Reads like a professional "
        "sharing a hard-won lesson with a trusted colleague. Uses line breaks for "
        "readability, avoids corporate jargon, and favors vulnerability over polish. "
        "The best posts feel like they were written in one sitting after a meaningful moment."
    ),
    structural_templates=[
        "Personal story opener (2-3 lines) → lesson learned → framework or tips → CTA question",
        "Bold statement → 'Here's what I mean:' → numbered insights → reflection → CTA",
        "Contrarian take → evidence from experience → reframe → invitation to discuss",
    ],
    hook_patterns=[
        "I made a mistake that cost me {consequence}. Here's what I learned:",
        "{Bold_statement}.\n\nBut not for the reason you think.",
        "After {X years/months} of {experience}, I've noticed a pattern:",
        "Everyone talks about {topic}.\n\nNobody talks about {hidden_aspect}.",
        "The worst career advice I ever got:\n\n\"{bad_advice}\"\n\nHere's why →",
    ],
    length_range=LengthRange(min=400, ideal=1300, max=3000),
    cta_styles=[
        "What's your experience with this? Drop it in the comments.",
        "Agree? Disagree? I'd love to hear your take.",
        "♻️ Repost if this resonated. Follow for more on {topic}.",
        "Tag someone who needs to hear this.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Comments and dwell time within the first hour are the strongest signals",
        secondary="Reposts and reactions (especially 'Insightful') extend reach to 2nd-degree network",
        negative="External links in the post body (put in comments), hashtag stuffing, engagement-bait language",
    ),
    audience_intent="Professional growth, career insight, peer validation, and network building",
    media_format="text",
    posting_cadence="3-5 posts per week, Tuesday through Thursday mornings perform best",
)

_linkedin_article = PlatformProfile(
    platform_id="linkedin_article",
    name="LinkedIn Article",
    tier=1,
    native_tone=(
        "Authoritative thought leadership with depth. More polished than a post but still "
        "personal. Uses data, case studies, and original frameworks. Reads like a well-edited "
        "blog post from someone with genuine expertise. SEO-indexed by Google — titles and "
        "headers matter for long-term discoverability."
    ),
    structural_templates=[
        "Compelling title → executive summary paragraph → 3-5 H2 sections with examples → conclusion with next steps",
        "Problem statement → why it matters now → framework with 4-6 pillars → case study or proof → actionable takeaways",
        "Industry trend analysis → data/evidence → implications → contrarian perspective → call to action",
    ],
    hook_patterns=[
        "The {industry} is changing faster than most realize. Here's the framework I use to stay ahead.",
        "After {experience}, I developed a system for {outcome}. This article breaks it down.",
        "Why {common_belief} is costing your {team/company/career} more than you think",
        "{Topic}: The complete guide for {audience} in {year}",
        "I've {achievement}. Here's the playbook.",
    ],
    length_range=LengthRange(min=800, ideal=1500, max=2000),
    cta_styles=[
        "If you found this useful, follow me for weekly articles on {topic}.",
        "Want the full framework? Comment 'framework' and I'll send it.",
        "Share this with your team if it resonated.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="SEO keywords in title and headers drive long-term organic traffic from Google",
        secondary="Shares and comments boost visibility in the LinkedIn article feed",
        negative="Articles under 500 words perform poorly, overly promotional content, no clear structure",
    ),
    audience_intent="In-depth learning, establishing expertise, bookmarkable reference material",
    media_format="text",
    posting_cadence="1-2 articles per month, consistency matters more than frequency",
)

_bluesky_post = PlatformProfile(
    platform_id="bluesky_post",
    name="Bluesky Post",
    tier=1,
    native_tone=(
        "Early-adopter energy with community warmth. More authentic and less performative "
        "than Twitter. Conversational, slightly nerdy, values-driven. The audience rewards "
        "originality and genuine engagement over viral optimization. Anti-hustle-culture vibes."
    ),
    structural_templates=[
        "Observation or insight → brief elaboration → open question or reflection",
        "Personal take → context or evidence → community invitation",
        "Hot take with nuance → 'here's what I mean' → genuine ask",
    ],
    hook_patterns=[
        "Something I've been thinking about: {topic}",
        "Hot take that I'll defend: {take}",
        "A thing I wish more people talked about in {industry}:",
        "Genuine question for the {community} folks here:",
        "I just realized something about {topic} and I can't unsee it:",
    ],
    length_range=LengthRange(min=50, ideal=220, max=300),
    cta_styles=[
        "What's your experience been?",
        "Curious what others think about this.",
        "Follow along if this resonates — I post about this a lot.",
        "Would love to hear different perspectives on this.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Likes and reposts from accounts in your community cluster drive feed placement",
        secondary="Reply chains and quote posts signal conversation-worthy content",
        negative="Cross-posted Twitter content with no adaptation, growth-hacking language, engagement bait",
    ),
    audience_intent="Authentic connection, community conversation, discovering interesting thinkers",
    media_format="text",
    posting_cadence="2-4 posts per day, organic timing preferred over rigid schedules",
)

# ---------------------------------------------------------------------------
# Tier 2 — Visual-first and discovery platforms
# ---------------------------------------------------------------------------

_instagram_carousel = PlatformProfile(
    platform_id="instagram_carousel",
    name="Instagram Carousel",
    tier=2,
    native_tone=(
        "Visual-first educational content. Each slide delivers one clear idea with minimal "
        "text. Bold headlines, short supporting copy, and a consistent design language. "
        "The first slide is the hook, the middle slides deliver value, the last slide is "
        "the CTA. Feels like a mini-course in swipe form."
    ),
    structural_templates=[
        "Hook slide → 5-7 tip slides (one tip per slide) → summary slide → CTA slide",
        "Problem slide → 3-5 myth vs reality slides → solution framework slide → CTA",
        "Title/hook slide → step-by-step process (4-6 slides) → result/proof slide → CTA with save prompt",
    ],
    hook_patterns=[
        "{Number} {topic} tips that actually work",
        "Stop making these {topic} mistakes",
        "The {topic} framework that changed everything",
        "Save this for later: {topic} cheat sheet",
        "{Outcome} in {timeframe} — here's the exact process",
    ],
    length_range=LengthRange(min=300, ideal=600, max=1000),
    cta_styles=[
        "Save this for later 🔖",
        "Share with someone who needs this",
        "Follow @handle for more {topic} tips",
        "Which tip was most helpful? Comment below!",
        "Double tap if this was useful ❤️",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Saves and shares are the strongest ranking signals for carousel reach",
        secondary="Time spent swiping through all slides and comments",
        negative="Text-heavy slides that are hard to read on mobile, carousels under 5 slides, no CTA slide",
    ),
    audience_intent="Quick visual learning, save-for-later reference, shareable educational content",
    media_format="carousel",
    posting_cadence="3-4 carousels per week, Reels and Stories on alternating days",
)

_instagram_caption = PlatformProfile(
    platform_id="instagram_caption",
    name="Instagram Caption",
    tier=2,
    native_tone=(
        "Storytelling with personality. The first 125 characters (visible before 'more') "
        "must hook the reader. Then transitions into a relatable story, lesson, or behind-the-scenes "
        "moment. Ends with a question or CTA to drive comments. Hashtags are strategic — "
        "mix of niche (10K-100K posts) and broad categories."
    ),
    structural_templates=[
        "Hook line → personal story (3-4 sentences) → lesson/takeaway → question CTA → hashtags",
        "Bold opener → 'Here's the truth:' → vulnerable share → empowering reframe → CTA → hashtags",
        "Relatable frustration → turning point moment → actionable advice → engagement question → hashtags",
    ],
    hook_patterns=[
        "Nobody talks about the {hidden_reality} of {topic}.",
        "I almost didn't share this, but...",
        "The one thing that changed my {area} forever:",
        "POV: You just realized {relatable_moment}",
        "Real talk about {topic} 👇",
    ],
    length_range=LengthRange(min=100, ideal=800, max=2200),
    cta_styles=[
        "Drop a 🔥 if you relate",
        "Tell me in the comments — which one resonates?",
        "Tag your {person} who needs to see this",
        "Save this for when you need a reminder ✨",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Comments and saves within the first hour drive Explore page placement",
        secondary="Shares to Stories and DMs indicate high-value content",
        negative="Captions that are just hashtags, irrelevant hashtag spam, no engagement hook",
    ),
    audience_intent="Emotional connection, relatable storytelling, community belonging",
    media_format="text+image",
    posting_cadence="4-7 posts per week, paired with daily Stories for visibility",
)

_pinterest_pin = PlatformProfile(
    platform_id="pinterest_pin",
    name="Pinterest Pin",
    tier=2,
    native_tone=(
        "Search-optimized, evergreen, and aspirational. Pinterest is a visual search engine, "
        "not a social network. Copy should be keyword-rich, benefit-driven, and timeless. "
        "Titles are scannable. Descriptions read like mini SEO articles. The audience is "
        "actively looking for solutions, ideas, and inspiration."
    ),
    structural_templates=[
        "Keyword-rich title → benefit statement → 2-3 key details → link CTA",
        "How-to title → brief overview → key steps mentioned → 'Click to read the full guide'",
        "Listicle title → highlight 2-3 items → curiosity gap → link to full content",
    ],
    hook_patterns=[
        "{Number} {Topic} Ideas That Will {Benefit}",
        "How to {Achieve Outcome} — The Complete Guide",
        "The Ultimate {Topic} Cheat Sheet for {Audience}",
        "{Topic} Tips Every {Audience} Should Know",
        "Why {Common Approach} Doesn't Work (And What to Do Instead)",
    ],
    length_range=LengthRange(min=100, ideal=350, max=500),
    cta_styles=[
        "Click through to get the full guide",
        "Save this pin for later!",
        "Visit the blog for all the details",
        "Pin this to your {topic} board",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Keyword relevance in title and description determines search ranking and discovery",
        secondary="Save rate and click-through rate to the linked URL",
        negative="Clickbait titles with no follow-through, irrelevant keywords, low-quality image references",
    ),
    audience_intent="Active search for solutions, ideas, and inspiration to save and revisit",
    media_format="text+image",
    posting_cadence="5-15 pins per day (including repins), consistency over months drives compounding traffic",
)

# ---------------------------------------------------------------------------
# Tier 3 — Long-form written platforms
# ---------------------------------------------------------------------------

_blog_seo = PlatformProfile(
    platform_id="blog_seo",
    name="SEO Blog Post",
    tier=3,
    native_tone=(
        "Informative, well-structured, and authoritative. Written for both humans and search "
        "engines. Uses clear H2/H3 hierarchy, short paragraphs, bullet points, and internal links. "
        "The tone is expert but accessible — like a knowledgeable friend explaining a complex topic. "
        "Every section should answer a specific question the reader might search for."
    ),
    structural_templates=[
        "SEO title (H1) → meta description → intro with hook → 4-6 H2 sections → FAQ section → conclusion with CTA",
        "Title → problem overview → step-by-step solution (H2 per step) → pro tips → related resources → CTA",
        "Title → TLDR/key takeaways box → detailed sections (H2/H3) → case study or example → conclusion",
    ],
    hook_patterns=[
        "The Complete Guide to {Topic}: Everything You Need to Know in {Year}",
        "How to {Achieve Outcome}: {Number} Proven Strategies",
        "{Topic}: Why {Common Belief} Is Wrong and What to Do Instead",
        "{Number} {Topic} Mistakes You're Making (And How to Fix Them)",
        "What Is {Topic}? A Beginner's Guide to {Outcome}",
    ],
    length_range=LengthRange(min=1200, ideal=1800, max=2500),
    cta_styles=[
        "Subscribe to the newsletter for weekly {topic} insights",
        "Download the free {resource} to get started",
        "Share this post with someone who would find it helpful",
        "Leave a comment with your experience — I read every one",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Keyword targeting in title, meta, H2s, and first 100 words drives Google ranking",
        secondary="Dwell time, low bounce rate, and internal linking improve domain authority",
        negative="Keyword stuffing, thin content under 800 words, duplicate content, no internal links",
    ),
    audience_intent="Searching for answers, learning a skill, comparing options, making decisions",
    media_format="text",
    posting_cadence="1-3 posts per week, evergreen content updated quarterly",
)

_email_newsletter = PlatformProfile(
    platform_id="email_newsletter",
    name="Email Newsletter",
    tier=3,
    native_tone=(
        "Personal, warm, and conversational — like a letter from a smart friend. Opens with a "
        "relatable story or observation, transitions to the main insight, and closes with a clear "
        "takeaway. The subject line is everything — it must create curiosity or promise specific value. "
        "Preview text complements the subject. The body respects the reader's time."
    ),
    structural_templates=[
        "Subject → preview text → personal opener → main insight (2-3 paragraphs) → actionable takeaway → PS line",
        "Subject → preview → story hook → lesson → 3 bullet points of value → CTA → PS with bonus",
        "Subject → preview → quick win or tip → deeper context → resource link → sign-off → PS",
    ],
    hook_patterns=[
        "The one thing about {topic} nobody warned me about",
        "I was wrong about {topic} (here's what changed my mind)",
        "A {topic} lesson from {unexpected_source}",
        "{Outcome} — the simple system behind it",
        "What {X years} of {experience} taught me about {topic}",
    ],
    length_range=LengthRange(min=300, ideal=800, max=1500),
    cta_styles=[
        "Hit reply and tell me — {question}",
        "Forward this to someone who needs to hear it",
        "PS: {bonus_value_or_teaser}",
        "Click here to {specific_action}",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Open rate driven by subject line and sender reputation; click rate driven by CTA clarity",
        secondary="Reply rate signals high engagement to email providers, improving deliverability",
        negative="Spam trigger words in subject, too many links, no plain-text version, image-heavy with no alt text",
    ),
    audience_intent="Curated insight delivered to inbox, feeling of exclusive access, personal connection with creator",
    media_format="text",
    posting_cadence="1-2 emails per week, same day and time each week builds habit",
)

_medium_post = PlatformProfile(
    platform_id="medium_post",
    name="Medium Post",
    tier=3,
    native_tone=(
        "Polished, thoughtful, and slightly literary. Medium readers expect quality prose, "
        "original thinking, and well-structured arguments. The opening paragraph is critical — "
        "it determines whether the algorithm shows the piece to a wider audience. Uses subheadings "
        "for scanability, pull quotes for emphasis, and a conversational but intelligent tone."
    ),
    structural_templates=[
        "Compelling opening paragraph → context/problem → 3-4 sections with subheadings → conclusion with broader implication",
        "Personal anecdote opener → 'Here's what I learned' → framework with examples → takeaway → call for reflection",
        "Provocative question → exploration with data/stories → nuanced answer → implications → reader invitation",
    ],
    hook_patterns=[
        "I spent {time} {doing_thing}. Here's what I wish someone had told me from the start.",
        "The {topic} advice everyone gives is dangerously oversimplified.",
        "There's a reason {outcome} feels so hard. And it's not what you think.",
        "What {X} taught me about {Y} — and why it matters for {Z}",
        "The hidden cost of {common_practice} that nobody talks about",
    ],
    length_range=LengthRange(min=800, ideal=1400, max=2500),
    cta_styles=[
        "If this resonated, give it a clap (or 50) — it helps others find it.",
        "Follow me on Medium for weekly essays on {topic}.",
        "What's your take? I'd love to hear it in the responses.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Read ratio (percentage who finish the article) is the primary distribution signal",
        secondary="Claps, highlights, and responses boost placement in topic feeds and digests",
        negative="Clickbait titles with shallow content, articles under 3 min read, excessive self-promotion",
    ),
    audience_intent="Thoughtful reading, intellectual stimulation, discovering new perspectives",
    media_format="text",
    posting_cadence="1-2 posts per week, tag up to 5 relevant topics for maximum discovery",
)

# ---------------------------------------------------------------------------
# Tier 4 — Video and audio formats
# ---------------------------------------------------------------------------

_youtube_longform = PlatformProfile(
    platform_id="youtube_longform",
    name="YouTube Long-Form Video Script",
    tier=4,
    native_tone=(
        "Energetic, structured, and viewer-retention-focused. Opens with a powerful hook "
        "in the first 8 seconds, previews the value, then delivers on it with clear sections. "
        "Uses pattern interrupts (B-roll suggestions, visual cues) to maintain attention. "
        "Conversational but purposeful — every sentence earns the next second of watch time."
    ),
    structural_templates=[
        "[HOOK] (8s) → [INTRO/CONTEXT] (30s) → [SECTION 1-4] with B-roll notes → [CTA: subscribe] → [OUTRO]",
        "[HOOK: surprising claim] → [PREVIEW: what you'll learn] → [STORY + LESSONS] → [PRACTICAL STEPS] → [CTA]",
        "[COLD OPEN: story mid-action] → [CONTEXT] → [MAIN CONTENT: 3-5 chapters] → [TIMESTAMP MARKERS] → [CTA + ENDSCREEN]",
    ],
    hook_patterns=[
        "What if I told you that {surprising_claim}? In this video, I'm going to show you exactly how.",
        "Most people get {topic} completely wrong. Here are the {number} things that actually matter.",
        "I spent {time} figuring out {topic} so you don't have to. Here's everything I learned.",
        "In the next {duration}, I'm going to change how you think about {topic}. Let's dive in.",
        "Stop. If you're {doing_thing}, you need to hear this before you continue.",
    ],
    length_range=LengthRange(min=1500, ideal=3000, max=5000),
    cta_styles=[
        "If you found this helpful, hit that subscribe button and the bell so you don't miss the next one.",
        "Drop a comment below telling me {question} — I read every single one.",
        "Watch this video next [point to endscreen] — it goes deeper into {related_topic}.",
        "I put together a free resource for this — link in the description.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Audience retention curve (especially first 30 seconds) and click-through rate on thumbnail/title",
        secondary="Watch time, likes, comments, and subscription conversions from the video",
        negative="Misleading titles/thumbnails, long intros before delivering value, asking for subs before providing value",
    ),
    audience_intent="Deep learning, entertainment, step-by-step guidance, staying current in a field",
    media_format="video_script",
    posting_cadence="1-2 videos per week, consistent upload schedule builds subscriber expectations",
)

_short_form_video = PlatformProfile(
    platform_id="short_form_video",
    name="Short-Form Video Script (Reels/TikTok/Shorts)",
    tier=4,
    native_tone=(
        "Fast-paced, hook-driven, and visually dynamic. The first 1-2 seconds determine whether "
        "someone keeps watching. Scripts are written as teleprompter-style text with visual cues. "
        "Conversational and direct — feels like someone talking to a friend, not presenting. "
        "High energy without being forced. Every second counts."
    ),
    structural_templates=[
        "[HOOK: 1-2s] → [CONTEXT: 3-5s] → [VALUE: 20-40s] → [CTA: 3-5s]",
        "[HOOK: pattern interrupt] → [Problem] → [Solution in 3 quick steps] → [Result/proof] → [CTA]",
        "[HOOK: 'Did you know...'] → [Myth vs reality] → [Quick explanation] → [Takeaway] → [CTA]",
    ],
    hook_patterns=[
        "Stop scrolling if you {relevant_situation}",
        "The {topic} hack nobody talks about:",
        "I wish someone told me this about {topic} sooner",
        "POV: You just discovered {insight}",
        "Here's why your {thing} isn't working:",
    ],
    length_range=LengthRange(min=150, ideal=400, max=800),
    cta_styles=[
        "Follow for more {topic} tips",
        "Save this for later",
        "Comment '{word}' and I'll send you the full guide",
        "Share this with someone who needs it",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Watch-through rate and replay rate are the dominant ranking signals",
        secondary="Shares, saves, and comments boost distribution to wider audiences",
        negative="Low-energy openings, text walls without visual cues, content over 60 seconds without strong retention",
    ),
    audience_intent="Quick entertainment, rapid learning, trend participation, discovery of new creators",
    media_format="video_script",
    posting_cadence="1-3 videos per day, posting frequency is rewarded by the algorithm",
)

_podcast_talking_points = PlatformProfile(
    platform_id="podcast_talking_points",
    name="Podcast Talking Points & Episode Outline",
    tier=4,
    native_tone=(
        "Structured but conversational. Provides a detailed episode outline with segment-level "
        "talking points, not a word-for-word script. Designed to keep the host on track while "
        "allowing natural conversation to flow. Includes transition suggestions, audience engagement "
        "moments, and key quotes or stats to reference."
    ),
    structural_templates=[
        "Episode title → cold open teaser → intro + episode overview → 3-4 segments with talking points → listener CTA → outro",
        "Episode title → hook question → guest intro (if applicable) → main discussion (4-5 topics) → rapid-fire round → CTA → outro",
        "Episode title → story opener → deep-dive segment → practical application segment → Q&A/mailbag → preview next episode → CTA",
    ],
    hook_patterns=[
        "What if everything you knew about {topic} was wrong? Today we're going to challenge that.",
        "I've been sitting on this story for {time}, and I finally need to share it with you.",
        "Today's episode is the one I wish existed when I was starting out with {topic}.",
        "You asked for it — today we're diving deep into {topic}. Let's get into it.",
        "Before we start, I need to tell you about something that happened this week with {topic}...",
    ],
    length_range=LengthRange(min=800, ideal=1500, max=3000),
    cta_styles=[
        "If you enjoyed this episode, leave a review — it genuinely helps the show reach more people.",
        "Share this episode with one person who would find it valuable.",
        "DM me on {platform} and tell me your biggest takeaway — I read every message.",
        "Next week we're covering {teaser} — make sure you're subscribed so you don't miss it.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Listener retention (percentage who finish the episode) and subscription rate",
        secondary="Reviews, ratings, and share/recommend actions within podcast apps",
        negative="Rambling intros over 3 minutes, no clear structure, inconsistent publishing schedule",
    ),
    audience_intent="In-depth exploration, learning during commute/workout, building parasocial connection with host",
    media_format="audio",
    posting_cadence="1-2 episodes per week on a consistent schedule, same day and time",
)

# ---------------------------------------------------------------------------
# Tier 5 — Community and Q&A platforms
# ---------------------------------------------------------------------------

_reddit_post = PlatformProfile(
    platform_id="reddit_post",
    name="Reddit Post",
    tier=5,
    native_tone=(
        "Value-first with zero self-promotion. Reddit users have a finely-tuned BS detector. "
        "The tone is helpful, genuine, and community-minded. Shares real experience, admits "
        "limitations, uses specific details over vague claims. Subreddit-aware — each community "
        "has its own culture and rules. The goal is to be the most helpful person in the thread."
    ),
    structural_templates=[
        "Descriptive title → context (why this is relevant) → main content with details → TLDR at bottom",
        "Question/discussion title → personal experience → what worked/didn't → open question to community",
        "Resource/guide title → brief intro → detailed breakdown with formatting → sources/references → edit log",
    ],
    hook_patterns=[
        "After {experience}, here's what I learned about {topic} [detailed breakdown]",
        "I tested {number} {things} over {time period}. Here are my honest results.",
        "The {topic} advice that actually worked for me (and what didn't)",
        "A beginner-friendly guide to {topic} — everything I wish I knew starting out",
        "Unpopular opinion on {topic}: {take}. Here's my reasoning.",
    ],
    length_range=LengthRange(min=200, ideal=800, max=2000),
    cta_styles=[
        "Happy to answer any questions in the comments.",
        "What has your experience been? Would love to hear other perspectives.",
        "If there's interest, I can do a deeper dive on {subtopic}.",
        "EDIT: Added more detail based on the comments. Thanks for the great discussion!",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Upvote-to-time ratio in the first hour determines hot page placement",
        secondary="Comment volume and quality of discussion drive sustained visibility",
        negative="Self-promotion, link dropping without context, not reading subreddit rules, generic advice",
    ),
    audience_intent="Authentic peer advice, detailed real-world experience, community discussion, honest opinions",
    media_format="text",
    posting_cadence="2-5 posts per week across relevant subreddits, comment engagement is as important as posting",
)

_quora_answer = PlatformProfile(
    platform_id="quora_answer",
    name="Quora Answer",
    tier=5,
    native_tone=(
        "Authoritative, experience-based, and question-framed. Quora rewards answers that directly "
        "address the question with personal expertise. Opens with a clear, direct answer to the question, "
        "then expands with reasoning, examples, and evidence. First-person experience is valued over "
        "generic information. Well-formatted with headers and bullet points for readability."
    ),
    structural_templates=[
        "Direct answer (1-2 sentences) → 'Here's why:' → 3-4 supporting points with examples → summary",
        "Short answer → personal story or experience → lessons extracted → broader application → closing insight",
        "Reframe the question → nuanced answer → evidence/data → practical advice → caveat or disclaimer",
    ],
    hook_patterns=[
        "I've been {doing_thing} for {X years}, so I can speak to this from experience.",
        "Short answer: {direct_answer}. But here's what most people miss:",
        "This is a question I get asked a lot, and the answer is more nuanced than most people think.",
        "Having {relevant_experience}, I can tell you that the real answer is {insight}.",
        "Most answers here will tell you {common_answer}. Here's what actually works:",
    ],
    length_range=LengthRange(min=200, ideal=600, max=1500),
    cta_styles=[
        "If this was helpful, an upvote helps more people find it.",
        "Follow me on Quora for more answers about {topic}.",
        "I write about this topic regularly — check my profile for related answers.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Upvotes and 'views to upvote' ratio determine answer ranking and digest inclusion",
        secondary="Credentials and topic expertise badges improve answer visibility",
        negative="Promotional links, copying from other sources, not answering the actual question asked",
    ),
    audience_intent="Getting expert answers to specific questions, learning from real experience",
    media_format="text",
    posting_cadence="3-5 answers per week, focus on questions with high follower counts and recent activity",
)

# ---------------------------------------------------------------------------
# Tier 6 — Specialized professional formats
# ---------------------------------------------------------------------------

_press_release = PlatformProfile(
    platform_id="press_release",
    name="Press Release",
    tier=6,
    native_tone=(
        "AP-style journalistic writing — factual, third-person, and news-worthy. Only use this "
        "format when there is genuine news to announce. Follows the inverted pyramid: most "
        "important information first, supporting details after. Includes a quote from a relevant "
        "person, a boilerplate 'About' section, and contact information placeholder. Professional, "
        "concise, and devoid of promotional language that would get it rejected by editors."
    ),
    structural_templates=[
        "Headline → Subheadline → Dateline + lead paragraph → 2-3 body paragraphs → quote block → boilerplate → contact info",
        "Headline → Dateline + news hook → context/background → key details → stakeholder quote → future outlook → boilerplate",
        "Headline → Subheadline → Lead (who/what/when/where/why) → supporting data → quote → additional context → boilerplate → ###",
    ],
    hook_patterns=[
        "{Company} Announces {Product/Initiative} to {Benefit} for {Audience}",
        "{Company} Achieves {Milestone}, Signaling {Industry Trend}",
        "New {Research/Report} from {Company} Reveals {Key Finding}",
        "{Company} Partners with {Partner} to {Outcome}",
        "{Industry} Leader {Company} Launches {Innovation} Amid {Context}",
    ],
    length_range=LengthRange(min=300, ideal=600, max=800),
    cta_styles=[
        "For more information, visit {URL} or contact {media_contact}.",
        "To schedule an interview, contact {PR_contact}.",
        "Additional resources and media assets are available at {URL}.",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="News value and timeliness determine pickup by journalists and syndication services",
        secondary="SEO-optimized headline and inclusion on PR distribution networks",
        negative="Promotional language disguised as news, no actual news hook, excessive superlatives",
    ),
    audience_intent="Journalists seeking newsworthy stories, industry analysts tracking developments",
    media_format="text",
    posting_cadence="Only when there is genuine news — 1-4 per quarter maximum",
)

_slide_deck = PlatformProfile(
    platform_id="slide_deck",
    name="Slide Deck / Presentation",
    tier=6,
    native_tone=(
        "Visual and concise — each slide communicates one idea with minimal text. Follows "
        "presentation best practices: 6 words per line maximum, no more than 6 lines per slide. "
        "Titles are action-oriented statements, not labels. Speaker notes contain the full talking "
        "points. The deck tells a story: setup, tension, resolution. Heavy on frameworks, diagrams, "
        "and data visualization suggestions."
    ),
    structural_templates=[
        "Title slide → agenda → problem/context (2 slides) → main framework (4-6 slides) → case study → key takeaways → Q&A slide",
        "Title → hook question → current state → vision → 3-5 strategy pillars → implementation → timeline → CTA slide",
        "Title → executive summary → background → analysis (3-4 slides) → recommendations → next steps → appendix",
    ],
    hook_patterns=[
        "What if {audience} could {desirable_outcome}?",
        "The {number}-step framework for {outcome}",
        "{Topic}: From {current_state} to {desired_state}",
        "Why {common_approach} fails — and the alternative that works",
        "The future of {topic}: {bold_prediction}",
    ],
    length_range=LengthRange(min=1000, ideal=2000, max=3500),
    cta_styles=[
        "Next step: {specific_action} by {date}",
        "Let's schedule a follow-up to discuss {topic}",
        "Questions? {contact_info}",
        "Resources and references available at {URL}",
    ],
    algorithm_signals=AlgorithmSignals(
        primary="Clarity of the core message and visual hierarchy of information",
        secondary="Shareability on SlideShare/LinkedIn and reusability of frameworks",
        negative="Text-heavy slides, reading slides verbatim, no narrative arc, clip art",
    ),
    audience_intent="Understanding a framework, making a decision, learning a strategy in a meeting or conference",
    media_format="text",
    posting_cadence="As needed for presentations, webinars, and conference talks",
)

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

PLATFORMS: dict[str, PlatformProfile] = {
    p.platform_id: p
    for p in [
        _twitter_single,
        _twitter_thread,
        _linkedin_post,
        _linkedin_article,
        _bluesky_post,
        _instagram_carousel,
        _instagram_caption,
        _pinterest_pin,
        _blog_seo,
        _email_newsletter,
        _medium_post,
        _youtube_longform,
        _short_form_video,
        _podcast_talking_points,
        _reddit_post,
        _quora_answer,
        _press_release,
        _slide_deck,
    ]
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_platform(platform_id: str) -> PlatformProfile | None:
    """Look up a platform profile by its ID. Returns None if not found."""
    return PLATFORMS.get(platform_id)


def get_all_platforms() -> list[PlatformProfile]:
    """Return all registered platform profiles."""
    return list(PLATFORMS.values())


def get_platforms_by_tier(tier: int) -> list[PlatformProfile]:
    """Return all platforms belonging to a specific tier."""
    return [p for p in PLATFORMS.values() if p.tier == tier]
