from __future__ import annotations

from dataclasses import dataclass
import unicodedata


EMOJI_REPLIES: dict[str, str] = {
    "😊": "很高兴见到您！想了解景点、路线还是演出安排呢？",
    "😄": "看到您心情不错！祝您在灵山胜境游览愉快。",
    "👍": "谢谢您的认可！我可以继续为您介绍更多景点。",
    "❤️": "感谢您的喜欢！愿这段灵山之旅给您留下美好回忆。",
    "🙏": "谢谢您的祝福！愿您旅途顺心、平安愉快。",
    "🤩": "灵山还有很多精彩看点，要不要继续听我介绍？",
    "👏": "谢谢鼓励！我会继续为您提供清晰的导览讲解。",
    "🌸": "愿您在灵山胜境收获一段轻松、美好的旅程。",
}

GENERIC_POSITIVE_REPLY = "谢谢您的积极互动！我会继续陪您了解灵山胜境。"


@dataclass(frozen=True)
class EmojiInteraction:
    is_pure_emoji: bool
    emoji_value: str
    reply: str


def identify_emoji_interaction(value: str) -> EmojiInteraction | None:
    compact = "".join(value.split())
    if not compact or not all(_is_emoji_character(character) for character in compact):
        return None

    supported = _supported_emojis_in(compact)
    if supported and _remove_supported_emojis(compact) == "":
        distinct = set(supported)
        if len(distinct) == 1:
            emoji = supported[0]
            return EmojiInteraction(True, emoji, EMOJI_REPLIES[emoji])
        return EmojiInteraction(True, "mixed", GENERIC_POSITIVE_REPLY)

    return EmojiInteraction(True, "other", GENERIC_POSITIVE_REPLY)


def strip_emojis(value: str) -> str:
    cleaned = value
    for emoji in sorted(EMOJI_REPLIES, key=len, reverse=True):
        cleaned = cleaned.replace(emoji, "")
    return "".join(
        character for character in cleaned if not _is_emoji_character(character)
    )


def _supported_emojis_in(value: str) -> list[str]:
    remaining = value
    result: list[str] = []
    supported = sorted(EMOJI_REPLIES, key=len, reverse=True)
    while remaining:
        matched = next((emoji for emoji in supported if remaining.startswith(emoji)), None)
        if matched is None:
            remaining = remaining[1:]
            continue
        result.append(matched)
        remaining = remaining[len(matched) :]
    return result


def _remove_supported_emojis(value: str) -> str:
    remaining = value
    for emoji in sorted(EMOJI_REPLIES, key=len, reverse=True):
        remaining = remaining.replace(emoji, "")
    return remaining


def _is_emoji_character(character: str) -> bool:
    codepoint = ord(character)
    if character in {"\u200d", "\ufe0e", "\ufe0f", "\u20e3"}:
        return True
    if 0x1F3FB <= codepoint <= 0x1F3FF:
        return True
    if 0x1F000 <= codepoint <= 0x1FAFF:
        return True
    if 0x2600 <= codepoint <= 0x27BF:
        return True
    if 0x2300 <= codepoint <= 0x23FF:
        return True
    return unicodedata.category(character) == "So"
