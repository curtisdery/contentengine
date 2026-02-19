"""Tests for the Transformation Engine — non-AI platform fit evaluation,
prompt construction, and platform profile validation."""

import pytest

from app.platforms.profiles import (
    PLATFORMS,
    PlatformProfile,
    get_all_platforms,
    get_platform,
    get_platforms_by_tier,
)
from app.services.transformation import TransformationEngine

engine = TransformationEngine()


# ---------------------------------------------------------------------------
# Sample DNA cards for testing
# ---------------------------------------------------------------------------

DNA_DATA_HEAVY = {
    "core_idea": "Content creators who repurpose systematically grow 10x faster than those who create net-new content for each platform.",
    "key_points": [
        {"point": "Repurposing saves 60% of content creation time", "strength": 0.9, "description": "Time savings from systematic repurposing"},
        {"point": "Top 1% of creators use a content DNA approach", "strength": 0.85, "description": "Framework used by elite creators"},
        {"point": "Platform-native formatting increases engagement by 300%", "strength": 0.8, "description": "Impact of native formatting"},
        {"point": "The 80/20 rule applies to content distribution", "strength": 0.75, "description": "Pareto principle in content"},
        {"point": "SEO compounds over time with repurposed blog content", "strength": 0.7, "description": "SEO compounding effect"},
    ],
    "best_hooks": [
        {"hook": "Did you know 73% of top creators use content repurposing?", "hook_type": "statistic", "platform_fit": ["twitter", "linkedin"]},
        {"hook": "Stop creating content from scratch. Here's why.", "hook_type": "bold_claim", "platform_fit": ["twitter", "tiktok"]},
        {"hook": "The content creation system that 10x'd my output", "hook_type": "story", "platform_fit": ["linkedin", "youtube"]},
    ],
    "quotable_moments": [
        "The best creators don't create more — they distribute better.",
        "Content repurposing isn't lazy. It's leveraged.",
        "One piece of content can become 18 platform-ready outputs.",
    ],
    "emotional_arc": [
        {"segment": "beginning", "tone": "challenging", "intensity": 0.7},
        {"segment": "middle", "tone": "educational", "intensity": 0.8},
        {"segment": "end", "tone": "empowering", "intensity": 0.9},
    ],
    "content_type_classification": "how_to",
    "suggested_platforms": [
        {"platform_id": "twitter_thread", "platform_name": "Twitter Thread", "fit_score": 0.9, "reason": "Data-rich content perfect for thread format"},
        {"platform_id": "linkedin_post", "platform_name": "LinkedIn Post", "fit_score": 0.85, "reason": "Professional insight with actionable framework"},
    ],
}

DNA_PERSONAL_STORY = {
    "core_idea": "I quit my six-figure job to become a content creator, and it was the scariest and best decision I ever made.",
    "key_points": [
        {"point": "Left a stable career at 32 to pursue content creation", "strength": 0.9, "description": "The leap of faith"},
        {"point": "First 6 months generated zero income", "strength": 0.85, "description": "The struggle period"},
        {"point": "Found success by being authentic rather than polished", "strength": 0.8, "description": "The turning point"},
    ],
    "best_hooks": [
        {"hook": "I walked away from $150k to post on the internet.", "hook_type": "bold_claim", "platform_fit": ["twitter", "linkedin"]},
        {"hook": "The email that changed my life was my resignation letter.", "hook_type": "story", "platform_fit": ["instagram", "linkedin"]},
    ],
    "quotable_moments": [
        "Security is an illusion when you're dying inside.",
        "My worst month as a creator was better than my best month in corporate.",
    ],
    "emotional_arc": [
        {"segment": "beginning", "tone": "vulnerable", "intensity": 0.9},
        {"segment": "middle", "tone": "uncertain", "intensity": 0.7},
        {"segment": "end", "tone": "triumphant", "intensity": 0.95},
    ],
    "content_type_classification": "personal_story",
    "suggested_platforms": [],
}

