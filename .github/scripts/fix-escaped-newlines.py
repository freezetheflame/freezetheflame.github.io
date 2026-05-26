#!/usr/bin/env python3
"""Fix escaped newlines in markdown files from WordPress export.

WordPress export left literal \n (backslash-n, 0x5C 0x6E) sequences
in the markdown that render as visible text. This script replaces
them with actual newlines while preserving frontmatter, code blocks,
and inline code.
"""

import re
import sys
from pathlib import Path


def fix_content(body: str) -> str:
    """Fix escaped newline sequences in markdown body content."""
    
    # Strategy:
    # 1. Protect code blocks (```) and inline code (`) from mutation
    # 2. Replace literal \n sequences with actual newlines
    # 3. Collapse excessive blank lines
    # 4. Restore code blocks
    
    protected = {}
    counter = [0]
    
    def protect(match):
        idx = counter[0]
        counter[0] += 1
        key = f'\x00PROTECTED_{idx}\x00'
        protected[key] = match.group(0)
        return key
    
    # Protect fenced code blocks first (they may contain backtick pairs)
    body = re.sub(r'```[\s\S]*?```', protect, body)
    # Protect inline code
    body = re.sub(r'`[^`]+`', protect, body)
    
    # Now fix escaped newlines in non-code content
    # \n\n\n\n (8 chars) → two actual newlines (blank line separator)
    body = body.replace('\\n\\n\\n\\n', '\n\n')
    # \n\n\n → two newlines
    body = body.replace('\\n\\n\\n', '\n\n')
    # \n\n → one newline (invisible separator)
    body = body.replace('\\n\\n', '\n')
    # Lone \n that's on its own line → remove entirely
    body = re.sub(r'^\\n$', '', body, flags=re.MULTILINE)
    # Any remaining \n → actual newline
    body = body.replace('\\n', '\n')
    
    # Collapse 3+ consecutive blank lines into 2
    body = re.sub(r'\n{3,}', '\n\n', body)
    
    # Clean up: remove lines that are just whitespace
    body = re.sub(r'\n[ \t]+\n', '\n\n', body)
    
    # Restore protected blocks
    for key, original in protected.items():
        body = body.replace(key, original)
    
    return body


def fix_file(filepath: Path) -> bool:
    """Fix a single markdown file. Returns True if changes were made."""
    try:
        content = filepath.read_text(encoding='utf-8')
    except Exception as e:
        print(f'  ERROR reading {filepath}: {e}', file=sys.stderr)
        return False
    
    original = content
    
    # Split frontmatter from body
    # Frontmatter is ---\n...\n---\n
    if content.startswith('---\n'):
        # Find closing ---
        end_idx = content.find('\n---\n', 4)
        if end_idx != -1:
            frontmatter = content[:end_idx + 5]  # include \n---\n
            body = content[end_idx + 5:]
        else:
            frontmatter = ''
            body = content
    else:
        frontmatter = ''
        body = content
    
    # Fix the body
    fixed_body = fix_content(body)
    
    # Reconstruct
    new_content = frontmatter + fixed_body
    
    # Clean up trailing whitespace
    new_content = new_content.rstrip() + '\n'
    
    if new_content != original:
        filepath.write_text(new_content, encoding='utf-8')
        return True
    
    return False


def main():
    posts_dir = Path('posts')
    if not posts_dir.is_dir():
        print('Error: posts/ directory not found. Run from repo root.', file=sys.stderr)
        sys.exit(1)
    
    md_files = sorted(posts_dir.rglob('*.md'))
    # Skip index.md
    md_files = [f for f in md_files if f.name != 'index.md']
    
    print(f'Found {len(md_files)} markdown files to check...')
    fixed = 0
    
    for f in md_files:
        if fix_file(f):
            fixed += 1
            print(f'  FIXED: {f}')
    
    print(f'\nDone. Fixed {fixed} of {len(md_files)} files.')


if __name__ == '__main__':
    main()
