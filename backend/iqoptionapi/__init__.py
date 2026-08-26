"""
IQ Option API - Stable API Version 6.8.9.1
Community Release with enhanced WebSocket resiliency, Martingale support,
and automated Turbo/Digital option execution.
"""

__version__ = "6.8.9.1"
__author__ = "IQ Option Community"

from iqoptionapi.stable_api import IQ_Option

__all__ = ["IQ_Option", "__version__"]
