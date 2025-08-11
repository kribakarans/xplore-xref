#!/usr/bin/env python3
from flask import Flask, jsonify, request
from pathlib import Path
import traceback

app = Flask(__name__, static_folder="static", static_url_path="")

# Serve files from ./files folder
ROOT_DIR = (Path(__file__).parent / "files").resolve()

@app.route("/")
def index():
    return app.send_static_file("index.html")

def safe_resolve_within_root(rel_path: str) -> Path:
    """
    Resolve a user-supplied relative path and ensure it is inside ROOT_DIR.
    Raises ValueError if outside ROOT_DIR.
    """
    candidate = (ROOT_DIR / rel_path).resolve()
    try:
        candidate.relative_to(ROOT_DIR)
    except Exception:
        raise ValueError("Path is outside the allowed root")
    return candidate

@app.route("/api/tree")
def get_tree():
    rel_path = request.args.get("path", "").strip()
    try:
        target_dir = safe_resolve_within_root(rel_path) if rel_path else ROOT_DIR
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400

    if not target_dir.exists() or not target_dir.is_dir():
        return jsonify({"error": "Directory not found"}), 404

    items = []
    try:
        for entry in target_dir.iterdir():
            entry_type = "dir" if entry.is_dir() else "file"
            items.append({
                "name": entry.name,
                # use POSIX-style relative path for consistency in frontend
                "path": str(entry.relative_to(ROOT_DIR).as_posix()),
                "type": entry_type
            })
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not read directory"}), 500

    # Sort: directories first, then files; both case-insensitive
    items.sort(key=lambda e: (0 if e["type"] == "dir" else 1, e["name"].lower()))
    return jsonify(items)

@app.route("/api/file")
def get_file():
    rel_path = request.args.get("path", "").strip()
    if not rel_path:
        return jsonify({"error": "Missing path parameter"}), 400
    try:
        file_path = safe_resolve_within_root(rel_path)
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400

    if not file_path.exists() or not file_path.is_file():
        return jsonify({"error": "File not found"}), 404

    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = None

    if content is None:
        # Binary file fallback message (don't attempt to send binary data here)
        return jsonify({
            "name": file_path.name,
            "path": str(file_path.relative_to(ROOT_DIR).as_posix()),
            "content": None,
            "binary": True,
            "message": "Cannot display binary file."
        })

    return jsonify({
        "name": file_path.name,
        "path": str(file_path.relative_to(ROOT_DIR).as_posix()),
        "content": content,
        "binary": False
    })

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8000)
