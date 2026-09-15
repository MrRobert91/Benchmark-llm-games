"""Paper-faithful Moloch Arena V1 implementation."""

from .engine import PaperGame
from .spec import PAPER_SPEC, PaperAction, PaperSpec

__all__ = ["PAPER_SPEC", "PaperAction", "PaperGame", "PaperSpec"]
