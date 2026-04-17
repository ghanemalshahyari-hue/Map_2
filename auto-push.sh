#!/bin/bash
# Auto-sync script: fetches remote changes + commits and pushes local changes
# Watches every 30 seconds

REPO_DIR="c:/Users/coraz/OneDrive/Desktop/UI_MOdified"
cd "$REPO_DIR"

echo "Auto-sync started. Watching for changes every 30 seconds..."
echo "Press Ctrl+C to stop."

while true; do
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

    # Fetch and pull remote changes first
    git fetch origin master 2>/dev/null
    LOCAL=$(git rev-parse master 2>/dev/null)
    REMOTE=$(git rev-parse origin/master 2>/dev/null)

    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "[$TIMESTAMP] Remote changes detected, pulling..."
        git stash 2>/dev/null
        git pull --rebase origin master
        git stash pop 2>/dev/null
        echo "[$TIMESTAMP] Pulled remote changes!"
    fi

    # Check if there are any local changes
    if [ -n "$(git status --porcelain)" ]; then
        TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
        echo "[$TIMESTAMP] Local changes detected, pushing..."

        git add -A
        git commit -m "Auto-update: $TIMESTAMP"
        git push origin master

        echo "[$TIMESTAMP] Pushed successfully!"
    fi

    sleep 30
done