DNA_FRAMEWORK = {
    "core_idea": "The CRAFT framework for building a content engine: Create, Repurpose, Amplify, Filter, Track.",
    "key_points": [
        {"point": "Create: Start with one long-form anchor piece", "strength": 0.9, "description": "Foundation of the system"},
        {"point": "Repurpose: Extract platform-specific formats", "strength": 0.9, "description": "Multiplication step"},
        {"point": "Amplify: Use paid and organic distribution", "strength": 0.8, "description": "Distribution strategy"},
        {"point": "Filter: Remove underperforming content", "strength": 0.75, "description": "Quality control"},
        {"point": "Track: Measure and iterate on performance", "strength": 0.8, "description": "Feedback loop"},
    ],
    "best_hooks": [
        {"hook": "Introducing the CRAFT framework for content creators", "hook_type": "bold_claim", "platform_fit": ["linkedin", "twitter"]},
    ],
    "quotable_moments": [
        "A framework without execution is just a pretty diagram.",
        "The best systems run themselves.",
    ],
    "emotional_arc": [
        {"segment": "beginning", "tone": "authoritative", "intensity": 0.6},
        {"segment": "middle", "tone": "instructional", "intensity": 0.8},
        {"segment": "end", "tone": "motivational", "intensity": 0.7},
    ],
    "content_type_classification": "how_to",
    "suggested_platforms": [],
}

DNA_OPINION = {
    "core_idea": "Most content marketing advice is recycled garbage, and creators need to stop following it blindly.",
    "key_points": [
        {"point": "90% of content advice comes from people who don't create content", "strength": 0.9, "description": "The credibility problem"},
        {"point": "Consistency is overrated — quality trumps quantity", "strength": 0.85, "description": "Contrarian take on consistency"},
        {"point": "Engagement metrics are vanity metrics for most creators", "strength": 0.8, "description": "Redefining success"},
    ],
    "best_hooks": [
        {"hook": "Unpopular opinion: posting daily is ruining your content.", "hook_type": "contrarian", "platform_fit": ["twitter", "bluesky"]},
        {"hook": "The content marketing emperor has no clothes.", "hook_type": "bold_claim", "platform_fit": ["linkedin", "medium"]},
        {"hook": "Hot take: your engagement rate doesn't matter.", "hook_type": "contrarian", "platform_fit": ["twitter", "bluesky", "linkedin"]},
    ],
    "quotable_moments": [
        "If your advice could come from anyone, it's not advice — it's a platitude.",
        "The algorithm doesn't care about your posting schedule. It cares about your audience.",
    ],
    "emotional_arc": [
        {"segment": "beginning", "tone": "provocative", "intensity": 0.9},
        {"segment": "middle", "tone": "passionate", "intensity": 0.85},
        {"segment": "end", "tone": "constructive", "intensity": 0.7},
    ],
    "content_type_classification": "opinion",
    "suggested_platforms": [],
}


# ---------------------------------------------------------------------------
# Test: Platform fit evaluation
# ---------------------------------------------------------------------------


class TestEvaluatePlatformFitDataHeavyContent:
    """Data-heavy how-to content should score well on threads, long-form, and carousel platforms."""

    def test_high_fit_for_twitter_thread(self):
        platform = get_platform("twitter_thread")
        score = engine.evaluate_platform_fit(DNA_DATA_HEAVY, platform)
        assert score >= 0.8, f"Expected >= 0.8 for twitter_thread with data-heavy how-to, got {score}"

    def test_high_fit_for_blog_seo(self):
        platform = get_platform("blog_seo")
        score = engine.evaluate_platform_fit(DNA_DATA_HEAVY, platform)
        assert score >= 0.85, f"Expected >= 0.85 for blog_seo with data-heavy how-to, got {score}"

    def test_high_fit_for_instagram_carousel(self):
        platform = get_platform("instagram_carousel")
        score = engine.evaluate_platform_fit(DNA_DATA_HEAVY, platform)
        assert score >= 0.9, f"Expected >= 0.9 for instagram_carousel with how-to, got {score}"

    def test_low_fit_for_press_release(self):
        platform = get_platform("press_release")
        score = engine.evaluate_platform_fit(DNA_DATA_HEAVY, platform)
        assert score <= 0.3, f"Expected <= 0.3 for press_release with how-to, got {score}"


