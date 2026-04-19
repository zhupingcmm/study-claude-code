"""General-purpose utility functions."""

import re
from typing import Any


def slugify(text: str) -> str:
    """Convert a string to a URL-friendly slug.

    Args:
        text: The input string to slugify.

    Returns:
        A lowercased, hyphen-separated slug with non-alphanumeric
        characters removed.

    Examples:
        >>> slugify("Hello, World!")
        'hello-world'
    """
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def clamp(value: float, low: float, high: float) -> float:
    """Clamp a numeric value between a minimum and maximum.

    Args:
        value: The number to clamp.
        low: The lower bound.
        high: The upper bound.

    Returns:
        The clamped value.

    Raises:
        ValueError: If low is greater than high.

    Examples:
        >>> clamp(15, 0, 10)
        10
    """
    if low > high:
        raise ValueError(f"low ({low}) must not be greater than high ({high})")
    return max(low, min(value, high))


def flatten(nested: list[Any]) -> list[Any]:
    """Recursively flatten a nested list structure.

    Args:
        nested: A potentially nested list.

    Returns:
        A single flat list containing all leaf elements.

    Examples:
        >>> flatten([1, [2, [3, 4], 5]])
        [1, 2, 3, 4, 5]
    """
    result: list[Any] = []
    for item in nested:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result
