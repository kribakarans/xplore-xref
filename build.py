#!/usr/bin/env python3
import os
import json

ROOT_DIR = "files"     # folder containing your hosted files
OUTPUT_DIR = "data"    # where tree.json will be saved
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "tree.json")


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


def main():
    print(f"[Build] Scanning '{ROOT_DIR}' ...")
    tree = build_tree(ROOT_DIR)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=2)

    print(f"[Build] Wrote file tree → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