class TestEvaluatePlatformFitPersonalStory:
    """Personal story content should score well on LinkedIn posts, Instagram, and newsletters."""

    def test_high_fit_for_linkedin_post(self):
        platform = get_platform("linkedin_post")
        score = engine.evaluate_platform_fit(DNA_PERSONAL_STORY, platform)
        assert score >= 0.9, f"Expected >= 0.9 for linkedin_post with personal story, got {score}"

    def test_high_fit_for_instagram_caption(self):
        platform = get_platform("instagram_caption")
        score = engine.evaluate_platform_fit(DNA_PERSONAL_STORY, platform)
        assert score >= 0.85, f"Expected >= 0.85 for instagram_caption with personal story, got {score}"

    def test_high_fit_for_email_newsletter(self):
        platform = get_platform("email_newsletter")
        score = engine.evaluate_platform_fit(DNA_PERSONAL_STORY, platform)
        assert score >= 0.85, f"Expected >= 0.85 for email_newsletter with personal story, got {score}"

    def test_low_fit_for_pinterest_pin(self):
        platform = get_platform("pinterest_pin")
        score = engine.evaluate_platform_fit(DNA_PERSONAL_STORY, platform)
        assert score <= 0.4, f"Expected <= 0.4 for pinterest_pin with personal story, got {score}"


class TestEvaluatePlatformFitFrameworkContent:
    """Framework-heavy content should score well on carousels, slides, and blog."""

    def test_high_fit_for_instagram_carousel(self):
        platform = get_platform("instagram_carousel")
        score = engine.evaluate_platform_fit(DNA_FRAMEWORK, platform)
        assert score >= 0.9, f"Expected >= 0.9 for instagram_carousel with framework, got {score}"

    def test_high_fit_for_slide_deck(self):
        platform = get_platform("slide_deck")
        score = engine.evaluate_platform_fit(DNA_FRAMEWORK, platform)
        assert score >= 0.8, f"Expected >= 0.8 for slide_deck with framework, got {score}"

    def test_high_fit_for_blog_seo(self):
        platform = get_platform("blog_seo")
        score = engine.evaluate_platform_fit(DNA_FRAMEWORK, platform)
        assert score >= 0.9, f"Expected >= 0.9 for blog_seo with framework, got {score}"


class TestEvaluatePlatformFitOpinionContent:
    """Opinion content should score well on Twitter, Bluesky, LinkedIn, and Reddit."""

    def test_high_fit_for_twitter_single(self):
        platform = get_platform("twitter_single")
        score = engine.evaluate_platform_fit(DNA_OPINION, platform)
        assert score >= 0.9, f"Expected >= 0.9 for twitter_single with opinion, got {score}"

    def test_high_fit_for_bluesky_post(self):
        platform = get_platform("bluesky_post")
        score = engine.evaluate_platform_fit(DNA_OPINION, platform)
        assert score >= 0.85, f"Expected >= 0.85 for bluesky_post with opinion, got {score}"

    def test_high_fit_for_reddit_post(self):
        platform = get_platform("reddit_post")
        score = engine.evaluate_platform_fit(DNA_OPINION, platform)
        assert score >= 0.8, f"Expected >= 0.8 for reddit_post with opinion, got {score}"

    def test_low_fit_for_press_release(self):
        platform = get_platform("press_release")
        score = engine.evaluate_platform_fit(DNA_OPINION, platform)
        assert score <= 0.3, f"Expected <= 0.3 for press_release with opinion, got {score}"

    def test_low_fit_for_pinterest_pin(self):
        platform = get_platform("pinterest_pin")
        score = engine.evaluate_platform_fit(DNA_OPINION, platform)
        assert score <= 0.3, f"Expected <= 0.3 for pinterest_pin with opinion, got {score}"


# ---------------------------------------------------------------------------
# Test: Platform profiles completeness
# ---------------------------------------------------------------------------


class TestPlatformProfilesAll18Exist:
    """Verify all 18 platform profiles are defined and registered."""

    EXPECTED_PLATFORM_IDS = [
        "twitter_single",
        "twitter_thread",
        "linkedin_post",
        "linkedin_article",
        "bluesky_post",
        "instagram_carousel",
        "instagram_caption",
        "pinterest_pin",
        "blog_seo",
        "email_newsletter",
        "medium_post",
        "youtube_longform",
        "short_form_video",
        "podcast_talking_points",
        "reddit_post",
        "quora_answer",
        "press_release",
        "slide_deck",
    ]

    def test_exactly_18_platforms_registered(self):
        assert len(PLATFORMS) == 18, f"Expected 18 platforms, got {len(PLATFORMS)}"

    def test_all_expected_ids_present(self):
        for pid in self.EXPECTED_PLATFORM_IDS:
            assert pid in PLATFORMS, f"Missing platform: {pid}"

    def test_get_platform_returns_profile(self):
        for pid in self.EXPECTED_PLATFORM_IDS:
            profile = get_platform(pid)
            assert profile is not None, f"get_platform('{pid}') returned None"
            assert isinstance(profile, PlatformProfile)

    def test_get_platform_unknown_returns_none(self):
        assert get_platform("nonexistent_platform") is None

    def test_get_all_platforms_returns_18(self):
        all_platforms = get_all_platforms()
        assert len(all_platforms) == 18


