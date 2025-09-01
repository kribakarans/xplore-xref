#!/usr/bin/env python3
import os
import json
import sys
import shutil
import mimetypes
import subprocess
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

ROOT_DIR = "."
HTML_DIR = "__xplore"
INDEX_FILE = "index.html"
TREE_DATA = os.path.join(HTML_DIR, "tree.json")
TEMPLATE_FILE = os.path.join(HTML_DIR, "index.html.in")
SHARE_SRC = os.path.expanduser("~/.local/share/xplore-xref")
TAGS_FILE = os.path.join(HTML_DIR, "tags.json")

# Exclusion patterns
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
EXCLUDED_FILE_PATTERNS = (
    "~", ".tmp", ".swp", ".bak", ".out", ".o", ".so",
    ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war"
)
EXCLUDED_FILE_NAMES = {".DS_Store", "desktop.ini"}
EXCLUDED_DIRS = {".git", ".github", "__ktags", "__html", "node_modules", "__pycache__", ".idea", ".vscode", "venv"}

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

        os.makedirs(HTML_DIR, exist_ok=True)

        for item in os.listdir(SHARE_SRC):
            src = os.path.join(SHARE_SRC, item)
            dst = os.path.join(HTML_DIR, item)

            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)

        log(f"Copied template files to {HTML_DIR}")
    except Exception as e:
        log(f"Failed to copy templates: {str(e)}", "ERROR")
        sys.exit(1)

def build_xref(root: str = ROOT_DIR, outfile: str = TAGS_FILE) -> bool:
    """
    Generate a Universal Ctags cross-reference database (JSON) for a multi-language project.

    Python port of:
        ctags -R --output-format=json --fields=+nKlsiaSt --extras=+q \
              --kinds-C=+p --kinds-C++=+p \
              --languages=C,C++,Python,Java,Sh,Make -f __xplore/tags.json .

    Args:
        root: Directory to index recursively.
        outfile: Output JSON file path.

    Returns:
        True on success, False otherwise.
    """
    # Ensure output directory exists
    try:
        os.makedirs(os.path.dirname(outfile), exist_ok=True)
    except Exception as e:
        log(f"Failed to ensure tags directory: {e}", "ERROR")
        return False

    # Check ctags availability
    if shutil.which("ctags") is None:
        log("Universal Ctags ('ctags') not found in PATH. Please install it.", "ERROR")
        return False

    # Remove stale file
    try:
        if os.path.exists(outfile):
            os.remove(outfile)
    except Exception as e:
        log(f"Failed to remove existing tags file '{outfile}': {e}", "WARN")

    log(f"Generating ctags database into {outfile}", "INFO")

    cmd = [
        "ctags",
        "-R",
        "--output-format=json",
        "--fields=+nKlsiaSt",
        "--extras=+q",
        "--kinds-C=+p",
        "--kinds-C++=+p",
        "--languages=C,C++,Python,Java,Sh,Make",
        "-f", outfile,
        root,
    ]

    try:
        result = subprocess.run(
            cmd,
            check=False,
            text=True,
            capture_output=True,
        )

        if result.stdout:
            log(result.stdout.strip(), "DEBUG")
        if result.stderr:
            level = "ERROR" if result.returncode != 0 else "DEBUG"
            log(result.stderr.strip(), level)

        if result.returncode == 0 and os.path.exists(outfile):
            log(f"Tags JSON generated successfully: {outfile}", "INFO")
            return True

        log("Failed to generate tags (ctags returned non-zero exit code).", "ERROR")
        return False

    except FileNotFoundError:
        log("ctags executable not found. Ensure Universal Ctags is installed.", "ERROR")
        return False
    except Exception as e:
        log(f"Unexpected error while running ctags: {e}", "ERROR")
        return False

def create_viewport_link():
    """Ensure viewport.html at project root points to __xplore/viewport.html"""
    target = os.path.join(HTML_DIR, "viewport.html")
    link = "viewport.html"

    try:
        # Remove stale file/link if exists
        if os.path.lexists(link):  # handles both symlink and file
            os.remove(link)

        os.symlink(target, link)
        log(f"Created symlink: {link} -> {target}")
    except (OSError, NotImplementedError) as e:
        # Fallback: copy instead of symlink
        try:
            shutil.copy2(target, link)
            log(f"Copied viewport.html to root (symlink unavailable: {e})", "WARN")
        except Exception as e2:
            log(f"Failed to place viewport.html at root: {e2}", "ERROR")


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
        with open(TREE_DATA, 'w', encoding='utf-8') as f:
            json.dump(tree, f, indent=2, ensure_ascii=False)
        log(f"Wrote file tree → {TREE_DATA} ({len(tree)} entries)")
    except Exception as e:
        log(f"Failed to save tree.json: {str(e)}", "ERROR")
        sys.exit(1)

    # Generate tags database (xref). Non-fatal if it fails; proceed with HTML.
    if not build_xref(ROOT_DIR, TAGS_FILE):
        log("Continuing without tags.json due to previous error.", "WARN")

    # Render HTML template
    render_template(app_name, repo_url)

    # Ensure viewport.html link is created
    create_viewport_link()

if __name__ == "__main__":
    main()
