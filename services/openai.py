"""OpenAI / Perplexity client — reusable across features."""

import os

from openai import OpenAI


def get_perplexity_client() -> OpenAI | None:
    """Return a Perplexity-flavored OpenAI client, or None if no key is set."""
    api_key = os.environ.get("PERPLEXITY_API_KEY", "")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url="https://api.perplexity.ai")