class TestPlatformProfilesHaveRequiredFields:
    """Every platform profile must have all required fields populated."""

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_valid_platform_id(self, platform_id):
        p = PLATFORMS[platform_id]
        assert p.platform_id == platform_id
        assert len(p.platform_id) > 0

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_name(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.name) > 0

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_valid_tier(self, platform_id):
        p = PLATFORMS[platform_id]
        assert p.tier in (1, 2, 3, 4, 5, 6)

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_native_tone(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.native_tone) > 20, "native_tone should be a descriptive paragraph"

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_structural_templates(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.structural_templates) >= 2, "Should have at least 2 structural templates"

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_hook_patterns(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.hook_patterns) >= 3, "Should have at least 3 hook patterns"

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_valid_length_range(self, platform_id):
        p = PLATFORMS[platform_id]
        assert p.length_range.min > 0
        assert p.length_range.ideal >= p.length_range.min
        assert p.length_range.max >= p.length_range.ideal

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_cta_styles(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.cta_styles) >= 2, "Should have at least 2 CTA styles"

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_algorithm_signals(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.algorithm_signals.primary) > 10
        assert len(p.algorithm_signals.secondary) > 10
        assert len(p.algorithm_signals.negative) > 10

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_audience_intent(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.audience_intent) > 10

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_media_format(self, platform_id):
        p = PLATFORMS[platform_id]
        assert p.media_format in ("text", "text+image", "carousel", "video_script", "audio")

    @pytest.mark.parametrize("platform_id", list(PLATFORMS.keys()))
    def test_profile_has_posting_cadence(self, platform_id):
        p = PLATFORMS[platform_id]
        assert len(p.posting_cadence) > 5


class TestGetPlatformsByTier:
    """Test the tier-based filtering helper."""

    def test_tier_1_has_5_platforms(self):
        tier1 = get_platforms_by_tier(1)
        assert len(tier1) == 5
        ids = {p.platform_id for p in tier1}
        assert ids == {
            "twitter_single",
            "twitter_thread",
            "linkedin_post",
            "linkedin_article",
            "bluesky_post",
        }

    def test_tier_2_has_3_platforms(self):
        tier2 = get_platforms_by_tier(2)
        assert len(tier2) == 3
        ids = {p.platform_id for p in tier2}
        assert ids == {"instagram_carousel", "instagram_caption", "pinterest_pin"}

    def test_tier_3_has_3_platforms(self):
        tier3 = get_platforms_by_tier(3)
        assert len(tier3) == 3
        ids = {p.platform_id for p in tier3}
        assert ids == {"blog_seo", "email_newsletter", "medium_post"}

    def test_tier_4_has_3_platforms(self):
        tier4 = get_platforms_by_tier(4)
        assert len(tier4) == 3
        ids = {p.platform_id for p in tier4}
        assert ids == {"youtube_longform", "short_form_video", "podcast_talking_points"}

    def test_tier_5_has_2_platforms(self):
        tier5 = get_platforms_by_tier(5)
        assert len(tier5) == 2
        ids = {p.platform_id for p in tier5}
        assert ids == {"reddit_post", "quora_answer"}

    def test_tier_6_has_2_platforms(self):
        tier6 = get_platforms_by_tier(6)
        assert len(tier6) == 2
        ids = {p.platform_id for p in tier6}
        assert ids == {"press_release", "slide_deck"}

    def test_tier_99_returns_empty(self):
        assert get_platforms_by_tier(99) == []


# ---------------------------------------------------------------------------
# Test: Prompt building
# ---------------------------------------------------------------------------


