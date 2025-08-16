#!/usr/bin/env python3
import os
import json
import sys
import shutil
import mimetypes
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

ROOT_DIR = "."
KTREE_DIR = "__ktree"
OUTPUT_FILE = os.path.join(KTREE_DIR, "tree.json")
INDEX_FILE = "index.html"
SHARE_SRC = os.path.expanduser("~/.local/share/ktree-monaco")
TEMPLATE_FILE = os.path.join(KTREE_DIR, "index.html.in")

# Exclusion patterns
EXCLUDED_DIRS = {".git", "node_modules", "__pycache__", ".idea", ".vscode", "venv"}
EXCLUDED_FILE_PATTERNS = (
    "~", ".tmp", ".swp", ".bak", ".out", ".o", ".so",
    ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war"
)
EXCLUDED_FILE_NAMES = {".DS_Store", "desktop.ini"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def log(msg, level="INFO"):
    """Improved logging with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

def should_exclude(path):
    """Determine if a path should be excluded"""
    name = os.path.basename(path)

    if os.path.isdir(path):
        return name in EXCLUDED_DIRS or name.startswith('__')

    if (name in EXCLUDED_FILE_NAMES or
        any(name.endswith(patt) for patt in EXCLUDED_FILE_PATTERNS)):
        return True

    return False

def get_file_metadata(path):
    """Get basic metadata for a file"""
    stat_info = os.stat(path)
    return {
        "size": stat_info.st_size,
        "mtime": stat_info.st_mtime,
        "ctime": stat_info.st_ctime,
        "mimetype": mimetypes.guess_type(path)[0] or "application/octet-stream"
    }

def sort_key(name, path):
    """Return tuple for sorting: (category, lowercase name)"""
    is_dir = os.path.isdir(path)
    is_hidden = name.startswith(".")

    # order: hidden folder → folder → hidden file → file
    if is_dir and is_hidden:
        category = 0
    elif is_dir:
        category = 1
    elif is_hidden:
        category = 2
    else:
        category = 3

    return (category, name.lower())

def build_tree(root):
    """Build the directory tree structure"""
    tree = []

    try:
        entries = os.listdir(root)
    except PermissionError as e:
        log(f"Permission denied: {root} - {str(e)}", "WARN")
        return tree
    except Exception as e:
        log(f"Error reading {root}: {str(e)}", "ERROR")
        return tree

    for entry in sorted(entries, key=lambda e: sort_key(e, os.path.join(root, e))):
        path = os.path.join(root, entry)
        rel_path = os.path.relpath(path, ROOT_DIR).replace("\\", "/")

        if should_exclude(path):
            log(f"Excluding: {rel_path}", "DEBUG")
            continue

        try:
            if os.path.isdir(path):
                tree.append({
                    "type": "dir",
                    "name": entry,
                    "path": rel_path,
                    "children": build_tree(path),
                    **get_file_metadata(path)
                })
            else:
                tree.append({
                    "type": "file",
                    "name": entry,
                    "path": rel_path,
                    **get_file_metadata(path)
                })
        except Exception as e:
            log(f"Error processing {path}: {str(e)}", "ERROR")
            continue

    return tree

def render_template(app_name="Xplore", repo_url="#"):
    """Render HTML template with provided values"""
    try:
        env = Environment(loader=FileSystemLoader('.'))
        template = env.get_template(TEMPLATE_FILE)

        rendered = template.render(
            APP_NAME=app_name,
            REPO_URL=repo_url,
            PAGE_TITLE=f"Xplore: {app_name}",
            BUILD_TIME=datetime.now().isoformat()
        )

        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            f.write(rendered)

        log(f"Updated {INDEX_FILE} with app name: '{app_name}'")
        if repo_url != "#":
            log(f"Set repository link to: {repo_url}")

    except Exception as e:
        log(f"Failed to render template: {str(e)}", "ERROR")
        sys.exit(1)

def copy_template_files():
    """Copy template files with error handling"""
    try:
        if not os.path.exists(SHARE_SRC):
            raise FileNotFoundError(f"Template directory not found: {SHARE_SRC}")

        os.makedirs(KTREE_DIR, exist_ok=True)

        for item in os.listdir(SHARE_SRC):
            src = os.path.join(SHARE_SRC, item)
            dst = os.path.join(KTREE_DIR, item)

            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)

        log(f"Copied template files to {KTREE_DIR}")
    except Exception as e:
        log(f"Failed to copy templates: {str(e)}", "ERROR")
        sys.exit(1)

def main():
    # Parse command line arguments
    app_name = "Xplore"  # default value
    repo_url = "#"       # default value

    if len(sys.argv) > 1:
        app_name = sys.argv[1]
    if len(sys.argv) > 2:
        repo_url = sys.argv[2]

    copy_template_files()

    # Build file tree structure
    log(f"Scanning '{ROOT_DIR}'...")
    tree = build_tree(ROOT_DIR)

    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(tree, f, indent=2, ensure_ascii=False)
        log(f"Wrote file tree → {OUTPUT_FILE} ({len(tree)} entries)")
    except Exception as e:
        log(f"Failed to save tree.json: {str(e)}", "ERROR")
        sys.exit(1)

    # Render HTML template
    render_template(app_name, repo_url)

if __name__ == "__main__":
    main()
