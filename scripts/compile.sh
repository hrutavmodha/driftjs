#!/bin/bash
# Compilation script to convert markdown draft to PDF

# Change directory to the workspace root directory containing the docs folder
cd "$(dirname "$0")/.."

echo "Compiling docs/project-title.md to docs/project-title.pdf..."
pandoc docs/project-title.md -o docs/project-title.pdf -V geometry:margin=0.75in

if [ $? -eq 0 ]; then
  echo "Compilation successful!"
else
  echo "Compilation failed."
  exit 1
fi
