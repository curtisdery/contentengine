"""Standalone parser utilities for transcript and content formats."""

import re


def parse_srt_timestamp(ts: str) -> float:
    """Convert an SRT timestamp (HH:MM:SS,mmm) to seconds as a float."""
    match = re.match(r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})", ts.strip())
    if not match:
        return 0.0
    hours, minutes, seconds, millis = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def parse_vtt_timestamp(ts: str) -> float:
    """Convert a WebVTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds as a float."""
    ts = ts.strip()
    # Handle HH:MM:SS.mmm
    match = re.match(r"(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})", ts)
    if match:
        hours, minutes, seconds, millis = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000
    # Handle MM:SS.mmm
    match = re.match(r"(\d{1,2}):(\d{2})\.(\d{3})", ts)
    if match:
        minutes, seconds, millis = match.groups()
        return int(minutes) * 60 + int(seconds) + int(millis) / 1000
    return 0.0


def parse_srt(raw_content: str) -> list[dict]:
    """Parse SRT subtitle format into timestamped segments.

    SRT format:
        1
        00:00:01,000 --> 00:00:04,000
        Hello world

        2
        00:00:05,000 --> 00:00:08,000
        This is a test

    Returns list of {start_time: float, end_time: float, text: str}
    """
    segments = []
    blocks = re.split(r"\n\s*\n", raw_content.strip())

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue

        # Find the timecode line (contains " --> ")
        timecode_line = None
        timecode_idx = -1
        for i, line in enumerate(lines):
            if " --> " in line:
                timecode_line = line
                timecode_idx = i
                break

        if timecode_line is None:
            continue

        parts = timecode_line.split(" --> ")
        if len(parts) != 2:
            continue

        start_time = parse_srt_timestamp(parts[0])
        end_time = parse_srt_timestamp(parts[1])

        # Text is everything after the timecode line
        text_lines = lines[timecode_idx + 1:]
        text = " ".join(line.strip() for line in text_lines if line.strip())

        if text:
            segments.append({
                "start_time": start_time,
                "end_time": end_time,
                "text": text,
            })

    return segments


def parse_vtt(raw_content: str) -> list[dict]:
    """Parse WebVTT format into timestamped segments.

    VTT format:
        WEBVTT

        00:00:01.000 --> 00:00:04.000
        Hello world

        00:00:05.000 --> 00:00:08.000
        This is a test

    Returns list of {start_time: float, end_time: float, text: str}
    """
    segments = []

    # Remove the WEBVTT header and any metadata before the first cue
    content = raw_content.strip()
    if content.startswith("WEBVTT"):
        # Skip the header line and any following metadata lines
        header_end = content.find("\n\n")
        if header_end != -1:
            content = content[header_end:]
        else:
            # Only header, no cues
            return segments

    blocks = re.split(r"\n\s*\n", content.strip())

    for block in blocks:
        lines = block.strip().split("\n")
        if not lines:
            continue

        # Find the timecode line (contains " --> ")
        timecode_line = None
        timecode_idx = -1
        for i, line in enumerate(lines):
            if " --> " in line:
                timecode_line = line
                timecode_idx = i
                break

        if timecode_line is None:
            continue

        # Remove positioning/styling info after timecodes
        timecode_part = timecode_line.split(" --> ")
        if len(timecode_part) != 2:
            continue

        start_str = timecode_part[0].strip()
        # End time may have positioning info after it
        end_str = timecode_part[1].strip().split(" ")[0]

        start_time = parse_vtt_timestamp(start_str)
        end_time = parse_vtt_timestamp(end_str)

        # Text is everything after the timecode line
        text_lines = lines[timecode_idx + 1:]
        text = " ".join(line.strip() for line in text_lines if line.strip())

        if text:
            segments.append({
                "start_time": start_time,
                "end_time": end_time,
                "text": text,
            })

    return segments


def parse_plain_transcript(raw_content: str) -> list[dict]:
    """Parse plain text transcript (no timestamps).

    Detects speaker labels like 'Host:', 'Guest:', 'Speaker 1:'.
    Returns list of {speaker: str | None, text: str}
    """
    segments = []
    speaker_pattern = re.compile(r"^([A-Za-z][A-Za-z0-9 ]*\s*\d*)\s*:\s*(.+)", re.MULTILINE)

    paragraphs = re.split(r"\n\s*\n", raw_content.strip())

    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        # Check if paragraph starts with a speaker label
        match = speaker_pattern.match(paragraph)
        if match:
            speaker = match.group(1).strip()
            text = match.group(2).strip()
            # Also capture remaining lines in the paragraph
            remaining_lines = paragraph[match.end():].strip()
            if remaining_lines:
                text = text + " " + " ".join(
                    line.strip() for line in remaining_lines.split("\n") if line.strip()
                )
            segments.append({"speaker": speaker, "text": text})
        else:
            # No speaker label — treat as continuation or standalone
            text = " ".join(line.strip() for line in paragraph.split("\n") if line.strip())
            segments.append({"speaker": None, "text": text})

    return segments


def detect_transcript_format(raw_content: str) -> str:
    """Detect if content is SRT, VTT, or plain text.

    Returns: 'srt', 'vtt', or 'plain'
    """
    content = raw_content.strip()

    # Check for WebVTT header
    if content.startswith("WEBVTT"):
        return "vtt"

    # Check for SRT pattern: digit(s) on a line, followed by timecode with comma separator
    srt_pattern = re.compile(
        r"^\d+\s*\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}",
        re.MULTILINE,
    )
    if srt_pattern.search(content):
        return "srt"

    return "plain"
