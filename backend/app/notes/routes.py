"""
Course notes API — serves scraped ZipTrader U markdown files.
Notes are stored on disk as markdown files organized by module folder.
"""

import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# Notes directory — look for it in several locations
_NOTES_CANDIDATES = [
    Path(__file__).parent.parent.parent / "course-notes",      # backend/course-notes/
    Path(__file__).parent.parent.parent.parent / "course-notes", # repo root/course-notes/
]

def _get_notes_dir() -> Optional[Path]:
    for p in _NOTES_CANDIDATES:
        if p.exists() and p.is_dir():
            return p
    return None


def _parse_module_dir(dirname: str) -> dict:
    """Parse '07-Fundamentals' → {num: '07', name: 'Fundamentals', slug: '07-Fundamentals'}"""
    match = re.match(r"^(\d{2})-(.+)$", dirname)
    if not match:
        return None
    return {
        "num": match.group(1),
        "name": match.group(2).replace("-", " "),
        "slug": dirname,
    }


def _parse_lesson_file(filename: str) -> dict:
    """Parse '05-03-MACD-Crossovers.md' → {module: '05', lesson: '03', title: 'MACD Crossovers', filename: ...}"""
    match = re.match(r"^(\d{2})-(\d{2})-(.+)\.md$", filename)
    if not match:
        return None
    return {
        "module_num": match.group(1),
        "lesson_num": match.group(2),
        "title": match.group(3).replace("-", " "),
        "filename": filename,
    }


@router.get("/modules")
async def list_modules():
    """List all course modules with lesson counts."""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return {"modules": [], "notes_dir_found": False}

    modules = []
    for entry in sorted(notes_dir.iterdir()):
        if not entry.is_dir():
            continue
        parsed = _parse_module_dir(entry.name)
        if not parsed:
            continue
        # Count lessons
        lessons = [f for f in entry.iterdir() if f.suffix == ".md"]
        parsed["lesson_count"] = len(lessons)
        modules.append(parsed)

    return {"modules": modules, "notes_dir_found": True}


@router.get("/modules/{module_slug}/lessons")
async def list_lessons(module_slug: str):
    """List all lessons in a module."""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        raise HTTPException(status_code=404, detail="Notes directory not found")

    module_path = notes_dir / module_slug
    if not module_path.exists():
        raise HTTPException(status_code=404, detail=f"Module '{module_slug}' not found")

    lessons = []
    for f in sorted(module_path.iterdir()):
        if f.suffix != ".md":
            continue
        parsed = _parse_lesson_file(f.name)
        if parsed:
            # Read first line for the actual title from markdown
            try:
                first_line = f.read_text(encoding="utf-8").split("\n")[0]
                if first_line.startswith("# "):
                    parsed["title"] = first_line[2:].strip()
            except Exception:
                pass
            lessons.append(parsed)

    return {"lessons": lessons, "module_slug": module_slug}


@router.get("/modules/{module_slug}/lessons/{filename}")
async def get_lesson(module_slug: str, filename: str):
    """Get the full markdown content of a lesson."""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        raise HTTPException(status_code=404, detail="Notes directory not found")

    # Sanitize filename to prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = notes_dir / module_slug / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Lesson not found")

    content = file_path.read_text(encoding="utf-8")

    # Parse metadata from content
    parsed = _parse_lesson_file(filename)
    title = parsed["title"] if parsed else filename
    # Override with actual H1 from markdown
    first_line = content.split("\n")[0]
    if first_line.startswith("# "):
        title = first_line[2:].strip()

    return {
        "filename": filename,
        "module_slug": module_slug,
        "title": title,
        "content": content,
    }


@router.get("/search")
async def search_notes(q: str = Query(..., min_length=2)):
    """Full-text search across all course notes."""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return {"results": [], "query": q}

    query_lower = q.lower()
    results = []

    for module_dir in sorted(notes_dir.iterdir()):
        if not module_dir.is_dir():
            continue
        module_parsed = _parse_module_dir(module_dir.name)
        if not module_parsed:
            continue

        for f in sorted(module_dir.iterdir()):
            if f.suffix != ".md":
                continue
            try:
                content = f.read_text(encoding="utf-8")
            except Exception:
                continue

            if query_lower not in content.lower():
                continue

            lesson_parsed = _parse_lesson_file(f.name)
            title = lesson_parsed["title"] if lesson_parsed else f.stem

            # Get actual title from H1
            first_line = content.split("\n")[0]
            if first_line.startswith("# "):
                title = first_line[2:].strip()

            # Find matching lines for context snippets
            snippets = []
            for i, line in enumerate(content.split("\n")):
                if query_lower in line.lower() and line.strip():
                    snippets.append(line.strip()[:150])
                    if len(snippets) >= 3:
                        break

            results.append({
                "module_slug": module_dir.name,
                "module_name": module_parsed["name"],
                "module_num": module_parsed["num"],
                "filename": f.name,
                "title": title,
                "snippets": snippets,
            })

    return {"results": results, "query": q, "count": len(results)}
