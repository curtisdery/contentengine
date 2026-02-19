"""Tests for content ingestion — parsers, format detection, and text processing."""

import pytest

from app.services.ingestion import IngestionService
from app.utils.parsers import (
    detect_transcript_format,
    parse_plain_transcript,
    parse_srt,
    parse_vtt,
)

service = IngestionService()

# ── SRT sample ──────────────────────────────────────────────────────────────

SAMPLE_SRT = """1
00:00:01,000 --> 00:00:04,500
Welcome to the show everyone.

2
00:00:05,000 --> 00:00:09,200
Today we are going to talk about
content creation strategies.

3
00:00:10,000 --> 00:00:15,800
The first thing you need to understand
is that consistency beats perfection.

4
00:00:16,500 --> 00:00:22,000
Did you know that 73% of creators
who post daily grow 10x faster?

5
00:00:23,000 --> 00:00:28,500
That is a staggering statistic!
Let me break it down for you.
"""

# ── VTT sample ──────────────────────────────────────────────────────────────

SAMPLE_VTT = """WEBVTT

00:00:01.000 --> 00:00:04.500
Welcome to the show everyone.

00:00:05.000 --> 00:00:09.200
Today we are going to talk about content creation strategies.

00:00:10.000 --> 00:00:15.800
The first thing you need to understand is that consistency beats perfection.

00:00:16.500 --> 00:00:22.000
Did you know that 73% of creators who post daily grow 10x faster?

00:00:23.000 --> 00:00:28.500
That is a staggering statistic! Let me break it down for you.
"""

# ── Plain transcript sample ────────────────────────────────────────────────

SAMPLE_PLAIN = """Host: Welcome to the show everyone. Today we have a special guest.

Guest: Thanks for having me, I'm excited to be here.

Host: Let's dive right in. What inspired you to start creating content?

Guest: Well, it all started when I realized that most advice out there was generic. I wanted to share what actually worked for me.

And here's the thing - consistency is everything. You have to show up every single day.
"""

# ── Blog content sample ───────────────────────────────────────────────────

SAMPLE_BLOG = """# The Ultimate Guide to Content Repurposing

## Why Repurposing Matters

Content repurposing is the practice of taking one piece of content and transforming it into multiple formats. This strategy is essential for solo creators who need to maintain a presence across platforms.

- Save time by working smarter, not harder
- Reach audiences on their preferred platforms
- Reinforce your key messages through repetition

## The 80/20 Rule of Content

"The best creators don't create more content — they distribute better." This is a fundamental truth that 90% of content creators miss entirely.

Here are the numbers: creators who repurpose see a 300% increase in engagement and spend 60% less time on content creation.

> Great content isn't about perfection. It's about showing up consistently with value.

## Getting Started

1. Start with your best performing content
2. Identify the core message
3. Adapt for each platform's native format
"""


class TestParseSRT:
    def test_parse_srt_basic(self):
        """Test that SRT content is parsed into timestamped segments."""
        segments = parse_srt(SAMPLE_SRT)

        assert len(segments) == 5
        assert segments[0]["start_time"] == 1.0
        assert segments[0]["end_time"] == 4.5
        assert "Welcome to the show" in segments[0]["text"]

    def test_parse_srt_multiline_text(self):
        """Test that multi-line SRT text is joined into a single text field."""
        segments = parse_srt(SAMPLE_SRT)

        # Second segment has two lines
        assert "Today we are going to talk about" in segments[1]["text"]
        assert "content creation strategies" in segments[1]["text"]

    def test_parse_srt_timestamps(self):
        """Test that SRT timestamps are correctly converted to seconds."""
        segments = parse_srt(SAMPLE_SRT)

        assert segments[0]["start_time"] == 1.0
        assert segments[0]["end_time"] == 4.5
        assert segments[3]["start_time"] == 16.5
        assert segments[3]["end_time"] == 22.0

    def test_parse_srt_empty(self):
        """Test that empty SRT content returns empty list."""
        segments = parse_srt("")
        assert segments == []

    def test_parse_srt_malformed(self):
        """Test that malformed SRT content is handled gracefully."""
        malformed = "This is not SRT content at all."
        segments = parse_srt(malformed)
        assert segments == []