class TestBuildGenerationPromptIncludesPlatformInfo:
    """Verify the generation prompt includes key platform information."""

    def test_includes_platform_name(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content for testing.",
            emphasis_notes=None,
        )
        assert "LinkedIn Post" in prompt

    def test_includes_native_tone(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content for testing.",
            emphasis_notes=None,
        )
        assert "First-person" in prompt

    def test_includes_length_range(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "280" in prompt
        assert "200" in prompt  # ideal

    def test_includes_algorithm_signals(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "Comments and dwell time" in prompt

    def test_includes_core_idea(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "Content creators who repurpose" in prompt

    def test_includes_key_points(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "Repurposing saves 60%" in prompt

    def test_includes_hooks(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "73% of top creators" in prompt

    def test_includes_quotable_moments(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "distribute better" in prompt

    def test_includes_structural_templates(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "Personal story opener" in prompt

    def test_includes_format_specific_instructions_for_thread(self):
        platform = get_platform("twitter_thread")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "---" in prompt
        assert "numbered tweets" in prompt.lower()

    def test_includes_format_specific_instructions_for_carousel(self):
        platform = get_platform("instagram_carousel")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "[Slide" in prompt

    def test_includes_format_specific_instructions_for_email(self):
        platform = get_platform("email_newsletter")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "SUBJECT:" in prompt
        assert "PREVIEW:" in prompt
        assert "BODY:" in prompt


class TestBuildGenerationPromptIncludesVoiceProfile:
    """Verify the generation prompt includes voice profile information when provided."""

    class FakeVoiceProfile:
        """Minimal stand-in for BrandVoiceProfile to avoid DB dependency."""

        voice_attributes = ["bold", "direct", "witty"]
        tone_metrics = {
            "formality": 0.3,
            "humor": 0.7,
            "vulnerability": 0.6,
            "directness": 0.9,
            "jargon_density": 0.2,
        }
        vocabulary = {
            "common_words": ["leverage", "framework", "unlock"],
            "preferred_terms": ["creator", "build", "ship"],
            "banned_terms": ["synergy", "paradigm", "disrupt"],
        }
        formatting_config = {"signature_phrases": ["let's go", "here's the thing"]}
        topic_boundaries = {
            "approved_topics": ["content creation", "entrepreneurship"],
            "restricted_topics": ["politics", "religion"],
        }
        cta_library = ["Follow for more", "Save this post"]

    def test_includes_voice_attributes(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=self.FakeVoiceProfile(),
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "bold" in prompt
        assert "direct" in prompt
        assert "witty" in prompt

    def test_includes_tone_metrics(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=self.FakeVoiceProfile(),
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "0.3" in prompt  # formality
        assert "0.7" in prompt  # humor
        assert "0.9" in prompt  # directness

    def test_includes_banned_terms(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=self.FakeVoiceProfile(),
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "synergy" in prompt
        assert "paradigm" in prompt
        assert "NEVER use" in prompt

    def test_includes_preferred_terms(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=self.FakeVoiceProfile(),
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "creator" in prompt
        assert "ship" in prompt

    def test_includes_restricted_topics(self):
        platform = get_platform("linkedin_post")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=self.FakeVoiceProfile(),
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "politics" in prompt
        assert "religion" in prompt


class TestBuildGenerationPromptWithoutVoiceProfile:
    """Verify the prompt handles a None voice profile gracefully."""

    def test_no_crash_without_voice_profile(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "No specific voice profile provided" in prompt

    def test_includes_emphasis_notes_when_provided(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes="Focus on the 300% engagement stat. Make it punchy.",
        )
        assert "Focus on the 300% engagement stat" in prompt
        assert "Make it punchy" in prompt

    def test_no_emphasis_section_when_none(self):
        platform = get_platform("twitter_single")
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "Additional Direction from Creator" not in prompt

    def test_handles_empty_dna(self):
        platform = get_platform("twitter_single")
        empty_dna = {
            "core_idea": "",
            "key_points": [],
            "best_hooks": [],
            "quotable_moments": [],
            "content_type_classification": "unknown",
        }
        prompt = engine._build_generation_prompt(
            content_dna=empty_dna,
            platform=platform,
            voice_profile=None,
            raw_content="Sample content.",
            emphasis_notes=None,
        )
        assert "No key points extracted" in prompt
        assert "No hooks extracted" in prompt
        assert "No quotable moments extracted" in prompt

    def test_raw_content_truncated_for_long_input(self):
        platform = get_platform("twitter_single")
        long_content = "x" * 10000
        prompt = engine._build_generation_prompt(
            content_dna=DNA_DATA_HEAVY,
            platform=platform,
            voice_profile=None,
            raw_content=long_content,
            emphasis_notes=None,
        )
        # The prompt should include at most 5000 chars of raw content
        assert len(prompt) < len(long_content)
