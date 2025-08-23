# Xplore

Static file explorer and source code cross reference engine.

## Features

### Modern UI

- Tree File View and File Finder
- Statically Load Tree from tree.json
- File jump history
- File Info Status Bar
- MD and HTML Preview
- Image, Audio and Video Player Preview
- Monaco File Editor with Finder, Minimap, Word wrap toggle buttons
- Syntax Highlighting for C, C++, Python, JavaScript, Markdown and more languages
- XREF Source Code Cross Reference Panel and Buttons

### Source Code Cross Reference

- Load tags from tags.json statically built with ctags
- Goto Definition and References
- Find Local and Global Symbol References
- Outline View of Imported Files, Macros, Global Variable, Classes, and Functions
- Jump to Symbols and Imports

## Installation

### Clone Repo

```bash
git clone git@gitlab.com:klabkode/devkit/xplore/xplore-xref.git
```

```bash
cd xplore-xref

make install
```

## Build Xplore Web View

Step into the repository that you want to explore and run.

```bash
xplore-build-xref <repo-name> <repo-url>
```

Example:

```bash
xplore-build-xref "XPLORE" "https://gitlab.com/klabkode/devkit/xplore/xplore-xref"
```

---