class TestParseVTT:
    def test_parse_vtt_basic(self):
        """Test that VTT content is parsed into timestamped segments."""
        segments = parse_vtt(SAMPLE_VTT)

        assert len(segments) == 5
        assert segments[0]["start_time"] == 1.0
        assert segments[0]["end_time"] == 4.5
        assert "Welcome to the show" in segments[0]["text"]

    def test_parse_vtt_timestamps(self):
        """Test that VTT timestamps are correctly converted to seconds."""
        segments = parse_vtt(SAMPLE_VTT)

        assert segments[3]["start_time"] == 16.5
        assert segments[3]["end_time"] == 22.0

    def test_parse_vtt_with_cue_identifiers(self):
        """Test VTT parsing with optional cue identifiers."""
        vtt_with_ids = """WEBVTT

cue-1
00:00:01.000 --> 00:00:04.000
First line of text.

cue-2
00:00:05.000 --> 00:00:08.000
Second line of text.
"""
        segments = parse_vtt(vtt_with_ids)
        assert len(segments) == 2
        assert segments[0]["text"] == "First line of text."
        assert segments[1]["text"] == "Second line of text."

    def test_parse_vtt_empty(self):
        """Test that empty VTT content returns empty list."""
        segments = parse_vtt("WEBVTT")
        assert segments == []

    def test_parse_vtt_without_hours(self):
        """Test VTT parsing with MM:SS.mmm format (no hours)."""
        vtt_short = """WEBVTT

01:30.000 --> 01:35.000
Short format timestamp.
"""
        segments = parse_vtt(vtt_short)
        assert len(segments) == 1
        assert segments[0]["start_time"] == 90.0
        assert segments[0]["end_time"] == 95.0


class TestParsePlainTranscript:
    def test_parse_plain_transcript_with_speakers(self):
        """Test that speaker labels are correctly detected and extracted."""
        segments = parse_plain_transcript(SAMPLE_PLAIN)

        # Should have at least 4 segments (Host, Guest, Host, Guest, and unlabeled)
        assert len(segments) >= 4

        # Check speaker detection
        speakers = [s["speaker"] for s in segments if s["speaker"]]
        assert "Host" in speakers
        assert "Guest" in speakers

    def test_parse_plain_transcript_unlabeled(self):
        """Test that unlabeled paragraphs have speaker as None."""
        segments = parse_plain_transcript(SAMPLE_PLAIN)

        # The last paragraph has no speaker label
        unlabeled = [s for s in segments if s["speaker"] is None]
        assert len(unlabeled) >= 1

    def test_parse_plain_transcript_empty(self):
        """Test that empty content returns empty list."""
        segments = parse_plain_transcript("")
        assert segments == []

    def test_parse_plain_transcript_no_speakers(self):
        """Test plain transcript without any speaker labels."""
        plain = """This is the first paragraph of the transcript.

This is the second paragraph with more content.

And a third paragraph wrapping things up.
"""
        segments = parse_plain_transcript(plain)
        assert len(segments) == 3
        assert all(s["speaker"] is None for s in segments)


class TestDetectTranscriptFormat:
    def test_detect_transcript_format_srt(self):
        """Test that SRT format is correctly detected."""
        assert detect_transcript_format(SAMPLE_SRT) == "srt"

    def test_detect_transcript_format_vtt(self):
        """Test that VTT format is correctly detected."""
        assert detect_transcript_format(SAMPLE_VTT) == "vtt"

    def test_detect_transcript_format_plain(self):
        """Test that plain text is correctly detected."""
        assert detect_transcript_format(SAMPLE_PLAIN) == "plain"

    def test_detect_transcript_format_empty(self):
        """Test that empty content defaults to plain."""
        assert detect_transcript_format("") == "plain"


