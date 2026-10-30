"""Find deleted photos from Apple devices.

Looks in the places deleted photos actually survive: local iPhone/iPad backups,
the Mac Photos library, and raw disk images / memory cards. Never modifies the
source data; everything found is copied into a new output folder.
"""

__version__ = "1.0.0"
