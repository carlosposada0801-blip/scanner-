"""Registry of available retailer sources. Add new ones here."""
from sources.base import Source, SourceError
from sources.bestbuy import BestBuySource
from sources.keepa import KeepaSource

SOURCES: dict[str, type[Source]] = {
    BestBuySource.name: BestBuySource,
    KeepaSource.name: KeepaSource,
    # "walmart": WalmartSource,   # future
}

__all__ = ["SOURCES", "Source", "SourceError"]
