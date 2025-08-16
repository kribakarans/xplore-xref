#!/usr/bin/env python3
import os
import json
import sys
from jinja2 import Environment, FileSystemLoader

ROOT_DIR = "files"
OUTPUT_DIR = "data"
HTML_DIR = "html"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "tree.json")
TEMPLATE_FILE = os.path.join(HTML_DIR, "index.html.in")
INDEX_FILE = "index.html"

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
    entries = os.listdir(root)

    for entry in sorted(entries, key=lambda e: sort_key(e, os.path.join(root, e))):
        path = os.path.join(root, entry)
        rel_path = os.path.relpath(path, ROOT_DIR).replace("\\", "/")

        if os.path.isdir(path):
            tree.append({
                "type": "dir",
                "name": entry,
                "path": rel_path,
                "children": build_tree(path)
            })
        else:
            tree.append({
                "type": "file",
                "name": entry,
                "path": rel_path
            })
    return tree

def render_template(app_name="Xplore", repo_url="#"):
    """Render the HTML template with provided values"""
    try:
        env = Environment(loader=FileSystemLoader('.'))
        template = env.get_template(TEMPLATE_FILE)

        rendered = template.render(
            APP_NAME=app_name,
            REPO_URL=repo_url,
            PAGE_TITLE=f"Xplore: {app_name}"
        )

        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            f.write(rendered)

        print(f"[Build] Updated {INDEX_FILE} with app name: '{app_name}'")
        if repo_url != "#":
            print(f"[Build] Set repository link to: {repo_url}")

    except Exception as e:
        print(f"[Error] Failed to render template: {str(e)}")
        sys.exit(1)

def main():
    # Parse command line arguments
    app_name = "Xplore"  # default value
    repo_url = "#"       # default value

    if len(sys.argv) > 1:
        app_name = sys.argv[1]
    if len(sys.argv) > 2:
        repo_url = sys.argv[2]

    # Build file tree structure
    print(f"[Build] Scanning '{ROOT_DIR}'...")
    tree = build_tree(ROOT_DIR)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=2)
    print(f"[Build] Wrote file tree → {OUTPUT_FILE}")

    # Render HTML template
    render_template(app_name, repo_url)

if __name__ == "__main__":
    main()