class TestExtractCleanText:
    def test_extract_clean_text_removes_filler(self):
        """Test that filler words are removed from extracted text."""
        segments = [
            {"text": "So um basically what I'm saying is like you know really important."},
            {"text": "Actually this is uh the key point right here."},
        ]
        clean = service.extract_clean_text(segments)

        assert "um" not in clean.lower().split()
        assert "uh" not in clean.lower().split()
        assert "basically" not in clean.lower().split()
        assert "important" in clean
        assert "key point" in clean

    def test_extract_clean_text_joins_segments(self):
        """Test that text from multiple segments is joined."""
        segments = [
            {"text": "First segment."},
            {"text": "Second segment."},
            {"text": "Third segment."},
        ]
        clean = service.extract_clean_text(segments)
        assert "First segment" in clean
        assert "Third segment" in clean

    def test_extract_clean_text_empty(self):
        """Test that empty segments return empty string."""
        clean = service.extract_clean_text([])
        assert clean == ""

    def test_extract_clean_text_preserves_meaningful_words(self):
        """Test that non-filler words are preserved."""
        segments = [
            {"text": "The data shows a 50% improvement in conversion rates."},
        ]
        clean = service.extract_clean_text(segments)
        assert "50%" in clean
        assert "improvement" in clean
        assert "conversion rates" in clean


class TestIdentifyClipWindows:
    def test_identify_clip_windows(self):
        """Test that clip windows are identified from timestamped segments."""
        # Create segments spanning 2 minutes with varying engagement
        segments = []
        for i in range(24):
            start = i * 5.0
            end = start + 4.5
            if i >= 4 and i <= 7:
                # High engagement section (lots of questions and exclamations)
                text = f"Isn't this amazing? This is incredible! Why don't more people do this? Segment {i}!"
            elif i >= 12 and i <= 15:
                # Another engaging section
                text = f"What if I told you the secret? This changes everything! Can you believe it? Part {i}!"
            else:
                text = f"Regular content here for segment number {i}."
            segments.append({"start_time": start, "end_time": end, "text": text})

        windows = service.identify_clip_windows(segments)

        assert len(windows) > 0
        assert len(windows) <= 5

        # Windows should have required fields
        for window in windows:
            assert "start_time" in window
            assert "end_time" in window
            assert "text_preview" in window
            assert "score" in window
            assert window["score"] > 0

        # Windows should be sorted by score descending
        scores = [w["score"] for w in windows]
        assert scores == sorted(scores, reverse=True)

    def test_identify_clip_windows_empty(self):
        """Test that empty segments return empty list."""
        windows = service.identify_clip_windows([])
        assert windows == []

    def test_identify_clip_windows_no_timestamps(self):
        """Test that segments without valid timestamps return empty list."""
        segments = [
            {"start_time": 0.0, "end_time": 0.0, "text": "No timestamps here."},
        ]
        windows = service.identify_clip_windows(segments)
        assert windows == []


class TestParseBlogContent:
    def test_parse_blog_content_extracts_structure(self):
        """Test that blog content is parsed into structured components."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert "headings" in parsed
        assert "paragraphs" in parsed
        assert "list_items" in parsed
        assert "statistics" in parsed
        assert "quotes" in parsed
        assert "word_count" in parsed
        assert "reading_grade_level" in parsed
        assert "full_text" in parsed

    def test_parse_blog_content_extracts_headings(self):
        """Test that markdown headings are extracted."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert len(parsed["headings"]) >= 3
        assert "The Ultimate Guide to Content Repurposing" in parsed["headings"]
        assert "Why Repurposing Matters" in parsed["headings"]

    def test_parse_blog_content_extracts_list_items(self):
        """Test that bullet and numbered list items are extracted."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert len(parsed["list_items"]) >= 3
        # Check for bullet list items
        assert any("Save time" in item for item in parsed["list_items"])
        # Check for numbered list items
        assert any("Start with" in item for item in parsed["list_items"])

    def test_parse_blog_content_extracts_quotes(self):
        """Test that block quotes and inline quotes are extracted."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert len(parsed["quotes"]) >= 1

    def test_parse_blog_content_calculates_word_count(self):
        """Test that word count is calculated."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert parsed["word_count"] > 50

    def test_parse_blog_content_calculates_reading_level(self):
        """Test that reading grade level is calculated as a reasonable value."""
        parsed = service.parse_blog_content(SAMPLE_BLOG)

        assert 0 <= parsed["reading_grade_level"] <= 20

    def test_parse_blog_content_empty(self):
        """Test that empty content returns sensible defaults."""
        parsed = service.parse_blog_content("")

        assert parsed["word_count"] == 0
        assert parsed["headings"] == []
