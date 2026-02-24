"""Content ingestion service — parsing and text processing utilities."""

import logging
import re

from app.utils.parsers import (
    detect_transcript_format,
    parse_plain_transcript,
    parse_srt,
    parse_vtt,
)

logger = logging.getLogger(__name__)

# Common filler words to remove from transcripts before AI analysis
FILLER_WORDS = {
    "um", "uh", "uhm", "umm", "you know", "like", "basically",
    "actually", "right", "so", "well", "i mean", "kind of", "sort of",
}


class IngestionService:
    """Handles parsing and text processing for content analysis."""

    def parse_blog_content(self, raw_content: str) -> dict:
        """Parse blog/written content: extract structure from HTML/markdown.

        Returns a dict with sections, stats, quotes, and full_text.
        """
        text = raw_content

        # Strip HTML tags if present
        text_clean = re.sub(r"<[^>]+>", "", text)

        # Extract headings (markdown ## or HTML <h*>)
        headings = re.findall(r"^#{1,6}\s+(.+)$", text, re.MULTILINE)
        html_headings = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", text, re.IGNORECASE)
        headings.extend(html_headings)

        # Extract statistics (numbers with context)
        statistics = re.findall(
            r"(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?%?|\d+(?:\.\d+)?%)\s+[a-zA-Z]+",
            text_clean,
        )

        # Extract quoted text (both markdown > and quotation marks)
        block_quotes = re.findall(r"^>\s*(.+)$", text, re.MULTILINE)
        inline_quotes = re.findall(r'"([^"]{10,})"', text_clean)
        quotes = block_quotes + inline_quotes

        # Split into paragraphs
        paragraphs = [p.strip() for p in text_clean.split("\n\n") if p.strip()]

        # Extract lists (markdown bullet/numbered)
        list_items = re.findall(r"^[\s]*[-*+]\s+(.+)$", text, re.MULTILINE)
        numbered_items = re.findall(r"^[\s]*\d+\.\s+(.+)$", text, re.MULTILINE)
        list_items.extend(numbered_items)

        # Calculate reading level (simplified Flesch-Kincaid)
        sentences = re.split(r"[.!?]+", text_clean)
        sentences = [s.strip() for s in sentences if s.strip()]
        words = text_clean.split()
        total_words = len(words)
        total_sentences = max(len(sentences), 1)
        total_syllables = sum(self._count_syllables(w) for w in words)

        avg_sentence_length = total_words / total_sentences
        avg_syllables_per_word = total_syllables / max(total_words, 1)

        # Flesch-Kincaid Grade Level
        reading_grade = (
            0.39 * avg_sentence_length + 11.8 * avg_syllables_per_word - 15.59
        )
        reading_grade = max(0, min(reading_grade, 20))

        return {
            "headings": headings,
            "paragraphs": paragraphs,
            "list_items": list_items,
            "statistics": statistics,
            "quotes": quotes,
            "word_count": total_words,
            "sentence_count": total_sentences,
            "avg_sentence_length": round(avg_sentence_length, 1),
            "reading_grade_level": round(reading_grade, 1),
            "full_text": text_clean,
        }

    @staticmethod
    def _count_syllables(word: str) -> int:
        """Approximate syllable count for a word."""
        word = word.lower().strip(".,!?;:\"'()-")
        if not word:
            return 0
        if len(word) <= 3:
            return 1
        # Count vowel groups
        count = len(re.findall(r"[aeiouy]+", word))
        # Subtract silent e
        if word.endswith("e") and not word.endswith("le"):
            count = max(1, count - 1)
        return max(1, count)

    def parse_srt_transcript(self, raw_content: str) -> list[dict]:
        """Parse SRT subtitle format into timestamped segments."""
        return parse_srt(raw_content)

    def parse_vtt_transcript(self, raw_content: str) -> list[dict]:
        """Parse WebVTT format into timestamped segments."""
        return parse_vtt(raw_content)

    def parse_plain_transcript(self, raw_content: str) -> list[dict]:
        """Parse plain text transcript (no timestamps)."""
        return parse_plain_transcript(raw_content)

    def detect_transcript_format(self, raw_content: str) -> str:
        """Detect if content is SRT, VTT, or plain text."""
        return detect_transcript_format(raw_content)

    def extract_clean_text(self, parsed_segments: list[dict]) -> str:
        """Extract clean text from parsed transcript segments for AI analysis.

        Removes filler words and joins text segments.
        """
        texts = [seg.get("text", "") for seg in parsed_segments]
        combined = " ".join(texts)

        # Remove filler words (case-insensitive, word boundaries)
        for filler in sorted(FILLER_WORDS, key=len, reverse=True):
            pattern = r"\b" + re.escape(filler) + r"\b"
            combined = re.sub(pattern, "", combined, flags=re.IGNORECASE)

        # Clean up multiple spaces
        combined = re.sub(r"\s+", " ", combined).strip()

        return combined

    def identify_clip_windows(self, parsed_segments: list[dict]) -> list[dict]:
        """Identify best 30-60 second clip windows from timestamped content.

        Groups segments into 30-60 second windows and scores them by
        text density, question marks (engagement), and exclamation marks (energy).

        Returns top 5 windows with start_time, end_time, text_preview, and score.
        """
        if not parsed_segments:
            return []

        # Filter to segments with valid timestamps
        timed = [s for s in parsed_segments if s.get("end_time", 0) > 0]
        if not timed:
            return []

        total_duration = timed[-1]["end_time"]
        if total_duration <= 0:
            return []

        windows = []
        window_duration = 45.0  # target window size in seconds
        step = 15.0  # sliding step

        current_start = timed[0]["start_time"]

        while current_start < total_duration - 10:
            window_end = min(current_start + window_duration, total_duration)

            # Collect segments in this window
            window_segments = [
                s for s in timed
                if s["start_time"] >= current_start and s["start_time"] < window_end
            ]

            if window_segments:
                window_text = " ".join(s["text"] for s in window_segments)
                actual_start = window_segments[0]["start_time"]
                actual_end = window_segments[-1]["end_time"]
                duration = actual_end - actual_start

                if duration < 10:
                    current_start += step
                    continue

                # Score the window
                word_count = len(window_text.split())
                text_density = word_count / max(duration, 1)
                question_count = window_text.count("?")
                exclamation_count = window_text.count("!")

                score = (
                    text_density * 2.0
                    + question_count * 3.0
                    + exclamation_count * 2.0
                )

                # Prefer 30-60 second windows
                if 30 <= duration <= 60:
                    score *= 1.2

                preview = window_text[:200] + ("..." if len(window_text) > 200 else "")

                windows.append({
                    "start_time": round(actual_start, 2),
                    "end_time": round(actual_end, 2),
                    "duration": round(duration, 2),
                    "text_preview": preview,
                    "score": round(score, 2),
                })

            current_start += step

        # Sort by score descending and return top 5
        windows.sort(key=lambda w: w["score"], reverse=True)
        return windows[:5]
